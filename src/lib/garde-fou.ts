// Garde-fou anti-chiffre inventé (vue RM) : après chaque réponse de l'IA, chaque nombre cité est comparé aux
// valeurs réellement fournies (le BI, les engagements, les cibles MOMENTO). Un nombre qui ne correspond à aucune
// d'elles, à l'arrondi près, reste affiché mais marqué « (à vérifier) » : on ne le présente jamais comme un fait.
import type { Analysis, BriefIa, DiagnosticIa, Insight, Subject } from "./types";

export const A_VERIFIER = "(à vérifier)";

// Repères que l'IA a le droit de citer sans qu'ils soient dans le BI : cibles et seuils MOMENTO,
// petits nombres de langage courant (« 1 à 2 sales », « 3 mois »).
const REPERES = [20, 25, 10, 18, 80, 100, 50, 7, 12, 1, 2, 3];

// Un nombre écrit dans une phrase, avec son unité éventuelle : « 21,9 % », « 1 375 € », « 0.76 » —
// pas celui d'un code comme « M3+ » ou « 1:1 ».
const NOMBRE = /(?<![\p{L}\d:.,])(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,](\d+))?(?![\d]|[.,]\d)(\s?(?:%|€))?(?![\p{L}\d:])/gu;

const lire = (entier: string, decimales?: string) =>
  Number(`${entier.replace(/[ \u00a0\u202f]/g, "")}${decimales ? `.${decimales}` : ""}`);

// Les valeurs fournies à l'IA, et les petits comptes plausibles (nombre de sales, de mois…).
export function valeursAutorisees(valeurs: (number | null | undefined)[], compteMax = 0): number[] {
  const out = new Set<number>(REPERES);
  for (const v of valeurs) if (typeof v === "number" && Number.isFinite(v)) out.add(v);
  for (let n = 0; n <= compteMax; n += 1) out.add(n);
  // Les années (« septembre 2026 ») ne sont pas des chiffres de performance.
  for (let a = 2020; a <= 2035; a += 1) out.add(a);
  return [...out];
}

// Le nombre cité correspond-il à une valeur fournie, à l'arrondi près (à l'entier, ou au nombre de décimales cité) ?
function estFourni(n: number, autorisees: number[], decimales: number) {
  const f = 10 ** decimales;
  return autorisees.some((v) => Math.abs(v - n) < 1e-9 || Math.round(v * f) / f === n);
}

// Marque dans un texte chaque nombre non fourni : « 37 % » → « 37 % (à vérifier) ».
export function marquerTexte(texte: string, autorisees: number[]): { texte: string; douteux: boolean } {
  let douteux = false;
  const resultat = texte.replace(NOMBRE, (tout: string, entier: string, dec: string | undefined) => {
    if (estFourni(lire(entier, dec), autorisees, dec?.length ?? 0)) return tout;
    douteux = true;
    return `${tout} ${A_VERIFIER}`;
  });
  return { texte: resultat, douteux };
}

// ——— Appliqué aux réponses de l'IA de la vue RM ———

const marquer = (t: string, a: number[]) => marquerTexte(t, a).texte;

// Un point d'analyse : phrase et titre marqués ; un chiffre clé douteux est précédé de « ⚠ ».
function verifierPoint(i: Insight, a: number[]): Insight {
  const big = marquerTexte(i.big, a).douteux ? `⚠ ${i.big}` : i.big;
  return { big, tt: marquer(i.tt, a), dd: marquer(i.dd, a) };
}

export function verifierAnalyse(analyse: Analysis, a: number[]): Analysis {
  return { S: analyse.S.map((i) => verifierPoint(i, a)), A: analyse.A.map((i) => verifierPoint(i, a)), N: analyse.N.map((i) => verifierPoint(i, a)) };
}

export function verifierBrief(brief: BriefIa, a: number[]): BriefIa {
  return {
    ...brief,
    aborder: marquer(brief.aborder, a),
    celebrer: brief.celebrer.map((t) => marquer(t, a)),
    engagements: marquer(brief.engagements, a),
    sujet: marquer(brief.sujet, a),
    question: marquer(brief.question, a),
    ouverture: brief.ouverture.map((t) => marquer(t, a)),
    ...(brief.analyse ? { analyse: verifierAnalyse(brief.analyse, a) } : {}),
  };
}

