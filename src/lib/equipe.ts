// Construit l'équipe d'un manager, mois par mois, à partir de ses fiches commerciaux et de ses chiffres.
// Utilisé par l'accueil TM (son équipe) et par la vue RM (l'équipe de chacun de ses TM) : même calcul pour les deux.
import type { Commercial } from "@/lib/commerciaux";
import type { KpiDonnees } from "@/lib/kpis";
import type { MoisSpeciaux } from "@/lib/mois-special";
import { currentMonthLabel, moisDuRang, previousMonthLabel, rangMois } from "@/lib/mois";
import { repFromKpis } from "@/lib/momento";
import { niveauxDeLEquipe } from "@/lib/niveau-mois";

export function construireEquipe(
  commerciaux: Commercial[],
  historique: Record<string, Record<string, KpiDonnees>>,
  speciaux: MoisSpeciaux,
) {
  // Les mois proposés : les 12 derniers mois + le mois courant, et tout mois plus ancien déjà rempli
  // (pour importer ou saisir l'historique). Du plus ancien au plus récent ; jamais de mois futur.
  const courant = currentMonthLabel();
  const rangCourant = rangMois(courant)!;
  const recents = Array.from({ length: 13 }, (_, k) => moisDuRang(rangCourant - 12 + k));
  const remplis = Object.keys(historique).filter((m) => (rangMois(m) ?? Infinity) <= rangCourant);
  const months = [...new Set([...recents, ...remplis])].sort((a, b) => rangMois(a)! - rangMois(b)!);
  // À l'ouverture : le mois le plus récent qui a des chiffres, sinon le mois courant.
  const aDesChiffres = (m: string) =>
    Object.values(historique[m] ?? {}).some((d) => Object.values(d).some((v) => v != null));
  const moisParDefaut = [...months].reverse().find(aDesChiffres) ?? courant;

  // Les 1:1 des mois affichés et de tout l'historique, chacun avec le mois d'avant :
  // les engagements d'un mois se jugent sur les chiffres du mois suivant (rappel du 1:1, taux de tenue).
  const moisEntretiens = [...new Set(months.flatMap((m) => [previousMonthLabel(m), m]))];
  // Le niveau (M1 / M2 / M3+) et le budget de chaque mois, calculés depuis le mois de démarrage de chaque fiche.
  const niveaux = niveauxDeLEquipe(commerciaux, months);
  // Chaque commercial = sa fiche (nom, séniorité, budget) + ses chiffres du mois → analyse MOMENTO.
  const data = Object.fromEntries(
    months.map((m) => [
      m,
      commerciaux.map((c) =>
        repFromKpis(
          { id: c.id, name: c.nom, sen: c.seniorite ?? "", budget: c.budget, demarrage: c.demarrage },
          historique[m]?.[c.id],
          speciaux[m]?.[c.id],
          niveaux[m]?.[c.id],
        ),
      ),
    ]),
  );
  const kpis = Object.fromEntries(months.map((m) => [m, historique[m] ?? {}]));

  return { months, moisParDefaut, moisEntretiens, niveaux, data, kpis };
}
