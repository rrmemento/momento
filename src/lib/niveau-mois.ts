// Le niveau (M1 / M2 / M3+) et le budget d'un commercial POUR UN MOIS donné, CALCULÉS depuis sa fiche :
// son mois de démarrage et son niveau à ce moment-là. Mois de démarrage = niveau de départ, puis +1 par mois,
// plafonné à M3+. Ex. démarrage avril 2025 en M1 → avril M1 (5), mai M2 (10), juin et après M3+ (15).
// « Déjà senior » (niveau de départ M3+) : tous ses mois sont en M3+. Sans démarrage : le budget de la fiche.
import { currentMonthLabel, moisDuRang, previousMonthLabel, rangMois } from "./mois";
import { objectifDuMois, type MoisSpeciaux } from "./mois-special";

export type Niveau = "M1" | "M2" | "M3+";
export const NIVEAUX: readonly Niveau[] = ["M1", "M2", "M3+"];
export const BUDGET_DU_NIVEAU: Record<Niveau, number> = { M1: 5, M2: 10, "M3+": 15 };

export type NiveauMois = { seniorite: Niveau; budget: number };

// mois → commercial → niveau du mois
export type NiveauxMois = Record<string, Record<string, NiveauMois>>;

export const lireNiveau = (v: unknown): Niveau | null => NIVEAUX.find((n) => n === v) ?? null;

// Ce qu'on sait de la fiche : le mois de démarrage (« Avril 2025 ») et le niveau à ce moment-là (colonne seniorite).
export type Demarrage = { demarrage: string | null; seniorite: string | null };

// Le niveau d'un mois, ou null si on ne peut pas le calculer (démarrage non renseigné) → budget de la fiche.
export function niveauCalcule({ demarrage, seniorite }: Demarrage, mois: string): NiveauMois | null {
  const depart = lireNiveau(seniorite);
  if (depart === "M3+") return { seniorite: "M3+", budget: BUDGET_DU_NIVEAU["M3+"] }; // déjà senior
  const debut = demarrage ? rangMois(demarrage) : null;
  const rang = rangMois(mois);
  if (!depart || debut == null || rang == null) return null;
  // Avant le démarrage (cas rare) : on garde le niveau de départ.
  const niveau = NIVEAUX[Math.min(NIVEAUX.length - 1, NIVEAUX.indexOf(depart) + Math.max(0, rang - debut))];
  return { seniorite: niveau, budget: BUDGET_DU_NIVEAU[niveau] };
}

// Les niveaux calculés de toute l'équipe pour une liste de mois.
export function niveauxDeLEquipe(commerciaux: ({ id: string } & Demarrage)[], mois: string[]): NiveauxMois {
  const resultat: NiveauxMois = {};
  for (const m of mois) {
    for (const c of commerciaux) {
      const n = niveauCalcule(c, m);
      if (n) (resultat[m] ??= {})[c.id] = n;
    }
  }
  return resultat;
}

// Le budget qui s'applique à un mois : celui du niveau calculé, sinon celui de la fiche.
export const budgetDuMois = (budgetFiche: number, niveau: NiveauMois | null | undefined) => niveau?.budget ?? budgetFiche;

// Pour un commercial : mois → budget du mois, niveau M3+ ou non, et objectif qui s'applique
// (objectif ajusté d'un mois particulier en priorité, sinon budget du mois, sinon budget de la fiche).
export function objectifsDuCommercial(
  repId: string,
  budgetFiche: number,
  niveaux: NiveauxMois = {},
  speciaux: MoisSpeciaux = {},
) {
  return (mois: string) => {
    const niveau = niveaux[mois]?.[repId] ?? null;
    const budget = budgetDuMois(budgetFiche, niveau);
    return { niveau, budget, m3: budget >= 15, objectif: objectifDuMois(budget, speciaux[mois]?.[repId]) };
  };
}

// Mois de démarrage PROPOSÉ pour un nouveau commercial, d'après le niveau choisi aujourd'hui (modifiable ensuite) :
// M1 → ce mois-ci, M2 → le mois dernier (l'auto-progression redonne bien ce niveau aujourd'hui) ; M3+ → aucun
// (« déjà senior »). Ne concerne que les SALES : un TM ne monte pas en séniorité.
export function demarragePropose(seniorite: string, aujourdhui = currentMonthLabel()): string | null {
  if (seniorite === "M1") return aujourdhui;
  if (seniorite === "M2") return previousMonthLabel(aujourdhui);
  return null;
}

// Le niveau et l'objectif du MOIS SUIVANT un mois donné (auto-progression appliquée à mois + 1) : c'est sur eux que se
// fixe tout objectif « pour le mois prochain » (ex. M1 ce mois → M2 le mois prochain → objectif 10 ventes et 10 installs).
// L'objectif du mois courant, lui, ne change pas. Sans mois de démarrage connu : le budget de la fiche.
export function niveauMoisSuivant(c: Demarrage & { budget: number }, mois: string): { mois: string; seniorite: Niveau; budget: number } {
  const suivant = moisDuRang((rangMois(mois) ?? 0) + 1);
  const n = niveauCalcule(c, suivant);
  const budget = n?.budget ?? c.budget;
  return { mois: suivant, seniorite: n?.seniorite ?? (budget >= 15 ? "M3+" : budget >= 10 ? "M2" : "M1"), budget };
}
