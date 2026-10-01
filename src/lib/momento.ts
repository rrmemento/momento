import type { KpiDonnees } from "./kpis";
import { libelleAjuste, objectifDuMois, type MoisSpecial } from "./mois-special";
import type { NiveauMois } from "./niveau-mois";
import type { Analysis, Insight, OneOnOne, RawRep, Rep, Status, StatusKey, Subject } from "./types";

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// Formate un pourcentage : "27.3 %", "25 %" ou "—" si la donnée manque.
export const pc = (v: number | null) => (v == null ? "—" : v.toFixed(v % 1 ? 1 : 0) + " %");

export const firstName = (rep: Rep) => rep.name.split(" ")[0];

// Cibles de VOLUME (POS vendus, ventes OG) : au prorata de l'objectif du mois.
// Mois normal : ratio 1 (4 POS min., cible OG 5). Mois particulier (congés…) : objectif ajusté / budget,
// ex. objectif 8 au lieu de 16 → ratio ½ → 2 POS min., cible OG 3. Les % (POS share, taux, send back…) ne changent pas.
export function ciblesVolume(r: Pick<Rep, "objectif" | "budget">) {
  const ratio = r.budget > 0 && r.objectif > 0 ? r.objectif / r.budget : 1;
  const au = (n: number) => Math.max(1, Math.round(n * ratio));
  return {
    ratio,
    posMin: au(4), // POS vendus minimum (M3+)
    posQuasiNul: Math.floor(ratio), // POS « quasi nul » : 0-1 d'habitude, 0 si l'objectif est réduit
    posPourShare: au(3), // assez de POS pour juger le POS share
    posUpfront: au(2),
    ogCible: au(5),
    ogFort: au(8),
    ogFaible: Math.round(3 * ratio),
  };
}

// Délai moyen vente → pose : moins de 7 j = installe vite (bon), 7 à 12 j = à améliorer, au-delà de 12 j = critique.
export const DELAI_CIBLE = 7;
export const DELAI_MAX = 12;
export const niveauDelai = (jours: number): "bon" | "moyen" | "critique" =>
  jours < DELAI_CIBLE ? "bon" : jours <= DELAI_MAX ? "moyen" : "critique";

// Le pace du BI est calculé sur le budget normal : pour un mois particulier, on le ramène à l'objectif ajusté
// (même projection de fin de mois, comparée au nouvel objectif).
export function prepRep(r: RawRep, special: MoisSpecial | null = null): Rep {
  const objectif = objectifDuMois(r.budget, special);
  const ajuste = special && objectif ? r.budget / objectif : 1;
  const vPace = r.vPace != null ? Math.round(r.vPace * ajuste) : null;
  const iPace = r.iPace != null ? Math.round(r.iPace * ajuste) : null;
  const vAtt = objectif ? r.ventes / objectif : 0;
  const iAtt = objectif ? r.install / objectif : 0;
  return {
    ...r,
    vPace,
    iPace,
    hasKpis: true,
    partial: false,
    initials: r.name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
    level: r.budget >= 15 ? "M3+" : r.budget >= 10 ? "M2" : "M1",
    objectif,
    special,
    niveauMois: null,
    fiche: { sen: r.sen, budget: r.budget, demarrage: null },
    vAtt,
    iAtt,
    posInstPct: r.install ? (r.posInst / r.install) * 100 : 0,
    vPaceF: vPace != null ? vPace / 100 : vAtt,
    iPaceF: iPace != null ? iPace / 100 : iAtt,
  };
}

type RepBase = { id: string; name: string; sen: string; budget: number; demarrage?: string | null };

// Le niveau et le budget DU MOIS (calculés depuis le démarrage) remplacent ceux de la fiche quand ils sont connus.
function avecNiveau(rep: Rep, base: RepBase, niveau: NiveauMois | null): Rep {
  return { ...rep, niveauMois: niveau, fiche: { sen: base.sen, budget: base.budget, demarrage: base.demarrage ?? null } };
}
const baseDuMois = (base: RepBase, niveau: NiveauMois | null): RepBase =>
  niveau ? { ...base, sen: niveau.seniorite, budget: niveau.budget } : base;

