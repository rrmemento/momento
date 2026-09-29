// Le Parcours d'un commercial : l'évolution de ses chiffres mois par mois (onglet Parcours).
import { formatKpi, kpiField, type KpiDonnees, type KpiKey } from "./kpis";
import { moisDuRang, previousMonthLabel, rangMois } from "./mois";
import { libelleAjuste, libelleMoisParticulier, type MoisSpeciaux } from "./mois-special";
import { objectifsDuCommercial, type NiveauxMois } from "./niveau-mois";
import { ciblesVolume, DELAI_CIBLE } from "./momento";
import { engagements, type Engagement } from "./suivi";
import type { OneOnOne, Subject } from "./types";

export type PointParcours = {
  mois: string;
  valeur: number | null; // null = pas de donnée ce mois-là
  detail?: string; // précision affichée au survol (ex. « 3 tenus sur 4 », « objectif ajusté (congés) : 8 »)
  special?: boolean; // mois particulier (congés, arrêt, ramp-up…)
  objectif?: number; // objectif DE CE MOIS (ventes, installations) : budget du mois ou objectif ajusté
};

export type SerieParcours = {
  cle: string;
  titre: string;
  unite: "" | " %" | " j";
  decimales: number;
  repere: { valeur: number; libelle: string } | null; // objectif ou cible MOMENTO, en pointillé
  mieux: "haut" | "bas"; // sens dans lequel une hausse est une bonne nouvelle
  points: PointParcours[];
};

// La valeur d'un KPI pour un mois. Même règle que MOMENTO : dans un mois renseigné (ventes et installs saisies),
// un COMPTE vide (POS, OG… souvent affiché vide au lieu de 0 sur le BI) vaut 0 — la courbe passe alors par 0.
// Un % vide reste inconnu, et un mois sans chiffres reste un trou.
export function valeurDuMois(d: KpiDonnees | undefined, kpi: KpiKey): number | null {
  const v = d?.[kpi];
  if (v != null) return v;
  const renseigne = d?.ventes != null && d.install != null;
  return renseigne && kpiField(kpi)?.integer ? 0 : null;
}

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
      cle: "avgDays",
      kpi: "avgDays",
      titre: "Délai moyen d'installation",
      unite: " j",
      decimales: 1,
      repere: { valeur: DELAI_CIBLE, libelle: `cible < ${DELAI_CIBLE} j` },
      mieux: "bas", // plus c'est court, mieux c'est
    },
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
  speciaux = {},
  niveaux = {},
}: {
  repId: string;
  budget: number; // budget de la fiche (secours pour les mois sans niveau)
  m3: boolean;
  historique: Record<string, Record<string, KpiDonnees>>;
  entretiens: Record<string, Record<string, OneOnOne>>;
  speciaux?: MoisSpeciaux; // mois particuliers : point creux + objectif ajusté au survol
  niveaux?: NiveauxMois; // séniorité et budget de chaque mois
}): SerieParcours[] {
  const mois = moisDuParcours(historique, repId);
  const duMois = objectifsDuCommercial(repId, budget, niveaux, speciaux);
  const dernier = mois.length ? duMois(mois[mois.length - 1]) : null;
  // Un mois particulier est signalé sur toutes les courbes ; sur ventes et installations, avec son objectif ajusté.
  const marque = (m: string, volume: boolean): Pick<PointParcours, "special" | "detail"> => {
    const s = speciaux[m]?.[repId];
    if (!s) return {};
    return { special: true, detail: volume ? `${libelleAjuste(s)} : ${s.objectif}` : libelleMoisParticulier(s) };
  };
  // Objectif du mois sur les courbes de volume : ventes et installations = objectif du mois ;
  // POS vendus (mois en M3+) et ventes OG = cibles MOMENTO au prorata (mois particulier : objectif ajusté).
  const objectifDuPoint = (kpi: KpiKey, m: string): Pick<PointParcours, "objectif"> => {
    const o = duMois(m);
    if (kpi === "ventes" || kpi === "install") return { objectif: o.objectif };
    const c = ciblesVolume({ objectif: o.objectif, budget: o.budget });
    if (kpi === "posSales" && o.m3) return { objectif: c.posMin };
    if (kpi === "og") return { objectif: c.ogCible };
    return {};
  };
  // Libellés des repères : budget et niveau du mois le plus récent.
  const series: SerieParcours[] = indicateurs(dernier?.budget ?? budget, dernier?.m3 ?? m3).map(({ kpi, ...i }) => ({
    ...i,
    points: mois.map((m) => ({
      mois: m,
      valeur: valeurDuMois(historique[m]?.[repId], kpi),
      ...marque(m, kpi === "ventes" || kpi === "install"),
      ...objectifDuPoint(kpi, m),
    })),
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
