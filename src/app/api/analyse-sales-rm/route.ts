// Vue RM : l'analyse « data analyst » d'UN sales d'un TM (zoom depuis la fiche du TM, lecture seule).
// Reçoit { tmId, mois, rang } (rang = sa ligne dans le BI importé) ; relit côté serveur la ligne du sales et celle
// de son équipe, puis renvoie 3 succès / 2 axes / 1 vigilance au plus. Même consigne d'analyste que le brief du TM
// (règle absolue leads, cibles) ; les chiffres non fournis sont marqués « à vérifier ». Rien n'est enregistré.
import { getBiDuTm } from "@/lib/bi-rm";
import { type AnalyseSalesReponse, lireReponseAnalyseSales, promptAnalyseSales } from "@/lib/brief-tm";
import { valeursAutorisees, verifierAnalyse } from "@/lib/garde-fou";
import { type EchecGemini, genererAvecSecours } from "@/lib/gemini";
import { getCurrentManager, getMesTM } from "@/lib/managers";
import { isMonthLabel } from "@/lib/mois";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;


function erreur(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies AnalyseSalesReponse, { status });
}

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
  const manager = await getCurrentManager();
  if (!manager) return erreur("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);
  if (manager.role !== "RM") return erreur("Analyse réservée aux RM.", 403);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreur("Analyse IA indisponible : clé Gemini non configurée.", 500);

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return erreur("Demande invalide.", 400);
  }
  const { tmId, mois, rang } = (corps ?? {}) as Record<string, unknown>;
  if (typeof mois !== "string" || !isMonthLabel(mois)) return erreur("Mois invalide.", 400);
  const tm = (await getMesTM()).find((t) => t.id === tmId);
  if (!tm) return erreur("Ce TM ne fait pas partie de tes TM.", 403);

  // Le sales, retrouvé côté serveur parmi les sales de CE TM dans le BI du RM (jamais ce qu'envoie le navigateur).
  const bi = await getBiDuTm(tm.id, mois);
  const sales = bi.sales.find((s) => s.rang === rang);
  if (!sales) return erreur("Ce sales n'est pas dans le BI importé pour ce TM et ce mois.", 404);

  const prompt = promptAnalyseSales({
    nomSales: sales.nom,
    nomTm: tm.nom,
    mois,
    sales: sales.donnees,
    equipe: bi.tm?.donnees ?? null,
    nbSales: bi.sales.length,
  });
  const resultat = await genererAvecSecours(apiKey, prompt, lireReponseAnalyseSales);
  if (!resultat.ok) {
    const { message, status } = MESSAGES[resultat.raison];
    return erreur(message, status, resultat.raison === "indisponible" || resultat.raison === "illisible");
  }
  console.info(`[analyse-sales-rm] Analyse de ${sales.nom} (${tm.nom}, ${mois}) par ${resultat.modele}`);

  // Garde-fou : seuls les chiffres du sales et de son équipe sont des faits ; le reste est marqué « à vérifier ».
  const autorisees = valeursAutorisees(
    [...Object.values(sales.donnees), ...Object.values(bi.tm?.donnees ?? {})],
    bi.sales.length,
  );
  return Response.json({ ok: true, analyse: verifierAnalyse(resultat.valeur, autorisees) } satisfies AnalyseSalesReponse);
}