// Un commercial lu en base dont les KPIs ne sont pas encore renseignés : tout à zéro / vide.
export function repWithoutKpis(
  base: RepBase,
  special: MoisSpecial | null = null,
  niveau: NiveauMois | null = null,
): Rep {
  const { id, name, sen, budget } = baseDuMois(base, niveau);
  const rep = prepRep(
    {
      id, name, sen, budget,
      install: 0, vPace: null, iPace: null, quick: null, avgDays: null, backlog: 0, ventes: 0,
      sendback: null, rate: null, posSales: 0, posInst: 0, posShare: null, posUpfront: null, posRate: null, og: 0,
      ihcr: null, ihQuick: null, ihMtg: null, mtgAc: null, discount: null,
    },
    special,
  );
  return { ...avecNiveau(rep, base, niveau), hasKpis: false };
}

// Un commercial + ses chiffres saisis (kpis_mensuels.donnees) → le commercial analysé par MOMENTO.
// « Chiffres à venir » UNIQUEMENT pour un mois jamais importé ni saisi. Chaque enregistrement (import BI ou saisie)
// écrit les 17 cases du mois, case vide = null : un mois saisi a donc toujours des cases, et il a un vrai statut.
// Sur le BI une case vide vaut 0 : ventes et installs vides d'un mois saisi = 0 (un 0 vente se juge, il ne s'attend pas).
// Les autres comptes vides valent 0 ; les taux / % / € vides restent « non renseignés » (null).
// `special` : mois particulier (congés…) → l'atteinte se juge sur l'objectif ajusté (prioritaire).
// `niveau` : niveau et budget de CE mois (calculés depuis le démarrage) ; sinon ceux de la fiche.
export function repFromKpis(
  base: RepBase,
  d: KpiDonnees | undefined,
  special: MoisSpecial | null = null,
  niveau: NiveauMois | null = null,
): Rep {
  if (!d || Object.keys(d).length === 0) return repWithoutKpis(base, special, niveau);
  const duMois = baseDuMois(base, niveau);
  const zero = (v: number | null | undefined) => v ?? 0;
  const none = (v: number | null | undefined) => v ?? null;
  return avecNiveau(prepRep({
    ...duMois,
    // Volume
    ventes: zero(d.ventes),
    vPace: none(d.vPace),
    og: zero(d.og),
    rate: none(d.taux), // « taux » dans la saisie = « rate » dans l'analyse
    // Installation
    install: zero(d.install),
    iPace: none(d.iPace),
    backlog: zero(d.backlog),
    avgDays: none(d.avgDays),
    quick: none(d.quick),
    // POS
    posSales: zero(d.posSales),
    posInst: zero(d.posInst),
    posShare: none(d.posShare),
    posUpfront: none(d.posUpfront),
    // Activité
    sendback: none(d.sendback),
    ihcr: none(d.ihcr),
    ihQuick: none(d.ihQuick),
    mtgAc: null, // « Meeting avec AC » n'est plus suivi (aucun objectif AC)
    // Pas dans la saisie manuelle
    ihMtg: null,
    posRate: null,
    discount: null,
  }, special), base, niveau);
}

/* ===== Statuts — 3 piliers : ventes (pace), installs (pace), POS share ===== */
// Chaque pilier est OK, léger ou cata :
//   ventes / installs : OK ≥ 100 %, léger 80-100 %, cata < 80 % (pace = projection fin de mois du BI)
//   POS share (pour TOUS les niveaux, M1 / M2 / M3+) : OK ≥ 25 %, léger 15-25 %, cata < 15 %
// Statut = compte des piliers : au moins 1 cata → à accompagner ; sinon 3 légers → à surveiller ;
// exactement 2 légers → en bonne voie ; au plus 1 léger → en forme. Un POS share non renseigné ne compte pas.
// Le send back > 18 % et le POS 0-1 en M3+ NE changent PAS le statut : ils restent en vigilance dans l'analyse.
export const POS_SHARE_CIBLE = 25; // %
export const POS_SHARE_CATA = 15; // %

