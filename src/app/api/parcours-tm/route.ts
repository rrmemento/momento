// Vue RM : le diagnostic de parcours d'un TM dans le temps (onglet Parcours).
// Reçoit { tmId } ; relit côté serveur toutes ses lignes « tm » du BI importé par le RM, ses sales du mois le plus
// récent et les 1:1 passés, puis renvoie un diagnostic (même format que celui d'un commercial). Même consigne
// d'analyste que le brief du TM (règle absolue leads, cibles) ; les chiffres non fournis sont marqués « à vérifier ».
import { getEntretiensTm, getParcoursBiDuTm } from "@/lib/bi-rm";
import { getCommerciauxDesTM } from "@/lib/commerciaux";
import { lireReponseDiagnosticTm, promptParcoursTm } from "@/lib/brief-tm";
import { valeursAutorisees, verifierDiagnostic } from "@/lib/garde-fou";
import { type EchecGemini, genererAvecSecours } from "@/lib/gemini";
import { getCurrentManager, getMesTM } from "@/lib/managers";
import { rangMois } from "@/lib/mois";
import { type DiagnosticReponse, RECUL_MIN } from "@/lib/parcours-ia";
import type { OneOnOne } from "@/lib/types";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

function erreur(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies DiagnosticReponse, { status });
}

// Mêmes messages que le diagnostic d'un commercial.
const MESSAGES: Record<EchecGemini, { message: string; status: number }> = {
  quota: { message: "Trop de demandes en peu de temps, patiente 1 minute et réessaie.", status: 429 },
  indisponible: { message: "Les serveurs de Google sont surchargés pour le moment, réessaie dans un instant.", status: 503 },
  illisible: { message: "Gemini a renvoyé un diagnostic incomplet. Réessaie.", status: 422 },
  images: { message: "Gemini a refusé la demande. Réessaie dans un instant.", status: 422 },
  cle: { message: "Clé Gemini refusée : vérifie GEMINI_API_KEY dans .env.local.", status: 500 },
  "aucun-modele": {
    message: "Aucun des modèles Gemini configurés n'est disponible pour ta clé : vérifie GEMINI_MODELS dans .env.local.",
    status: 500,
  },
};

const court = (t: string, n = 220) => (t.length > n ? `${t.slice(0, n)}…` : t);

// Ce que dit un 1:1 passé (ressenti, auto-note, blocages, besoins), en une ligne.
function ligne1on1(mois: string, fiche: OneOnOne) {
  const parts = [
    fiche.note > 0 && `auto-note ${fiche.note}/10`,
    fiche.ressenti.trim() && `ressenti : ${court(fiche.ressenti.trim())}`,
    fiche.bloque.trim() && `bloqué par : ${court(fiche.bloque.trim())}`,
    fiche.besoin.trim() && `besoin : ${court(fiche.besoin.trim())}`,
  ].filter(Boolean);
  return parts.length ? `- 1:1 de ${mois} : ${parts.join(" · ")}` : null;
}

export async function POST(request: Request) {
  // Le proxy bloque déjà les visiteurs non connectés ; ici on vérifie en plus que c'est un RM.
  const manager = await getCurrentManager();
  if (!manager) return erreur("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);
  if (manager.role !== "RM") return erreur("Diagnostic réservé aux RM.", 403);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreur("Analyse IA indisponible : clé Gemini non configurée.", 500);

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return erreur("Demande invalide.", 400);
  }
  const { tmId } = (corps ?? {}) as Record<string, unknown>;
  const tm = (await getMesTM()).find((t) => t.id === tmId);
  if (!tm) return erreur("Ce TM ne fait pas partie de tes TM.", 403);

  const { parMois, salesDernierMois, dernierMois } = await getParcoursBiDuTm(tm.id);
  const mois = Object.keys(parMois).sort((a, b) => (rangMois(a) ?? 0) - (rangMois(b) ?? 0));
  // Historique trop court : on le dit honnêtement, sans appeler l'IA.
  if (mois.length < RECUL_MIN || !dernierMois) {
    return erreur(
      `Pas encore assez de recul sur l'équipe de ${tm.nom} (${mois.length} mois de BI importés) : il en faut au moins ${RECUL_MIN}.`,
      422,
    );
  }

  const entretiens = await getEntretiensTm(mois);
  const unUn = mois.flatMap((m) => (entretiens[m]?.[tm.id] ? (ligne1on1(m, entretiens[m][tm.id]) ?? []) : []));
  // Les objectifs d'équipe (POS = sales actifs × 4, OG = × 5) se basent sur le roster ACTIF du TM (partis exclus).
  const nbActifs = (await getCommerciauxDesTM([tm.id])).length;
  const prompt = promptParcoursTm({
    nbActifs,
    nomTm: tm.nom,
    parMois: mois.map((m) => [m, parMois[m]]),
    dernierMois,
    salesDernierMois,
    unUn,
  });

  // Le détail des échecs est journalisé côté serveur ; le navigateur ne reçoit qu'un message clair.
  const genereLe = new Date().toISOString();
  const resultat = await genererAvecSecours(apiKey, prompt, (texte) => lireReponseDiagnosticTm(texte, genereLe));
  if (!resultat.ok) {
    const { message, status } = MESSAGES[resultat.raison];
    return erreur(message, status, resultat.raison === "indisponible" || resultat.raison === "illisible");
  }
  console.info(`[parcours-tm] Diagnostic de ${tm.nom} (${mois.length} mois) établi par ${resultat.modele}`);

  // Garde-fou : tout nombre cité qui n'est dans aucune valeur fournie est marqué « à vérifier ».
  const autorisees = valeursAutorisees(
    [
      // Les objectifs d'équipe cités par l'IA sont des faits (sales actifs × 4 pour les POS, × 5 pour l'OG).
      nbActifs * 4,
      nbActifs * 5,
      nbActifs,
      ...Object.values(parMois).flatMap((d) => Object.values(d)),
      ...salesDernierMois.flatMap((s) => Object.values(s.donnees)),
      ...mois.flatMap((m) => entretiens[m]?.[tm.id]?.note ?? []),
    ],
    Math.max(salesDernierMois.length, mois.length),
  );
  return Response.json({ ok: true, diagnostic: verifierDiagnostic(resultat.valeur, autorisees) } satisfies DiagnosticReponse);
}
