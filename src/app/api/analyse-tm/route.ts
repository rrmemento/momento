// Vue RM : l'analyse « data analyst » d'un TM (son équipe), générée une fois puis gardée dans sa fiche du 1:1.
// Reçoit { tmId, mois } ; relit côté serveur sa ligne agrégée du BI et le détail de ses sales (partis exclus).
// Même consigne d'analyste que le brief du TM ; la gravité est fixée par les règles MOMENTO pour une équipe.
import { getBiDuTm } from "@/lib/bi-rm";
import { lireReponseAnalyseIa, promptAnalyseTm } from "@/lib/brief-tm";
import { getCommerciauxDesTM } from "@/lib/commerciaux";
import { valeursAutorisees } from "@/lib/garde-fou";
import { genererAvecSecours } from "@/lib/gemini";
import { critiquesTm, finaliserAnalyse, nonAtteints, verifierSuccesEquipe } from "@/lib/gravite";
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
  const { tmId, mois } = (corps ?? {}) as Record<string, unknown>;
  if (typeof mois !== "string" || !isMonthLabel(mois)) return erreurAnalyse("Mois invalide.", 400);
  const tm = (await getMesTM()).find((t) => t.id === tmId);
  if (!tm) return erreurAnalyse("Ce TM ne fait pas partie de tes TM.", 403);

  const bi = await getBiDuTm(tm.id, mois);
  if (!bi.tm) return erreurAnalyse(`Le BI de ${mois.toLowerCase()} n'a pas encore été importé pour ${tm.nom}.`, 422);
  // Effectif réel du mois pour les objectifs d'équipe : les sales de ce TM dans le BI (partis compris), sinon son roster.
  const nbActifs = bi.effectif || (await getCommerciauxDesTM([tm.id])).length;

  const prompt = promptAnalyseTm({ nomTm: tm.nom, mois, tm: bi.tm, sales: bi.sales, nbActifs });
  const genereLe = new Date().toISOString();
  const resultat = await genererAvecSecours(apiKey, prompt, lireReponseAnalyseIa);
  if (!resultat.ok) return echecAnalyse(resultat.raison);
  console.info(`[analyse-tm] ${tm.nom} (${mois}, ${bi.sales.length} sales) par ${resultat.modele}`);

  // Le TM vu comme une « personne » : jugé sur son pace et les objectifs d'équipe, jamais sur un budget cumulé.
  const rep = repFromKpis({ id: tm.id, name: tm.nom, sen: "", budget: 0 }, kpisDuBi(bi.tm.donnees));
  const autorisees = valeursAutorisees(
    [...[bi.tm, ...bi.sales].flatMap((l) => Object.values(l.donnees)), nbActifs * 4, nbActifs * 5, nbActifs],
    bi.sales.length,
  );
  const analyseIa = finaliserAnalyse(resultat.valeur, critiquesTm(rep), autorisees, genereLe, nonAtteints(rep));
  // Un succès d'équipe porté par 1 ou 2 sales n'est pas un succès : vérifié dans le code sur le détail par sales.
  return analyseOk({ ok: true, analyseIa: { ...analyseIa, analyse: verifierSuccesEquipe(analyseIa.analyse, bi.sales) } });
}
