// La GRAVITÉ des points de l'analyse « data analyst » : l'IA écrit les phrases, les RÈGLES MOMENTO décident du bloc
// (succès / axe / point de vigilance), appliquées ici dans le code sur sa réponse :
// - un point de vigilance est réservé au vraiment critique (l'abusif), tel que défini par les règles MOMENTO :
//   ventes ou installs effondrées, POS 0-1 en M3+, send back > 18 % (pour une équipe : pace sous 50 %, send back > 18 %) ;
// - un sujet critique va TOUJOURS en vigilance, jamais en axe ni en succès ;
// - une « vigilance » de l'IA qui n'est pas critique selon les règles redescend en axe ;
// - plafond : 3 succès, 2 axes, 1 point de vigilance.
import { marquerTexte, verifierAnalyse } from "./garde-fou";
import { analyse, pc } from "./momento";
import { analyseTm } from "./statut-tm";
import type { AnalyseIa, Analysis, Insight, Rep, SujetPrevu } from "./types";

type Theme = "ventes" | "install" | "posSales" | "posShare" | "og" | "sendback" | "autre";

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function themeDuTexte(texte: string): Theme {
  const t = sansAccents(texte);
  if (/send ?back|sent back/.test(t)) return "sendback";
  if (/pos share|pos signed %|\bshare\b/.test(t)) return "posShare";
  if (/\bpos\b/.test(t)) return "posSales";
  if (/\bog\b/.test(t)) return "og";
  if (/install/.test(t)) return "install";
  if (/vente|signed sales|signature/.test(t)) return "ventes";
  return "autre";
}

// Le thème d'un point : d'abord d'après son titre, sinon d'après sa phrase.
export function themeDe(i: Insight): Theme {
  const duTitre = themeDuTexte(i.tt);
  return duTitre !== "autre" ? duTitre : themeDuTexte(i.dd);
}

// Les points CRITIQUES d'un sales selon les règles MOMENTO (dans leur ordre de priorité : volume d'abord).
export const critiquesCommercial = (rep: Rep): Insight[] => analyse(rep).N;

// Les points CRITIQUES d'un TM (son équipe) : pace sous 50 %, et send back > 18 %.
export function critiquesTm(rep: Rep, nbActifs: number): Insight[] {
  const liste = [...analyseTm(rep, nbActifs).N];
  if (rep.sendback != null && rep.sendback > 18) {
    liste.push({ big: pc(rep.sendback), tt: "Send back (erreurs) élevé", dd: `${pc(rep.sendback)} de send back (cible ≤ 10 %).` });
  }
  return liste;
}

export function appliquerGravite(ia: Analysis, critiques: Insight[]): Analysis {
  const themesCritiques = new Set(critiques.map(themeDe));
  const tous = [...ia.N, ...ia.A, ...ia.S];

  // 1 point de vigilance au plus : le premier sujet critique, avec la phrase de l'IA s'il y en a une sur ce sujet
  // (sinon celle des règles). Les autres sujets critiques sont rappelés dans ce même point (jamais en axe).
  const N: Insight[] = [];
  if (critiques.length) {
    const regle = critiques[0];
    const phraseIa = tous.find((i) => themeDe(i) === themeDe(regle));
    const point = phraseIa ? { ...phraseIa, big: phraseIa.big || regle.big } : regle;
    const autres = critiques.slice(1).map((c) => c.tt.toLowerCase());
    N.push(autres.length ? { ...point, dd: `${point.dd} Aussi critique : ${autres.join(", ")}.` } : point);
  }

  // Un sujet critique n'est jamais un succès ni un axe ; une « vigilance » non critique redescend en axe.
  const pasCritique = (i: Insight) => !themesCritiques.has(themeDe(i));
  const S = ia.S.filter(pasCritique);
  const A = [...ia.N.filter(pasCritique), ...ia.A.filter(pasCritique)];
  return { S: S.slice(0, 3), A: A.slice(0, 2), N: N.slice(0, 1) };
}

// La sortie de l'IA → l'analyse gardée : 1) garde-fou (tout chiffre non fourni est marqué « à vérifier »), 2) gravité
// fixée par les règles MOMENTO (les points des règles sont des faits : ils ne passent pas par le garde-fou).
export function finaliserAnalyse(
  brut: { analyse: Analysis; sujets: SujetPrevu[] },
  critiques: Insight[],
  autorisees: number[],
  genereLe: string,
): AnalyseIa {
  const marquer = (t: string) => marquerTexte(t, autorisees).texte;
  return {
    analyse: appliquerGravite(verifierAnalyse(brut.analyse, autorisees), critiques),
    sujets: brut.sujets.map((s) => ({ titre: marquer(s.titre), constat: marquer(s.constat), questions: s.questions.map(marquer) })),
    genereLe,
  };
}

// ——— L'analyse RAPIDE (règles MOMENTO, sans IA, immédiate) : affichée à l'ouverture d'une personne ———
// Les points des règles, rangés par la même gravité que l'analyse IA : un seul point de vigilance (POS 0-1 en M3+,
// send back > 18 %, volume effondré…), 3 succès et 2 axes au plus.

export const analyseRapideCommercial = (rep: Rep): Analysis => appliquerGravite(analyse(rep), critiquesCommercial(rep));

export const analyseRapideTm = (rep: Rep, nbActifs: number): Analysis =>
  appliquerGravite(analyseTm(rep, nbActifs), critiquesTm(rep, nbActifs));

// Une question ouverte par sujet, pour les sujets prévus tirés des règles (jamais sur les leads).
const QUESTIONS: Record<Theme, string> = {
  ventes: "Qu'est-ce qui a freiné tes signatures ce mois-ci, et sur quoi tu veux agir en premier ?",
  install: "Qu'est-ce qui retarde le passage de la vente à l'installation ?",
  posSales: "Qu'est-ce qui te freine pour proposer le POS en rendez-vous ?",
  posShare: "Dans quelles situations le POS passe-t-il le mieux, et comment le proposer plus souvent ?",
  og: "Comment tu t'organises pour générer tes propres rendez-vous (OG) ?",
  sendback: "D'où viennent les dossiers renvoyés, et comment les fiabiliser dès la signature ?",
  autre: "Qu'est-ce qui t'aiderait à progresser sur ce point ?",
};

// Les sujets PRÉVUS du 1:1, tirés de l'analyse rapide (sans IA) : le point de vigilance puis les axes, 2 au plus.
export function sujetsDesRegles(a: Analysis): SujetPrevu[] {
  return [...a.N, ...a.A].slice(0, 2).map((i) => ({ titre: i.tt, constat: i.dd, questions: [QUESTIONS[themeDe(i)]] }));
}
