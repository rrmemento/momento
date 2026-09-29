// Coups d'éclat et signaux faibles d'un commercial, calculés sur tout son historique (onglet Parcours).
// Calcul pur, sans IA : utilisé par l'écran et envoyé à Gemini comme base de son analyse.
import { formatKpi, kpiField, type KpiDonnees, type KpiKey } from "./kpis";
import { rangMois } from "./mois";
import { objectifDuMois, type MoisSpeciaux } from "./mois-special";
import { engagementsDuParcours, moisDuParcours } from "./parcours";
import type { OneOnOne } from "./types";

type Historique = Record<string, Record<string, KpiDonnees>>;
type Entretiens = Record<string, Record<string, OneOnOne>>;

const UNITES = { "%": " %", j: " j", "€": " €" } as const;
const f = (kpi: KpiKey, v: number) => {
  const u = kpiField(kpi)?.unit;
  return formatKpi(Math.round(v * 10) / 10) + (u ? UNITES[u] : "");
};
const minuscule = (mois: string) => mois.toLowerCase();

// Les valeurs d'un KPI sur les mois du parcours (null = pas de chiffre ce mois-là).
function valeurs(mois: string[], historique: Historique, repId: string, kpi: KpiKey) {
  return mois.map((m) => ({ mois: m, v: historique[m]?.[repId]?.[kpi] ?? null }));
}

// ——— Coups d'éclat ———

export type CoupDEclat = { cle: string; icone: string; titre: string; detail: string; rang: number };

const RECORDS: { kpi: KpiKey; titre: string }[] = [
  { kpi: "ventes", titre: "Record de ventes" },
  { kpi: "install", titre: "Record d'installations" },
  { kpi: "posSales", titre: "Record de POS vendus" },
  { kpi: "og", titre: "Record de ventes OG" },
  { kpi: "posShare", titre: "Record de POS share" },
];

// La plus longue suite de mois consécutifs à l'objectif du mois (au moins 2).
function plusLongueSerie(points: { mois: string; v: number | null }[], objectif: (mois: string) => number) {
  let meilleure: { debut: string; fin: string; n: number } | null = null;
  let debut = 0;
  let n = 0;
  points.forEach((p, i) => {
    if (p.v != null && p.v >= objectif(p.mois)) {
      if (n === 0) debut = i;
      n += 1;
      if (n >= 2 && (!meilleure || n >= meilleure.n)) meilleure = { debut: points[debut].mois, fin: p.mois, n };
    } else n = 0;
  });
  return meilleure as { debut: string; fin: string; n: number } | null;
}

