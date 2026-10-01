// Vue RM : l'analyse « data analyst » d'UN sales d'un TM (zoom depuis la fiche du TM, lecture seule), avec les SUJETS
// PRÉVUS de son 1:1 (titre, constat, questions — jamais les réponses du TM). Reçoit { tmId, mois, rang } (rang = sa ligne
// dans le BI importé) ; relit côté serveur sa ligne et celle de son équipe. Le navigateur la garde dans la fiche du TM.
// Même consigne d'analyste que le brief du TM ; la gravité est fixée par les règles MOMENTO d'un commercial
// (son niveau vient de son « Sales Budget » du BI : POS 0-1 en M3+, send back > 18 %… en vigilance).
import { getBiDuTm } from "@/lib/bi-rm";
import { lireReponseAnalyseIa, promptAnalyseSales } from "@/lib/brief-tm";
import { getCommerciauxDesTM } from "@/lib/commerciaux";
import { valeursAutorisees } from "@/lib/garde-fou";
import { genererAvecSecours } from "@/lib/gemini";
import { critiquesCommercial, finaliserAnalyse } from "@/lib/gravite";
import { kpisDuBi } from "@/lib/lecture-bi-rm";
import { getCurrentManager, getMesTM } from "@/lib/managers";
import { isMonthLabel } from "@/lib/mois";
import { repFromKpis } from "@/lib/momento";
import { analyseOk, echecAnalyse, erreurAnalyse } from "@/lib/reponses-analyse";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

export async function POST(request: Request) {
  const manager = await getCurrentManager();
  if (!manager) return erreurAnalyse("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);
  if (manager.role !== "RM") return erreurAnalyse("Analyse réservée aux RM.", 403);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreurAnalyse("Analyse IA indisponible : clé Gemini non configurée.", 500);

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return erreurAnalyse("Demande invalide.", 400);
  }
  const { tmId, mois, rang } = (corps ?? {}) as Record<string, unknown>;
  if (typeof mois !== "string" || !isMonthLabel(mois)) return erreurAnalyse("Mois invalide.", 400);
  const tm = (await getMesTM()).find((t) => t.id === tmId);
  if (!tm) return erreurAnalyse("Ce TM ne fait pas partie de tes TM.", 403);

  // Le sales, retrouvé côté serveur parmi les sales de CE TM dans le BI du RM (jamais ce qu'envoie le navigateur).
  const bi = await getBiDuTm(tm.id, mois);
  const sales = bi.sales.find((s) => s.rang === rang);
  if (!sales) return erreurAnalyse("Ce sales n'est pas dans le BI importé pour ce TM et ce mois.", 404);
  const nbActifs = (await getCommerciauxDesTM([tm.id])).length; // objectifs d'équipe : roster actif (partis exclus)

  const prompt = promptAnalyseSales({
    nbActifs,
    nomSales: sales.nom,
    nomTm: tm.nom,
    mois,
    sales: sales.donnees,
    equipe: bi.tm?.donnees ?? null,
    nbSales: bi.sales.length,
  });
  const genereLe = new Date().toISOString();
  const resultat = await genererAvecSecours(apiKey, prompt, lireReponseAnalyseIa);
  if (!resultat.ok) return echecAnalyse(resultat.raison);
  console.info(`[analyse-sales-rm] ${sales.nom} (${tm.nom}, ${mois}) par ${resultat.modele}`);

  // Le sales lu comme un commercial : son objectif = son propre « Sales Budget » du BI (d'où son niveau).
  const rep = repFromKpis({ id: `bi-${sales.rang}`, name: sales.nom, sen: "", budget: sales.donnees.objectif ?? 0 }, kpisDuBi(sales.donnees));
  const autorisees = valeursAutorisees(
    [...Object.values(sales.donnees), ...Object.values(bi.tm?.donnees ?? {}), nbActifs * 4, nbActifs * 5, nbActifs],
    bi.sales.length,
  );
  return analyseOk({ ok: true, analyseIa: finaliserAnalyse(resultat.valeur, critiquesCommercial(rep), autorisees, genereLe) });
}
