// Diagnostic de parcours (onglet Parcours) : Gemini rend un verdict (profil, trajectoire, priorité) sur tout l'historique.
// Reçoit { commercialId } ; relit tout côté serveur (chiffres de tous les mois et mois particuliers, 1:1, engagements,
// coups d'éclat, signaux des règles) et renvoie le diagnostic. Le navigateur le range dans le 1:1 du mois en cours.
import { getMyCommerciaux } from "@/lib/commerciaux";
import { getEntretiens } from "@/lib/entretiens";
import { type EchecGemini, genererAvecSecours } from "@/lib/gemini";
import { getHistoriqueKpis, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { getCurrentUser } from "@/lib/managers";
import { currentMonthLabel, previousMonthLabel } from "@/lib/mois";
import { coupsDEclat, signauxFaibles } from "@/lib/parcours-analyse";
import {
  lireReponseDiagnostic,
  moisAvecChiffres,
  promptDiagnostic,
  RECUL_MIN,
  type DiagnosticReponse,
} from "@/lib/parcours-ia";
import { BUDGET_PAR_SENIORITE } from "@/lib/seniorite";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

function erreur(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies DiagnosticReponse, { status });
}

// Échec après tous les réessais et tous les modèles → message compréhensible.
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

  // Historique trop court : on le dit honnêtement, sans appeler l'IA ni inventer de profil.
  const recul = moisAvecChiffres(historique, commercial.id).length;
  if (recul < RECUL_MIN) {
    return erreur(
      `Pas encore assez de recul sur ${commercial.nom} (${recul} mois de chiffres) : reviens dans ${RECUL_MIN - recul} mois.`,
      422,
    );
  }

  const budget = commercial.budget || BUDGET_PAR_SENIORITE[commercial.seniorite ?? ""] || 0;
  const niveau = niveauDuBudget(budget);
  const base = { repId: commercial.id, historique, entretiens, speciaux };
  const prompt = promptDiagnostic({
    ...base,
    nom: commercial.nom,
    niveau,
    budget,
    moisEnCours,
    signauxRegles: signauxFaibles({ ...base, m3: niveau === "M3+", moisEnCours }),
    eclats: coupsDEclat({ ...base, budget }),
  });

  // Le détail des échecs est journalisé côté serveur ; le navigateur ne reçoit qu'un message clair.
  const genereLe = new Date().toISOString();
  const resultat = await genererAvecSecours(apiKey, prompt, (texte) => lireReponseDiagnostic(texte, genereLe));
  if (!resultat.ok) {
    const { message, status } = MESSAGES[resultat.raison];
    return erreur(message, status, resultat.raison === "indisponible" || resultat.raison === "illisible");
  }
  console.info(`[parcours-ia] Diagnostic de ${commercial.nom} établi par ${resultat.modele}`);
  return Response.json({ ok: true, diagnostic: resultat.valeur } satisfies DiagnosticReponse);
}
