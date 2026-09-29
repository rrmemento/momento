// Le Parcours d'un commercial : l'évolution de ses chiffres mois par mois (onglet Parcours).
import { formatKpi, kpiField, type KpiDonnees, type KpiKey } from "./kpis";
import { moisDuRang, previousMonthLabel, rangMois } from "./mois";
import { engagements, type Engagement } from "./suivi";
import type { OneOnOne, Subject } from "./types";

export type PointParcours = {
  mois: string;
  valeur: number | null; // null = pas de donnée ce mois-là
  detail?: string; // précision affichée au survol (ex. « 3 tenus sur 4 »)
};

export type SerieParcours = {
  cle: string;
  titre: string;
  unite: "" | " %";
  decimales: number;
  repere: { valeur: number; libelle: string } | null; // objectif ou cible MOMENTO, en pointillé
  mieux: "haut" | "bas"; // sens dans lequel une hausse est une bonne nouvelle
  points: PointParcours[];
};

// Tous les mois du commercial, du premier au dernier chiffre enregistré (les mois sans chiffres restent vides).
export function moisDuParcours(historique: Record<string, Record<string, KpiDonnees>>, repId: string) {
  const rangs = Object.keys(historique)
    .filter((m) => historique[m][repId])
    .map(rangMois)
    .filter((r): r is number => r != null);
  if (!rangs.length) return [];
  const debut = Math.min(...rangs);
  return Array.from({ length: Math.max(...rangs) - debut + 1 }, (_, k) => moisDuRang(debut + k));
}

type Indicateur = Omit<SerieParcours, "points"> & { kpi: KpiKey };

// Les repères sont ceux de l'analyse MOMENTO (objectif du mois, cibles POS share 25 %, OG 5, conversion IH 20 %).
function indicateurs(budget: number, m3: boolean): Indicateur[] {
  const b = { valeur: budget, libelle: `objectif ${budget}` };
  return [
    { cle: "ventes", kpi: "ventes", titre: "Ventes signées", unite: "", decimales: 0, repere: b, mieux: "haut" },
    { cle: "install", kpi: "install", titre: "Installations", unite: "", decimales: 0, repere: b, mieux: "haut" },
    {
      cle: "posSales",
      kpi: "posSales",
      titre: "POS vendus",
      unite: "",
      decimales: 0,
      repere: m3 ? { valeur: 4, libelle: "min. 4" } : null, // l'exigence POS ne concerne que les M3+
      mieux: "haut",
    },
    {
      cle: "posShare",
      kpi: "posShare",
      titre: "POS share",
      unite: " %",
      decimales: 1,
      repere: { valeur: 25, libelle: "cible 25 %" },
      mieux: "haut",
    },
    { cle: "taux", kpi: "taux", titre: "Taux moyen", unite: " %", decimales: 2, repere: null, mieux: "haut" },
    {
      cle: "og",
      kpi: "og",
      titre: "Ventes OG",
      unite: "",
      decimales: 0,
      repere: { valeur: 5, libelle: "cible 5" },
      mieux: "haut",
    },
    {
      cle: "ihcr",
      kpi: "ihcr",
      titre: "Conversion IH (IH CR)",
      unite: " %",
      decimales: 1,
      repere: { valeur: 20, libelle: "cible 20 %" },
      mieux: "haut",
    },
  ];
}

// Taux de tenue d'un mois M : les engagements du 1:1 de M-1, jugés (automatiquement ou par le manager) en M.
// Seuls les engagements tranchés comptent (tenus / tenus + non tenus) ; « en cours » et « à juger » sont écartés.
function tenueDuMois(
  mois: string,
  repId: string,
  historique: Record<string, Record<string, KpiDonnees>>,
  entretiens: Record<string, Record<string, OneOnOne>>,
): PointParcours {
  const liste = engagements(entretiens[previousMonthLabel(mois)]?.[repId], historique[mois]?.[repId]);
  const tenus = liste.filter((e) => e.statut === "tenu").length;
  const tranches = tenus + liste.filter((e) => e.statut === "non_tenu").length;
  if (!tranches) return { mois, valeur: null };
  return { mois, valeur: (tenus / tranches) * 100, detail: `${tenus} tenu${tenus > 1 ? "s" : ""} sur ${tranches}` };
}

export function seriesParcours({
  repId,
  budget,
  m3,
  historique,
  entretiens,
}: {
  repId: string;
  budget: number;
  m3: boolean;
  historique: Record<string, Record<string, KpiDonnees>>;
  entretiens: Record<string, Record<string, OneOnOne>>;
}): SerieParcours[] {
  const mois = moisDuParcours(historique, repId);
  const series: SerieParcours[] = indicateurs(budget, m3).map(({ kpi, ...i }) => ({
    ...i,
    points: mois.map((m) => ({ mois: m, valeur: historique[m]?.[repId]?.[kpi] ?? null })),
  }));
  series.push({
    cle: "tenue",
    titre: "Engagements tenus",
    unite: " %",
    decimales: 0,
    repere: null,
    mieux: "haut",
    points: mois.map((m) => tenueDuMois(m, repId, historique, entretiens)),
  });
  return series;
}

// ——— Ses engagements, mois par mois (partie « Ses engagements ») ———

export type EngagementPasse = Engagement & {
  ecart: string | null; // non tenu avec objectif chiffré : « il a manqué 2 », « 3 j au-dessus de la cible »
};

export type EngagementsDuMois = {
  mois: string; // le 1:1 où ils ont été pris
  moisJuge: string; // le mois dont les chiffres les jugent
  liste: EngagementPasse[];
};

const UNITES = { "%": " %", j: " j", "€": " €" } as const;

function ecart(sujet: Subject | undefined, chiffres: KpiDonnees | undefined): string | null {
  const c = sujet?.cible;
  const reel = c ? chiffres?.[c.kpi] : null;
  if (!c || c.valeur == null || reel == null) return null;
  const f = kpiField(c.kpi);
  const diff = formatKpi(Math.round(Math.abs(reel - c.valeur) * 100) / 100) + (f?.unit ? UNITES[f.unit] : "");
  return c.sens === ">=" ? `il a manqué ${diff}` : `${diff} au-dessus de la cible`;
}

// Tous les engagements pris dans les 1:1 du commercial, du plus récent au plus ancien.
// Ceux du mois M se jugent sur les chiffres de M+1 (même logique que le rappel du One-on-One).
export function engagementsDuParcours(
  repId: string,
  historique: Record<string, Record<string, KpiDonnees>>,
  entretiens: Record<string, Record<string, OneOnOne>>,
): EngagementsDuMois[] {
  return Object.keys(entretiens)
    .map((mois) => ({ mois, rang: rangMois(mois), fiche: entretiens[mois][repId] }))
    .filter((x): x is { mois: string; rang: number; fiche: OneOnOne } => x.rang != null && Boolean(x.fiche))
    .sort((a, b) => b.rang - a.rang)
    .map(({ mois, rang, fiche }) => {
      const moisJuge = moisDuRang(rang + 1);
      const chiffres = historique[moisJuge]?.[repId];
      const liste = engagements(fiche, chiffres).map((e) => ({
        ...e,
        ecart: e.statut === "non_tenu" ? ecart(fiche.sujets[e.index], chiffres) : null,
      }));
      return { mois, moisJuge, liste };
    })
    .filter((m) => m.liste.length);
}
