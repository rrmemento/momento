// Un « mois particulier » pour un commercial (congés, arrêt, ramp-up…) : son objectif du mois est ajusté.
// Stocké dans kpis_mensuels.donnees.special (jsonb), à côté des chiffres du mois. Par défaut, un mois n'est pas spécial.

export type RaisonSpeciale = "conges" | "arret" | "rampup" | "autre";

export type MoisSpecial = {
  raison: RaisonSpeciale;
  objectif: number; // objectif ajusté de CE mois, pour les ventes ET les installations (au lieu du budget)
};

// mois → commercial → mois particulier
export type MoisSpeciaux = Record<string, Record<string, MoisSpecial>>;

export const RAISONS: readonly { value: RaisonSpeciale; label: string; court: string }[] = [
  { value: "conges", label: "Congés", court: "congés" },
  { value: "arret", label: "Arrêt", court: "arrêt" },
  { value: "rampup", label: "Ramp-up / démarrage", court: "ramp-up" },
  { value: "autre", label: "Autre", court: "mois particulier" },
];

export const OBJECTIF_MAX = 60;

// jsonb (donnees.special) → mois particulier valide, ou null.
export function lireMoisSpecial(raw: unknown): MoisSpecial | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const raison = RAISONS.find((r) => r.value === o.raison)?.value;
  const objectif = o.objectif;
  if (!raison || typeof objectif !== "number" || !Number.isInteger(objectif) || objectif < 1 || objectif > OBJECTIF_MAX) {
    return null;
  }
  return { raison, objectif };
}

// « objectif ajusté (congés) »
export const libelleAjuste = (s: MoisSpecial) =>
  `objectif ajusté (${RAISONS.find((r) => r.value === s.raison)?.court ?? "mois particulier"})`;

// L'objectif qui s'applique à un mois : l'objectif ajusté si le mois est particulier, sinon le budget.
export const objectifDuMois = (budget: number, special: MoisSpecial | null | undefined) => special?.objectif ?? budget;

// « mois particulier (congés) », ou simplement « mois particulier » pour la raison « Autre ».
export const libelleMoisParticulier = (s: MoisSpecial) =>
  s.raison === "autre" ? "mois particulier" : `mois particulier (${RAISONS.find((r) => r.value === s.raison)?.court})`;