export function coupsDEclat({
  repId,
  budget,
  historique,
  entretiens,
  speciaux = {},
}: {
  repId: string;
  budget: number;
  historique: Historique;
  entretiens: Entretiens;
  speciaux?: MoisSpeciaux; // mois particulier → on juge l'atteinte sur l'objectif ajusté
}): CoupDEclat[] {
  const objectif = (m: string) => objectifDuMois(budget, speciaux[m]?.[repId]);
  const mois = moisDuParcours(historique, repId);
  const eclats: CoupDEclat[] = [];

  // Séries de mois à l'objectif (ventes, installations).
  for (const { kpi, libelle } of [
    { kpi: "ventes" as const, libelle: "ventes" },
    { kpi: "install" as const, libelle: "installations" },
  ]) {
    const s = budget ? plusLongueSerie(valeurs(mois, historique, repId, kpi), objectif) : null;
    if (s) {
      eclats.push({
        cle: `serie-${kpi}`,
        icone: "🔥",
        titre: `${s.n} mois d'affilée à l'objectif ${libelle}`,
        detail: `de ${minuscule(s.debut)} à ${minuscule(s.fin)}`,
        rang: rangMois(s.fin) ?? 0,
      });
    }
  }

  // Mois où ventes ET installations ont atteint l'objectif du mois (ajusté si mois particulier).
  const doubles = mois.filter((m) => {
    const d = historique[m]?.[repId];
    const o = objectif(m);
    return o > 0 && d?.ventes != null && d.install != null && d.ventes >= o && d.install >= o;
  });
  if (doubles.length) {
    const recents = doubles.slice(-3).reverse().map(minuscule);
    eclats.push({
      cle: "double",
      icone: "🎯",
      titre: `Double objectif atteint ${doubles.length > 1 ? `${doubles.length} fois` : "en " + minuscule(doubles[0])}`,
      detail: doubles.length > 1 ? `ventes et installations · ${recents.join(", ")}${doubles.length > 3 ? "…" : ""}` : "ventes et installations",
      rang: rangMois(doubles.at(-1)!) ?? 0,
    });
  }

  // Records personnels (au moins 2 mois pour parler de record).
  for (const r of RECORDS) {
    const pts = valeurs(mois, historique, repId, r.kpi).filter((p): p is { mois: string; v: number } => p.v != null);
    if (pts.length < 2) continue;
    const max = Math.max(...pts.map((p) => p.v));
    if (max <= 0) continue;
    const record = pts.findLast((p) => p.v === max)!;
    eclats.push({
      cle: `record-${r.kpi}`,
      icone: "🏆",
      titre: `${r.titre} : ${f(r.kpi, max)}`,
      detail: `en ${minuscule(record.mois)} · son meilleur mois sur ${pts.length}`,
      rang: rangMois(record.mois) ?? 0,
    });
  }

  // Engagements chiffrés tenus (les 2 plus récents).
  engagementsDuParcours(repId, historique, entretiens)
    .flatMap((m) => m.liste.filter((e) => e.statut === "tenu" && e.cible).map((e) => ({ ...e, mois: m.mois })))
    .slice(0, 2)
    .forEach((e) =>
      eclats.push({
        cle: `engagement-${e.mois}-${e.index}`,
        icone: "✅",
        titre: `Engagement tenu : ${e.cible}`,
        detail: `réalisé ${e.reel} · pris au 1:1 ${/^[AEIOUÉ]/.test(e.mois) ? "d'" : "de "}${minuscule(e.mois)}`,
        rang: rangMois(e.mois) ?? 0,
      }),
    );

  return eclats.sort((a, b) => b.rang - a.rang).slice(0, 6);
}

// ——— Signaux faibles (règles) ———

export type SignalFaible = { cle: string; titre: string; detail: string };

type Tendance = { kpi: KpiKey; libelle: string; volume: boolean; m3Seulement: boolean; mieux: "haut" | "bas" };

// Volume d'abord ; le POS ne compte que pour les M3+ (règles MOMENTO).
const TENDANCES: Tendance[] = [
  { kpi: "ventes", libelle: "Ventes", volume: true, m3Seulement: false, mieux: "haut" },
  { kpi: "install", libelle: "Installations", volume: true, m3Seulement: false, mieux: "haut" },
  { kpi: "og", libelle: "Ventes OG", volume: true, m3Seulement: false, mieux: "haut" },
  { kpi: "posSales", libelle: "POS vendus", volume: true, m3Seulement: true, mieux: "haut" },
  { kpi: "posShare", libelle: "POS share", volume: false, m3Seulement: true, mieux: "haut" },
  { kpi: "ihcr", libelle: "Conversion IH", volume: false, m3Seulement: false, mieux: "haut" },
  { kpi: "taux", libelle: "Taux moyen", volume: false, m3Seulement: false, mieux: "haut" },
  { kpi: "sendback", libelle: "Send back", volume: false, m3Seulement: false, mieux: "bas" },
];

