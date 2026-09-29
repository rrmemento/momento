// Les KPIs saisis à la main, stockés dans kpis_mensuels.donnees (jsonb).
// Utilisé à la fois par le formulaire (navigateur) et par l'enregistrement (serveur).

export type KpiField = {
  key: string;
  label: string;
  unit?: "%" | "j" | "€";
  integer?: boolean; // un nombre entier (ventes, installs…)
};

export const KPI_GROUPS = [
  {
    titre: "Volume",
    champs: [
      { key: "ventes", label: "Ventes signées", integer: true },
      { key: "vPace", label: "Pace ventes", unit: "%" },
      { key: "og", label: "Ventes OG", integer: true },
      { key: "taux", label: "Taux moyen", unit: "%" },
    ],
  },
  {
    titre: "Installation",
    champs: [
      { key: "install", label: "Installations", integer: true },
      { key: "iPace", label: "Pace installs", unit: "%" },
      { key: "backlog", label: "Backlog", integer: true },
      { key: "avgDays", label: "Délai moyen d'installation", unit: "j" },
      { key: "quick", label: "Quick install", unit: "%" },
    ],
  },
  {
    titre: "POS",
    champs: [
      { key: "posSales", label: "POS vendus", integer: true },
      { key: "posInst", label: "POS installés", integer: true },
      { key: "posShare", label: "POS share", unit: "%" },
      { key: "posUpfront", label: "POS upfront", unit: "€" },
    ],
  },
  {
    titre: "Activité",
    champs: [
      { key: "sendback", label: "Send back", unit: "%" },
      { key: "ihcr", label: "Conversion IH", unit: "%" },
      { key: "ihQuick", label: "IH quick", unit: "%" },
      { key: "mtgAc", label: "Meeting avec AC", unit: "%" },
    ],
  },
] as const satisfies readonly { titre: string; champs: readonly KpiField[] }[];

export type KpiKey = (typeof KPI_GROUPS)[number]["champs"][number]["key"];

// Chaque KPI vaut un nombre, ou null s'il n'est pas renseigné.
export type KpiDonnees = Partial<Record<KpiKey, number | null>>;

export const KPI_FIELDS: readonly KpiField[] = KPI_GROUPS.flatMap((g): readonly KpiField[] => g.champs);

// Ne garde que les KPIs connus et numériques d'un jsonb lu en base.
export function cleanDonnees(raw: unknown): KpiDonnees {
  const out: KpiDonnees = {};
  if (!raw || typeof raw !== "object") return out;
  for (const f of KPI_FIELDS) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (typeof v === "number" && Number.isFinite(v)) out[f.key as KpiKey] = v;
    else if (v === null) out[f.key as KpiKey] = null;
  }
  return out;
}

// Texte saisi → nombre. « 27,3 » et « 27.3 » sont acceptés ; vide = null.
export function parseKpi(field: KpiField, text: string): { value: number | null } | { error: string } {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return { value: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { error: "Nombre invalide" };
  if (n < 0) return { error: "Doit être positif" };
  if (field.integer && !Number.isInteger(n)) return { error: "Nombre entier attendu" };
  return { value: n };
}

// Nombre → texte affiché dans le champ (virgule française).
export const formatKpi = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

// Budget = objectif ventes ET installs ; il fixe le niveau du commercial.
export const BUDGETS = [
  { value: 5, label: "M1" },
  { value: 10, label: "M2" },
  { value: 15, label: "M3+" },
] as const;

// ——— Objectif chiffré d'un sujet de 1:1 (optionnel) : un KPI, un sens, une valeur cible ———

export type SensCible = ">=" | "<=";

// valeur = null tant que la cible n'est pas encore saisie.
export type ObjectifChiffre = { kpi: KpiKey; sens: SensCible; valeur: number | null };

export const SENS_CIBLE: readonly { value: SensCible; label: string }[] = [
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
];

// Les KPIs qu'on cherche à faire baisser : la cible propose « ≤ » par défaut.
const KPI_A_BAISSER: readonly KpiKey[] = ["avgDays", "backlog", "sendback"];

export const sensParDefaut = (kpi: KpiKey): SensCible => (KPI_A_BAISSER.includes(kpi) ? "<=" : ">=");

export const kpiField = (key: string) => KPI_FIELDS.find((f) => f.key === key);

const UNITES = { "%": " %", j: " j", "€": " €" } as const;

// « Ventes signées ≥ 12 », « Délai moyen ≤ 20 j »… ; null tant que la cible est incomplète.
export function libelleObjectifChiffre(c: ObjectifChiffre | null) {
  const field = c && kpiField(c.kpi);
  if (!c || !field || c.valeur == null) return null;
  const sens = SENS_CIBLE.find((s) => s.value === c.sens)?.label;
  return `${field.label} ${sens} ${formatKpi(c.valeur)}${field.unit ? UNITES[field.unit] : ""}`;
}

// jsonb lu en base (ou brouillon du navigateur) → objectif chiffré valide, ou null.
export function normaliserObjectifChiffre(raw: unknown): ObjectifChiffre | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const field = typeof o.kpi === "string" ? kpiField(o.kpi) : undefined;
  if (!field) return null;
  const kpi = field.key as KpiKey;
  const sens = o.sens === ">=" || o.sens === "<=" ? o.sens : sensParDefaut(kpi);
  const valeur =
    typeof o.valeur === "number" && Number.isFinite(o.valeur) && o.valeur >= 0 && (!field.integer || Number.isInteger(o.valeur))
      ? o.valeur
      : null;
  return { kpi, sens, valeur };
}
