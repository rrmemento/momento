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

export function isMonthLabel(value: string) {
  const [month, year, ...rest] = value.split(" ");
  return rest.length === 0 && MOIS.includes(month) && /^\d{4}$/.test(year ?? "");
}