export type EtatPilier = "ok" | "leger" | "cata";
export type Pilier = { nom: string; valeur: string; etat: EtatPilier };

const etatPace = (f: number): EtatPilier => (f >= 1 ? "ok" : f >= 0.8 ? "leger" : "cata");
const etatPosShare = (ps: number): EtatPilier => (ps >= POS_SHARE_CIBLE ? "ok" : ps >= POS_SHARE_CATA ? "leger" : "cata");

export function piliers(r: Rep): Pilier[] {
  const pct = (f: number) => Math.round(f * 100) + " %";
  const p: Pilier[] = [
    { nom: "ventes", valeur: pct(r.vPaceF), etat: etatPace(r.vPaceF) },
    { nom: "installs", valeur: pct(r.iPaceF), etat: etatPace(r.iPaceF) },
  ];
  if (r.posShare != null) p.push({ nom: "POS share", valeur: pc(r.posShare), etat: etatPosShare(r.posShare) });
  return p;
}

// Le statut (clé + raison) tiré du compte des piliers cata / légers.
export function statutPiliers(r: Rep): { k: "acc" | "watch" | "voie" | "ok"; why: string } {
  const p = piliers(r);
  const cata = p.filter((x) => x.etat === "cata");
  const legers = p.filter((x) => x.etat === "leger");
  const liste = (xs: Pilier[]) => xs.map((x) => `${x.nom} ${x.valeur}`).join(", ");
  if (cata.length) return { k: "acc", why: liste(cata) };
  if (legers.length >= 3) return { k: "watch", why: liste(legers) + " à remonter" };
  if (legers.length === 2) return { k: "voie", why: liste(legers) + " à remonter" };
  // En forme tolère 1 petit écart (1 pilier léger).
  if (legers.length === 1) return { k: "ok", why: `objectifs tenus, ${liste(legers)} à finir` };
  return { k: "ok", why: "ventes, installs et POS share au niveau" };
}

const LIBELLE_STATUT = { acc: "À accompagner", watch: "À surveiller", voie: "En bonne voie", ok: "En forme" } as const;

export function statut(r: Rep): Status {
  if (!r.hasKpis)
    return {
      k: "none",
      t: "Chiffres à venir",
      why: r.partial ? "ventes ou installs pas encore saisis" : "KPIs du mois non renseignés",
    };
  const { k, why } = statutPiliers(r);
  return { k, t: LIBELLE_STATUT[k], why };
}

const statusRank: Record<StatusKey, number> = { acc: 0, watch: 1, voie: 2, ok: 3, none: 4 };

// Les commerciaux qui ont le plus besoin d'accompagnement en premier.
export function orderReps(reps: Rep[], st: (r: Rep) => Status = statut): Rep[] {
  return [...reps].sort((a, b) => statusRank[st(a).k] - statusRank[st(b).k] || a.vAtt - b.vAtt);
}

/* ===== Analyse — points de vigilance = situations vraiment critiques seulement ===== */

