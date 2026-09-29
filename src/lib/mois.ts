// Les mois sont stockés en texte, au format « Septembre 2026 ».
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// Le mois en cours à Paris, ex. « Septembre 2026 ».
export function currentMonthLabel(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", { month: "numeric", year: "numeric", timeZone: "Europe/Paris" })
    .formatToParts(date);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const year = parts.find((p) => p.type === "year")?.value;
  return `${MOIS[month - 1]} ${year}`;
}

// Le mois précédent un libellé, ex. « Septembre 2026 » → « Août 2026 ».
export function previousMonthLabel(label: string) {
  const [month, year] = label.split(" ");
  const index = MOIS.indexOf(month);
  return index > 0 ? `${MOIS[index - 1]} ${year}` : `${MOIS[11]} ${Number(year) - 1}`;
}

export function isMonthLabel(value: string) {
  const [month, year, ...rest] = value.split(" ");
  return rest.length === 0 && MOIS.includes(month) && /^\d{4}$/.test(year ?? "");
}

// ——— Dates d'un jour, stockées au format « 2026-09-28 » ———

// La date du jour à Paris, ex. « 2026-09-28 ».
export function aujourdhui(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
}

export function isDateJour(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// « 2026-09-28 » → « 28 septembre » (court) ou « lundi 28 septembre 2026 » (long).
export function formatJour(iso: string, long = false) {
  const date = new Date(`${iso}T12:00:00Z`); // midi UTC : même jour quel que soit le fuseau
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    ...(long ? { weekday: "long", year: "numeric" } : {}),
  }).format(date);
}

// ——— Ordre des mois (pour les historiques) ———

// « Septembre 2026 » → un nombre croissant avec le temps (année × 12 + mois), ou null si le libellé est invalide.
export function rangMois(label: string): number | null {
  if (!isMonthLabel(label)) return null;
  const [month, year] = label.split(" ");
  return Number(year) * 12 + MOIS.indexOf(month);
}

export function moisDuRang(rang: number) {
  return `${MOIS[rang % 12]} ${Math.floor(rang / 12)}`;
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// « Septembre 2026 » → « sept. » (ou « sept. 26 » avec l'année).
export function moisCourt(label: string, avecAnnee = false) {
  const [month, year] = label.split(" ");
  const court = MOIS_COURTS[MOIS.indexOf(month)] ?? month;
  return avecAnnee ? `${court} ${year?.slice(2)}` : court;
}
