// « Brief auto » du 1:1 : Gemini prépare l'entretien d'un commercial pour un mois.
// Reçoit { commercialId, mois } ; relit tout côté serveur (chiffres, analyse MOMENTO, engagements du
// mois précédent) et renvoie le brief + 2 à 3 sujets pré-remplis. Le navigateur les range dans la fiche.
import { alignerSurMoisProchain, lireReponseBrief, objectifsMoisProchain, promptBrief, type BriefReponse } from "@/lib/brief";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { getEntretiens } from "@/lib/entretiens";
import { type EchecGemini, genererAvecSecours } from "@/lib/gemini";
import { getKpisDuMois, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { niveauCalcule, niveauMoisSuivant } from "@/lib/niveau-mois";
import { construireSujets, contexteCommercial, problemes } from "@/lib/gravite";
import { getCurrentUser } from "@/lib/managers";
import { isMonthLabel, previousMonthLabel } from "@/lib/mois";
import { analyse, repFromKpis, statut } from "@/lib/momento";
import { engagements } from "@/lib/suivi";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

function erreur(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies BriefReponse, { status });
}

// Échec après tous les réessais et tous les modèles → message compréhensible.
const MESSAGES: Record<EchecGemini, { message: string; status: number }> = {
  quota: { message: "Trop de demandes en peu de temps, patiente 1 minute et réessaie.", status: 429 },
  indisponible: { message: "Les serveurs de Google sont surchargés pour le moment, réessaie dans un instant.", status: 503 },
  illisible: { message: "Gemini a renvoyé un brief incomplet. Réessaie.", status: 422 },
  images: { message: "Gemini a refusé la demande. Réessaie dans un instant.", status: 422 },
  cle: { message: "Clé Gemini refusée : vérifie GEMINI_API_KEY dans .env.local.", status: 500 },
  "aucun-modele": {
    message: "Aucun des modèles Gemini configurés n'est disponible pour ta clé : vérifie GEMINI_MODELS dans .env.local.",
    status: 500,
  },
};

export async function POST(request: Request) {
  // Le proxy bloque déjà les visiteurs non connectés ; on revérifie ici par sécurité.
  if (!(await getCurrentUser())) return erreur("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreur("Brief IA indisponible : clé Gemini non configurée.", 500);

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return erreur("Demande invalide.", 400);
  }
  const { commercialId, mois } = (corps ?? {}) as Record<string, unknown>;
  if (typeof mois !== "string" || !isMonthLabel(mois)) return erreur("Mois invalide.", 400);

  // Uniquement un commercial de l'équipe du manager connecté.
  const commercial = (await getMyCommerciaux()).find((c) => c.id === commercialId);
  if (!commercial) return erreur("Ce commercial ne fait pas partie de ton équipe.", 403);

  const moisPrecedent = previousMonthLabel(mois);
  const [kpis, entretiens, speciaux] = await Promise.all([
    getKpisDuMois(mois),
    getEntretiens([moisPrecedent]),
    getMoisSpeciaux(),
  ]);
  const chiffres = kpis[commercial.id] ?? {};
  const rep = repFromKpis(
    { id: commercial.id, name: commercial.nom, sen: commercial.seniorite ?? "", budget: commercial.budget },
    chiffres,
    speciaux[mois]?.[commercial.id], // mois particulier : objectif ajusté
    niveauCalcule(commercial, mois), // niveau et budget de CE mois, calculés depuis le démarrage
  );
  if (!rep.hasKpis) {
    return erreur(
      `Il faut au moins les ventes et les installations de ${mois.toLowerCase()} pour préparer le brief (onglet Import & chiffres).`,
      422,
    );
  }

  // Le niveau du MOIS PROCHAIN (auto-progression depuis le mois de démarrage) : base de tout objectif proposé pour le
  // mois suivant. Ex. M1 en ce mois → M2 le mois prochain → 10 ventes et 10 installs. L'objectif de ce mois ne change pas.
  const prochain = objectifsMoisProchain(niveauMoisSuivant(commercial, mois));
  const prompt = promptBrief({
    rep,
    mois,
    moisPrecedent,
    chiffres,
    status: statut(rep),
    analysis: analyse(rep),
    engagements: engagements(entretiens[moisPrecedent]?.[commercial.id], chiffres), // même logique que l'onglet Suivi
    prochain,
  });

  // Le détail des échecs est journalisé côté serveur ; le navigateur ne reçoit qu'un message clair.
  const genereLe = new Date().toISOString();
  const resultat = await genererAvecSecours(apiKey, prompt, (texte) => lireReponseBrief(texte, genereLe));
  if (!resultat.ok) {
    const { message, status } = MESSAGES[resultat.raison];
    return erreur(message, status, resultat.raison === "indisponible" || resultat.raison === "illisible");
  }
  console.info(`[brief-1on1] Brief de ${commercial.nom} (${mois}) préparé par ${resultat.modele}`);

  // Règle MOMENTO, vérifiée ici aussi : les objectifs proposés valent pour le MOIS PROCHAIN, à son niveau du mois
  // prochain (ventes / installs / POS / OG jamais sous la cible ; pas d'objectif POS s'il n'est pas M3+ le mois prochain).
  const { brief, sujets } = resultat.valeur;
  // Sujets propres : 1 à 3, un par vrai problème (jamais deux sur le même thème), priorités absolues d'abord, puis
  // ventes / installs / POS, puis le reste ; chacun avec son objectif chiffré (au niveau du mois prochain).
  const priorises = construireSujets(alignerSurMoisProchain(sujets, prochain), problemes(rep, contexteCommercial(rep, prochain)), false);
  return Response.json({ ok: true, brief, sujets: priorises } satisfies BriefReponse);
}