// Ordre de priorité des axes de progression (mots du titre) : le volume avant tout.
const PRIORITE_AXES = [
  "Ventes",
  "Installations",
  "Délai",
  "Send back",
  "POS sous",
  "OG",
  "Conversion IH",
  "POS Share",
  "POS installés",
];
export function analyse(r: Rep): Analysis {
  const S: Insight[] = [];
  const A: Insight[] = [];
  const N: Insight[] = [];
  if (!r.hasKpis) return { S, A, N }; // pas de chiffres, rien à analyser
  const eu = (n: number) => "€ " + Math.round(n);
  const aj = r.special ? ` (${libelleAjuste(r.special)})` : ""; // mois particulier : on le signale discrètement

  // Un résultat juste au-dessus de l'objectif (moins de 110 %) : « à maintenir », jamais un triomphe.
  const aMaintenir = (att: number) => (att < 1.1 ? " À maintenir : continue sur cette lancée." : "");
  // Un objectif non atteint ne s'affiche jamais « 100 % » : l'atteinte se lit arrondie à l'INFÉRIEUR (99,6 % → 99 %).
  // ventes
  if (r.vAtt >= 1)
    S.push({ big: Math.round(r.vAtt * 100) + " %", tt: "Budget ventes atteint", dd: `${r.ventes} ventes pour un objectif de ${r.objectif}.${aj}${aMaintenir(r.vAtt)}` });
  else if (r.vAtt < 0.5)
    N.push({ big: Math.floor(r.vAtt * 100) + " %", tt: "Ventes effondrées", dd: `${r.ventes}/${r.objectif} sur le mois — le socle n'y est pas.${aj}` });
  else
    A.push({ big: Math.floor(r.vAtt * 100) + " %", tt: "Ventes sous l'objectif", dd: `${r.ventes}/${r.objectif}, ${r.objectif - r.ventes} à aller chercher.${aj}` });

  // installations
  if (r.iAtt >= 1)
    S.push({ big: Math.round(r.iAtt * 100) + " %", tt: r.iAtt < 1.1 ? "Budget installations atteint" : "Budget installations dépassé", dd: `${r.install} installations sur un budget de ${r.objectif}.${aj}${aMaintenir(r.iAtt)}` });
  else if (r.iAtt < 0.4)
    N.push({ big: r.install + "", tt: r.install === 0 ? "Aucune installation" : "Installations effondrées", dd: `${r.install}/${r.objectif} — priorité n°1 du 1:1.${aj}` });
  else
    A.push({ big: Math.floor(r.iAtt * 100) + " %", tt: "Installations à remonter", dd: `${r.install}/${r.objectif}, ${r.objectif - r.install} manquantes.${aj}` });

  // POS vendus (critique si 0-1 en M3+)
  const c = ciblesVolume(r); // POS et OG : cibles au prorata de l'objectif du mois (mois particulier)
  if (r.level === "M3+" && r.posSales <= c.posQuasiNul)
    N.push({ big: r.posSales + "", tt: "POS quasi absent", dd: `${r.posSales} POS sur ${r.ventes} ventes — manque à gagner direct (min ${c.posMin}/mois${aj}).` });
  else if (r.level === "M3+" && r.posSales >= c.posMin && r.posShare != null && r.posShare >= 22)
    S.push({ big: r.posSales + "", tt: "POS solide", dd: `${r.posSales} POS et ${pc(r.posShare)} de share.` });
  else if (r.level === "M3+" && r.posSales < c.posMin)
    A.push({ big: `${r.posSales}/${c.posMin}`, tt: "POS sous l'objectif", dd: `viser ${c.posMin} POS ce mois-ci minimum${aj}.` });

  // POS share
  if (r.posShare != null && r.posShare >= 25) S.push({ big: pc(r.posShare), tt: "POS Share au niveau", dd: `au-dessus de la cible 25 %.` });
  else if (r.posShare != null && r.level === "M3+" && r.posSales >= c.posPourShare)
    A.push({ big: pc(r.posShare), tt: "POS Share sous la cible", dd: `${pc(r.posShare)} de POS Share (cible 25 %).` });

  // POS installés %
  if (r.install && r.posInstPct >= 20)
    S.push({ big: pc(r.posInstPct), tt: "POS bien installés", dd: `${r.posInst} POS installés (cible ≥20 %).` });
  else if (r.install && r.posInstPct < 20)
    A.push({ big: pc(r.posInstPct), tt: "POS installés sous 20 %", dd: `${r.posInst}/${r.install} — viser 20 % d'installs POS.` });

  // send back
  if (r.sendback != null && r.sendback <= 10)
    S.push({ big: pc(r.sendback), tt: "Send back maîtrisé", dd: `dossiers propres, peu de retours.` });
  else if (r.sendback != null && r.sendback > 18)
    N.push({ big: pc(r.sendback), tt: "Send back (erreurs) élevé", dd: `${pc(r.sendback)} de send back (cible <10 %). Fiabiliser les deals.` });
  else if (r.sendback != null && r.sendback > 10)
    A.push({ big: pc(r.sendback), tt: "Send back au-dessus de la cible", dd: `${pc(r.sendback)} (cible <10 %).` });

  // OG
  if (r.og >= c.ogFort) S.push({ big: r.og + "", tt: "Bon moteur OG", dd: `${r.og} ventes OG, au-dessus de la cible ${c.ogCible}${aj}.` });
  else if (r.og < c.ogFaible && r.level !== "M1")
    A.push({ big: r.og + "", tt: "Prospection OG juste", dd: `relancer la création de RDV en propre.` });

  // délai
  if (r.avgDays != null) {
    const j = r.avgDays + " j";
    const niveau = niveauDelai(r.avgDays);
    if (niveau === "bon") S.push({ big: j, tt: "Pose rapide", dd: `délai vente → pose court (cible < ${DELAI_CIBLE} j).` });
    else if (niveau === "moyen")
      A.push({ big: j, tt: "Délai d'installation à réduire", dd: `${j} entre la vente et la pose (cible < ${DELAI_CIBLE} j).` });
    else
      N.push({
        big: j,
        tt: "Délai d'installation trop long",
        dd: `${j} entre la vente et la pose (cible < ${DELAI_CIBLE} j, alerte au-delà de ${DELAI_MAX} j).`,
      });
  }

  // conversion IH
  if (r.ihcr != null && r.ihcr >= 20) S.push({ big: pc(r.ihcr), tt: "Conversion IH forte", dd: `transforme bien ses RDV entrants.` });
  else if (r.ihcr != null && r.ihcr < 12)
    A.push({
      big: pc(r.ihcr),
      tt: "Conversion IH basse",
      dd: r.ihMtg != null ? `${r.ihMtg} RDV IH pour peu de closing.` : `peu de closing sur ses RDV IH.`,
    });

  // upfront
  if (r.posUpfront != null && r.posUpfront >= 1200 && r.posSales >= c.posUpfront)
    S.push({ big: eu(r.posUpfront), tt: "Beaux POS upfront", dd: `au-dessus de la moyenne 1200 €.` });

  // Au plus 3 succès, 2 axes et 1 point de vigilance : l'essentiel, pas une liste décourageante.
  // Axes classés par priorité MOMENTO (volume d'abord) ; succès et vigilance sont déjà produits dans cet ordre.
  const rangAxe = (i: Insight) => {
    const k = PRIORITE_AXES.findIndex((mot) => i.tt.includes(mot));
    return k < 0 ? PRIORITE_AXES.length : k;
  };
  return { S: S.slice(0, 3), A: [...A].sort((x, y) => rangAxe(x) - rangAxe(y)).slice(0, 2), N: N.slice(0, 1) };
}

/* ===== Fiche 1:1 vide ===== */
export const emptySubject = (): Subject => ({ t: "", o: "", r: "", g: "", questions: "", reponse: "", ia: false, cible: null, suivi: null });

export const emptyOneOnOne = (): OneOnOne => ({
  ressenti: "",
  fier: "",
  bloque: "",
  note: 0,
  titre: "",
  forts: "",
  sujets: [emptySubject()],
  besoin: "",
  objectif: "",
  clotureLe: null,
  perfReview: false,
  brief: null,
  diagnosticIa: null,
  analyseIa: null,
  analysesSales: {},
});