export function verifierSujets(sujets: Subject[], a: number[]): Subject[] {
  return sujets.map((s) => ({ ...s, t: marquer(s.t, a), o: marquer(s.o, a), questions: marquer(s.questions, a) }));
}

export function verifierDiagnostic(d: DiagnosticIa, a: number[]): DiagnosticIa {
  return {
    ...d,
    phrase: marquer(d.phrase, a),
    trajectoire: { ...d.trajectoire, texte: marquer(d.trajectoire.texte, a) },
    monte: d.monte.map((t) => marquer(t, a)),
    coince: d.coince.map((t) => marquer(t, a)),
    priorite: { texte: marquer(d.priorite.texte, a), action: marquer(d.priorite.action, a) },
    reussites: d.reussites.map((t) => marquer(t, a)),
  };
}

// Les nombres présents dans un texte fourni à l'IA (ex. un engagement « Ventes signées ≥ 12 »).
export function nombresDe(texte: string | null | undefined): number[] {
  if (!texte) return [];
  return [...texte.matchAll(NOMBRE)].map((m) => lire(m[1], m[2]));
}

// ——— Filtre en dur anti-réallocation de leads (vue RM) ———
// Les leads sont envoyés par la boîte : personne ne peut les déplacer entre des personnes. Toute PHRASE qui le propose
// est retirée de la réponse de l'IA, quoi qu'en dise la consigne (insensible à la casse et aux accents).
// Ce dont on parle : des leads, des IH ou des rendez-vous. Sans l'un d'eux dans la phrase, rien n'est retiré
// (« réaffectation du portefeuille », « redistribuer les POS » restent).
const SUJET_LEADS = /\b(leads?|ih|rendez-vous|rdv)\b/;
const OBJET = "(leads?|ih|rendez-vous|rdv)";

// Les verbes de déplacement : ils ne retirent la phrase QUE si elle parle aussi de leads / IH / RDV.
const VERBES_DEPLACEMENT = [
  /\breallou/, // réallouer
  /\breallocation/,
  /\bredistribu/, // redistribuer, redistribution
  /\breaffect/, // réaffecter, réaffectation
  /\bdeplac/, // déplacer
  /\bbascul/, // basculer
  /\btransfer/, // transférer, transfert
  /\breorient/, // réorienter
  /\bconfi(er|e|es|ez|ons|ent|era|eront|erait)\b/, // confier (pas « confiance »)
];

// Des tournures qui parlent d'elles-mêmes de bouger des leads.
const TOURNURES_LEADS = [
  new RegExp(String.raw`\brepartir (les |des |ses |leurs )?${OBJET}\b`),
  new RegExp(String.raw`\brepartition des ${OBJET}\b`),
  new RegExp(String.raw`\bdistribu\w* (des |les )?${OBJET}\b`), // « distribution des leads », « distribuer les RDV »
  new RegExp(String.raw`\b(plus|moins|davantage) (de |d')${OBJET} (a|au|aux)\b`), // « plus de leads à Julie »
];

const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Une phrase recommande-t-elle de bouger des leads (IH, RDV) entre des personnes ?
export function proposeReallocation(phrase: string) {
  const p = sansAccents(phrase);
  if (TOURNURES_LEADS.some((r) => r.test(p))) return true;
  return SUJET_LEADS.test(p) && VERBES_DEPLACEMENT.some((r) => r.test(p));
}

// Retire d'un texte chaque phrase qui propose de réallouer des leads (le reste du texte est gardé).
export function retirerReallocation(texte: string): string {
  const phrases = texte.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g) ?? [texte];
  return phrases
    .filter((p) => !proposeReallocation(p))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Appliqué à TOUTE la réponse JSON de l'IA, avant sa lecture : chaque texte est nettoyé. Un champ vidé devient invalide,
// et la lecture habituelle l'écarte (un point d'analyse ou une question sans texte disparaît ; un brief sans
// question est rejeté et l'IA est relancée).
export function filtrerReallocation<T>(valeur: T): T {
  if (typeof valeur === "string") return retirerReallocation(valeur) as T;
  if (Array.isArray(valeur)) return valeur.map(filtrerReallocation) as T;
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, filtrerReallocation(v)])) as T;
  }
  return valeur;
}
