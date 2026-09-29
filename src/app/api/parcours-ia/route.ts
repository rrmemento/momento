// « Analyser avec l'IA » (onglet Parcours) : Gemini repère 2 à 3 signaux faibles sur tout le parcours d'un commercial.
// Reçoit { commercialId } ; relit tout côté serveur (chiffres de tous les mois, 1:1, engagements, signaux des règles)
// et renvoie l'analyse. Le navigateur la range ensuite dans le 1:1 du mois en cours.
import { getMyCommerciaux } from "@/lib/commerciaux";
import { getEntretiens } from "@/lib/entretiens";
import { type EchecGemini, genererAvecSecours } from "@/lib/gemini";
import { getHistoriqueKpis, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { getCurrentUser } from "@/lib/managers";
import { currentMonthLabel, previousMonthLabel } from "@/lib/mois";
import { signauxFaibles } from "@/lib/parcours-analyse";
import { lireReponseSignaux, promptSignaux, type SignauxIaReponse } from "@/lib/parcours-ia";
import { BUDGET_PAR_SENIORITE } from "@/lib/seniorite";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

function erreur(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies SignauxIaReponse, { status });
}

// Échec après tous les réessais et tous les modèles → message compréhensible.
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

const niveauDuBudget = (budget: number) => (budget >= 15 ? "M3+" : budget >= 10 ? "M2" : "M1"); // même règle que MOMENTO

export async function POST(request: Request) {
  // Le proxy bloque déjà les visiteurs non connectés ; on revérifie ici par sécurité.
  if (!(await getCurrentUser())) return erreur("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreur("Analyse IA indisponible : clé Gemini non configurée.", 500);

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return erreur("Demande invalide.", 400);
  }
  const { commercialId } = (corps ?? {}) as Record<string, unknown>;

  // Uniquement un commercial de l'équipe du manager connecté.
  const commercial = (await getMyCommerciaux()).find((c) => c.id === commercialId);
  if (!commercial) return erreur("Ce commercial ne fait pas partie de ton équipe.", 403);

  const moisEnCours = currentMonthLabel();
  const [historique, speciaux] = await Promise.all([getHistoriqueKpis(), getMoisSpeciaux()]);
  const moisEntretiens = [...new Set([moisEnCours, ...Object.keys(historique)].flatMap((m) => [previousMonthLabel(m), m]))];
  const entretiens = await getEntretiens(moisEntretiens);

  const aDesChiffres = Object.values(historique).some((parRep) => parRep[commercial.id]);
  const aDes1on1 = Object.values(entretiens).some((parRep) => parRep[commercial.id]);
  if (!aDesChiffres && !aDes1on1) {
    return erreur(`Pas encore assez d'éléments sur ${commercial.nom} : ni chiffres, ni 1:1 enregistrés.`, 422);
  }

  const budget = commercial.budget || BUDGET_PAR_SENIORITE[commercial.seniorite ?? ""] || 0;
  const niveau = niveauDuBudget(budget);
  const base = { repId: commercial.id, historique, entretiens, speciaux };
  const prompt = promptSignaux({
    ...base,
    nom: commercial.nom,
    niveau,
    budget,
    moisEnCours,
    signauxRegles: signauxFaibles({ ...base, m3: niveau === "M3+", moisEnCours }),
  });

  // Le détail des échecs est journalisé côté serveur ; le navigateur ne reçoit qu'un message clair.
  const genereLe = new Date().toISOString();
  const resultat = await genererAvecSecours(apiKey, prompt, (texte) => lireReponseSignaux(texte, genereLe));
  if (!resultat.ok) {
    const { message, status } = MESSAGES[resultat.raison];
    return erreur(message, status, resultat.raison === "indisponible" || resultat.raison === "illisible");
  }
  console.info(`[parcours-ia] Signaux faibles de ${commercial.nom} repérés par ${resultat.modele}`);
  return Response.json({ ok: true, signauxIa: resultat.valeur } satisfies SignauxIaReponse);
}