export function signauxFaibles({
  repId,
  m3,
  historique,
  entretiens,
  moisEnCours,
  speciaux = {},
}: {
  repId: string;
  m3: boolean;
  historique: Historique;
  entretiens: Entretiens;
  moisEnCours: string; // pas fini : ses volumes (ventes, installs…) sont encore partiels, on ne les juge pas
  speciaux?: MoisSpeciaux; // mois particuliers (congés…) : leurs volumes ne sont pas comparables, on ne les juge pas
}): SignalFaible[] {
  const tous = moisDuParcours(historique, repId);
  const signaux: SignalFaible[] = [];

  for (const t of TENDANCES) {
    if (t.m3Seulement && !m3) continue;
    const mois = t.volume ? tous.filter((m) => m !== moisEnCours) : tous;
    // Volumes d'un mois particulier (congés, arrêt…) : pas comparables, laissés de côté (comme un mois sans chiffres).
    const pts = valeurs(mois, historique, repId, t.kpi).map((p) =>
      t.volume && speciaux[p.mois]?.[repId] ? { ...p, v: null } : p,
    );

    // 1. Dégradation 3 mois de suite (3 mois consécutifs renseignés, chacun moins bon que le précédent).
    const [a, b, c] = pts.slice(-3);
    const pire = (x: number, y: number) => (t.mieux === "haut" ? y < x : y > x);
    if (c && a.v != null && b.v != null && c.v != null && pire(a.v, b.v) && pire(b.v, c.v)) {
      if (t.kpi !== "sendback" || c.v > 10) {
        signaux.push({
          cle: `tendance-${t.kpi}`,
          titre: `${t.libelle} en ${t.mieux === "haut" ? "baisse" : "hausse"} 3 mois de suite`,
          detail: `${f(t.kpi, a.v)} → ${f(t.kpi, b.v)} → ${f(t.kpi, c.v)} (${minuscule(a.mois)} → ${minuscule(c.mois)})`,
        });
        continue;
      }
    }

    // 2. Décrochage du volume par rapport à sa propre moyenne (au moins 3 mois avant pour comparer).
    if (t.kpi === "ventes" || t.kpi === "install") {
      const connus = pts.filter((p): p is { mois: string; v: number } => p.v != null);
      const dernier = connus.at(-1);
      const avant = connus.slice(0, -1);
      if (dernier && avant.length >= 3) {
        const moyenne = avant.reduce((s, p) => s + p.v, 0) / avant.length;
        if (moyenne > 0 && dernier.v < moyenne * 0.7) {
          signaux.push({
            cle: `decrochage-${t.kpi}`,
            titre: `${t.libelle} en décrochage`,
            detail: `${f(t.kpi, dernier.v)} en ${minuscule(dernier.mois)} contre ${f(t.kpi, moyenne)} en moyenne avant`,
          });
        }
      }
    }
  }

  // 3. Le même engagement non tenu au moins 2 fois (même KPI chiffré, ou même titre).
  const nonTenus = new Map<string, { libelle: string; mois: string[] }>();
  for (const m of engagementsDuParcours(repId, historique, entretiens)) {
    for (const e of m.liste.filter((x) => x.statut === "non_tenu")) {
      const sujet = entretiens[m.mois]?.[repId]?.sujets[e.index];
      if (!m3 && sujet?.cible?.kpi.startsWith("pos")) continue; // pas de signal POS pour un M1 ou un M2
      const cle = sujet?.cible ? `kpi:${sujet.cible.kpi}` : `titre:${e.titre.trim().toLowerCase()}`;
      const libelle = sujet?.cible ? (kpiField(sujet.cible.kpi)?.label ?? e.titre) : `« ${e.titre} »`;
      const g = nonTenus.get(cle) ?? { libelle, mois: [] };
      if (!g.mois.includes(m.mois)) g.mois.push(m.mois);
      nonTenus.set(cle, g);
    }
  }
  for (const [cle, g] of nonTenus) {
    if (g.mois.length < 2) continue;
    signaux.push({
      cle: `engagement-${cle}`,
      titre: `Engagement ${g.libelle} non tenu ${g.mois.length} fois`,
      detail: `1:1 ${g.mois.map(minuscule).reverse().join(", ")} : à retravailler autrement`,
    });
  }

  // 4. Son auto-note qui baisse (d'un 1:1 à l'autre).
  const notes = Object.keys(entretiens)
    .map((m) => ({ mois: m, rang: rangMois(m), note: entretiens[m][repId]?.note ?? 0 }))
    .filter((x): x is { mois: string; rang: number; note: number } => x.rang != null && x.note > 0)
    .sort((x, y) => x.rang - y.rang);
  const [n1, n2, n3] = notes.slice(-3);
  if (n3 && n1.note > n2.note && n2.note > n3.note) {
    signaux.push({
      cle: "note",
      titre: "Auto-note en baisse 3 fois de suite",
      detail: `${n1.note} → ${n2.note} → ${n3.note} /10 (${minuscule(n1.mois)} → ${minuscule(n3.mois)})`,
    });
  } else {
    const [avant, apres] = notes.slice(-2);
    if (apres && avant.note - apres.note >= 3) {
      signaux.push({
        cle: "note",
        titre: "Auto-note en chute",
        detail: `${avant.note} → ${apres.note} /10 (${minuscule(avant.mois)} → ${minuscule(apres.mois)})`,
      });
    }
  }

  return signaux;
}
