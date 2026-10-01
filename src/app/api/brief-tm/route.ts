// Vue RM : le brief et l'analyse « data analyst » du 1:1 d'un RM avec l'un de SES TM.
// Reçoit { tmId, mois } ; relit tout côté serveur (la ligne agrégée du TM et le détail de tous ses sales dans le BI
// importé par le RM, les engagements du 1:1 précédent) et renvoie brief (+ analyse) et sujets.
// Le navigateur les range dans la fiche, qui s'enregistre dans entretiens_tm (comme le brief d'un sales dans entretiens).
import { type BriefReponse } from "@/lib/brief";
import { lireReponseBriefTm, promptBriefTm } from "@/lib/brief-tm";
import { getBiDuTm, getEntretiensTm } from "@/lib/bi-rm";
import { getCommerciauxDesTM } from "@/lib/commerciaux";
import { type EchecGemini, genererAvecSecours } from "@/lib/gemini";
import { nombresDe, valeursAutorisees, verifierBrief, verifierSujets } from "@/lib/garde-fou";
import { construireSujets, contexteEquipe, problemes } from "@/lib/gravite";
import { kpisDuBi } from "@/lib/lecture-bi-rm";
import { repFromKpis } from "@/lib/momento";
import { getCurrentManager, getMesTM } from "@/lib/managers";
import { isMonthLabel, previousMonthLabel } from "@/lib/mois";
import { engagements } from "@/lib/suivi";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

function erreur(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies BriefReponse, { status });
}

// Mêmes messages que le brief d'un sales.
const MESSAGES: Record<EchecGemini, { message: string; status: number }> = {
  quota: { message: "Trop de demandes en peu de temps, patiente 1 minute et réessaie.", status: 429 },
  indisponible: { message: "Les serveurs de Google sont surchargés pour le moment, réessaie dans un instant.", status: 503 },
  illisible: { message: "Gemini a renvoyé une analyse incomplète. Réessaie.", status: 422 },
  images: { message: "Gemini a refusé la demande. Réessaie dans un instant.", status: 422 },
  cle: { message: "Clé Gemini refusée : vérifie GEMINI_API_KEY dans .env.local.", status: 500 },
  "aucun-modele": {
    message: "Aucun des modèles Gemini configurés n'est disponible pour ta clé : vérifie GEMINI_MODELS dans .env.local.",
    status: 500,
  },
};

export async function POST(request: Request) {
  // Le proxy bloque déjà les visiteurs non connectés ; ici on vérifie en plus que c'est un RM.
  const manager = await getCurrentManager();
  if (!manager) return erreur("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);
  if (manager.role !== "RM") return erreur("Brief réservé aux RM.", 403);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreur("Brief IA indisponible : clé Gemini non configurée.", 500);

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return erreur("Demande invalide.", 400);
  }
  const { tmId, mois } = (corps ?? {}) as Record<string, unknown>;
  if (typeof mois !== "string" || !isMonthLabel(mois)) return erreur("Mois invalide.", 400);

  // Uniquement un des TM du RM connecté.
  const tm = (await getMesTM()).find((t) => t.id === tmId);
  if (!tm) return erreur("Ce TM ne fait pas partie de tes TM.", 403);

  const moisPrecedent = previousMonthLabel(mois);
  const [bi, entretiens] = await Promise.all([getBiDuTm(tm.id, mois), getEntretiensTm([moisPrecedent])]);
  if (!bi.tm) {
    return erreur(`Le BI de ${mois.toLowerCase()} n'a pas encore été importé pour ${tm.nom} (onglet Import & chiffres).`, 422);
  }

  const engagementsPasses = engagements(entretiens[moisPrecedent]?.[tm.id], kpisDuBi(bi.tm.donnees));
  // Effectif réel du mois pour les objectifs d'équipe : les sales de ce TM dans le BI (partis compris), sinon son roster.
  const nbActifs = bi.effectif || (await getCommerciauxDesTM([tm.id])).length;
  const prompt = promptBriefTm({
    nbActifs,
    nomTm: tm.nom,
    mois,
    moisPrecedent,
    tm: bi.tm,
    sales: bi.sales,
    // Même logique que pour un sales : les objectifs chiffrés du mois dernier comparés aux chiffres du TM ce mois-ci.
    engagements: engagementsPasses,
  });

  // Le détail des échecs est journalisé côté serveur ; le navigateur ne reçoit qu'un message clair.
  const genereLe = new Date().toISOString();
  const resultat = await genererAvecSecours(apiKey, prompt, (texte) => lireReponseBriefTm(texte, genereLe));
  if (!resultat.ok) {
    const { message, status } = MESSAGES[resultat.raison];
    return erreur(message, status, resultat.raison === "indisponible" || resultat.raison === "illisible");
  }
  console.info(`[brief-tm] Brief de ${tm.nom} (${mois}, ${bi.sales.length} sales) préparé par ${resultat.modele}`);

  // Garde-fou : tout nombre cité qui n'est dans aucune valeur fournie (BI du TM et de ses sales, engagements) est marqué « à vérifier ».
  const autorisees = valeursAutorisees(
    [
      // Les objectifs d'équipe cités par l'IA sont des faits (effectif × 4 pour les POS, × 5 pour l'OG).
      nbActifs * 4,
      nbActifs * 5,
      nbActifs,
      ...[bi.tm, ...bi.sales].flatMap((l) => Object.values(l.donnees)),
      ...engagementsPasses.flatMap((e) => [...nombresDe(e.cible), ...nombresDe(e.reel)]),
    ],
    bi.sales.length,
  );
  const { brief, sujets } = resultat.valeur;
  return Response.json(
    {
      ok: true,
      brief: verifierBrief(brief, autorisees),
      // Sujets propres : 1 à 3, un par vrai problème de l'équipe (jamais deux sur le même thème), priorités absolues
      // d'abord, puis ventes / installs / POS, puis le reste ; chacun avec son objectif chiffré (pace 100 %, POS share 25 %…).
      sujets: construireSujets(
        verifierSujets(sujets, autorisees),
        problemes(repFromKpis({ id: tm.id, name: tm.nom, sen: "", budget: 0 }, kpisDuBi(bi.tm.donnees)), contexteEquipe(nbActifs)),
        true,
      ),
    } satisfies BriefReponse,
  );
}
