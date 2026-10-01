// L'analyse « data analyst » d'un commercial (accès TM) : générée une fois, puis gardée dans sa fiche du 1:1.
// Reçoit { commercialId, mois } ; relit côté serveur ses chiffres du mois, son niveau et son objectif du mois.
// L'IA écrit les points ; la gravité (succès / axe / vigilance) est fixée par les règles MOMENTO (lib/gravite.ts).
import { lignesChiffres } from "@/lib/brief";
import { lireReponseAnalyseIa, promptAnalyseCommercial } from "@/lib/brief-tm";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { valeursAutorisees } from "@/lib/garde-fou";
import { genererAvecSecours } from "@/lib/gemini";
import { critiquesCommercial, finaliserAnalyse, nonAtteints } from "@/lib/gravite";
import { getKpisDuMois, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { getCurrentUser } from "@/lib/managers";
import { isMonthLabel } from "@/lib/mois";
import { libelleAjuste } from "@/lib/mois-special";
import { repFromKpis } from "@/lib/momento";
import { niveauCalcule } from "@/lib/niveau-mois";
import { analyseOk, echecAnalyse, erreurAnalyse } from "@/lib/reponses-analyse";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

export async function POST(request: Request) {
  if (!(await getCurrentUser())) return erreurAnalyse("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreurAnalyse("Analyse IA indisponible : clé Gemini non configurée.", 500);

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return erreurAnalyse("Demande invalide.", 400);
  }
  const { commercialId, mois } = (corps ?? {}) as Record<string, unknown>;
  if (typeof mois !== "string" || !isMonthLabel(mois)) return erreurAnalyse("Mois invalide.", 400);

  // Uniquement un commercial de l'équipe du manager connecté.
  const commercial = (await getMyCommerciaux()).find((c) => c.id === commercialId);
  if (!commercial) return erreurAnalyse("Ce commercial ne fait pas partie de ton équipe.", 403);

  const [kpis, speciaux] = await Promise.all([getKpisDuMois(mois), getMoisSpeciaux()]);
  const chiffres = kpis[commercial.id] ?? {};
  const rep = repFromKpis(
    { id: commercial.id, name: commercial.nom, sen: commercial.seniorite ?? "", budget: commercial.budget },
    chiffres,
    speciaux[mois]?.[commercial.id],
    niveauCalcule(commercial, mois),
  );
  if (!rep.hasKpis) return erreurAnalyse(`Les chiffres de ${mois.toLowerCase()} ne sont pas encore saisis.`, 422);

  const prompt = promptAnalyseCommercial({
    nom: commercial.nom,
    mois,
    niveau: rep.level,
    objectif: rep.objectif,
    moisParticulier: rep.special ? libelleAjuste(rep.special) : null,
    lignes: lignesChiffres(chiffres),
  });
  const genereLe = new Date().toISOString();
  const resultat = await genererAvecSecours(apiKey, prompt, lireReponseAnalyseIa);
  if (!resultat.ok) return echecAnalyse(resultat.raison);
  console.info(`[analyse-commercial] ${commercial.nom} (${mois}) par ${resultat.modele}`);

  const autorisees = valeursAutorisees([...Object.values(chiffres), rep.objectif, rep.budget]);
  return analyseOk({ ok: true, analyseIa: finaliserAnalyse(resultat.valeur, critiquesCommercial(rep), autorisees, genereLe, nonAtteints(rep)) });
}
