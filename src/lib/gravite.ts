// La GRAVITÉ des points de l'analyse « data analyst » : l'IA écrit les phrases, les RÈGLES MOMENTO décident du bloc
// (succès / axe / point de vigilance), appliquées ici dans le code sur sa réponse :
// - un point de vigilance est réservé au vraiment critique (l'abusif), tel que défini par les règles MOMENTO :
//   ventes ou installs effondrées, POS 0-1 en M3+, send back > 18 % (pour une équipe : pace sous 50 %, send back > 18 %) ;
// - un sujet critique va TOUJOURS en vigilance, jamais en axe ni en succès ;
// - une « vigilance » de l'IA qui n'est pas critique selon les règles redescend en axe ;
// - plafond : 3 succès, 2 axes, 1 point de vigilance.
import { marquerTexte, verifierAnalyse } from "./garde-fou";
import { libelleObjectifChiffre, type KpiKey, type ObjectifChiffre, type SensCible } from "./kpis";
import { analyse, ciblesVolume, DELAI_CIBLE, emptySubject, pc, POS_SHARE_CATA } from "./momento";
import { objectifsEquipe, POS_SHARE_EQUIPE } from "./objectifs-equipe";
import { analyseTm } from "./statut-tm";
import type { AnalyseIa, Analysis, Insight, Rep, Subject, SujetPrevu } from "./types";

export type Theme = "ventes" | "install" | "posSales" | "posShare" | "og" | "sendback" | "conversion" | "delai" | "autre";

// HIÉRARCHIE DES KPIs : ventes, installs et POS d'abord ; tout le reste (délai de pose, send back, conversion IH, OG…)
// ensuite.
const PRINCIPAUX = new Set<Theme>(["ventes", "install", "posSales", "posShare"]);
export const rangHierarchie = (t: Theme) => (PRINCIPAUX.has(t) ? 0 : 1);

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function themeDuTexte(texte: string): Theme {
  const t = sansAccents(texte);
  if (/send ?back|sent back/.test(t)) return "sendback";
  if (/pos share|pos signed %|\bshare\b/.test(t)) return "posShare";
  if (/\bpos\b/.test(t)) return "posSales";
  if (/\bog\b/.test(t)) return "og";
  if (/conversion|ih cr|\bihcr\b/.test(t)) return "conversion";
  // Avant « install » : « Délai d'installation » est un sujet secondaire (délai de pose), pas le pilier installs.
  if (/delai|\bpose\b/.test(t)) return "delai";
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
// ——— PRIORITÉS ABSOLUES (sales ET TM, dans cet ordre) : vigilance n°1 et 1er sujet du 1:1, avant tout le reste ———
// 1. pace ventes OU installations sous 80 % (le plus bas d'abord ; « effondré » sous 50 %) ;
// 2. POS share sous 20 % (nettement sous la cible de 25 %) en M3+ ; pour TOUS les niveaux, sous 15 % (pilier « cata ») ;
// → un pilier « cata » (ventes / installs sous 80 %, POS share sous 15 %) est TOUJOURS un point de vigilance ;
// puis les autres signaux critiques : POS 0-1 en M3+, send back > 18 %.
const pctF = (f: number) => Math.floor(f * 100) + " %";

function critiquesVolume(rep: Rep): Insight[] {
  return [
    { f: rep.vPaceF, quoi: "Ventes", detail: `${rep.ventes} ventes signées` },
    { f: rep.iPaceF, quoi: "Installations", detail: `${rep.install} installations` },
  ]
    .filter((v) => v.f < 0.8)
    .sort((a, b) => a.f - b.f)
    .map((v) => ({
      big: pctF(v.f),
      tt: v.f < 0.5 ? `${v.quoi} effondrées` : `${v.quoi} sous 80 %`,
      dd: `Pace ${v.quoi.toLowerCase()} à ${pctF(v.f)} (${v.detail}) : c'est la priorité du mois.`,
    }));
}

const critiquePosShare = (rep: Rep, seuil: number): Insight[] =>
  rep.posShare != null && rep.posShare < seuil
    ? [{ big: pc(rep.posShare), tt: `POS share sous ${seuil} %`, dd: `${pc(rep.posShare)} de POS share, nettement sous la cible de 25 %.` }]
    : [];

const critiqueSendback = (rep: Rep): Insight[] =>
  rep.sendback != null && rep.sendback > 18
    ? [{ big: pc(rep.sendback), tt: "Send back (erreurs) élevé", dd: `${pc(rep.sendback)} de send back (cible ≤ 10 %).` }]
    : [];

export function critiquesCommercial(rep: Rep): Insight[] {
  if (!rep.hasKpis) return [];
  const posQuasiNul = analyse(rep).N.filter((i) => themeDe(i) === "posSales"); // POS 0-1 en M3+ (règle existante)
  return [
    ...critiquesVolume(rep),
    ...critiquePosShare(rep, rep.level === "M3+" ? 20 : POS_SHARE_CATA),
    ...posQuasiNul,
    ...critiqueSendback(rep),
  ];
}

// Les points CRITIQUES d'un TM (son équipe) : mêmes priorités (pace sous 80 %, POS share sous 20 %), puis send back > 18 %.
export function critiquesTm(rep: Rep): Insight[] {
  if (!rep.hasKpis || rep.vPace == null || rep.iPace == null) return [];
  return [...critiquesVolume(rep), ...critiquePosShare(rep, 20), ...critiqueSendback(rep)];
}

// Les volumes NON atteints (pace / atteinte sous 100 %, même 99 %) : jamais présentés comme un succès.
export function nonAtteints(rep: Rep): Set<Theme> {
  const t = new Set<Theme>();
  if (rep.vPaceF < 1) t.add("ventes");
  if (rep.iPaceF < 1) t.add("install");
  return t;
}

export function appliquerGravite(ia: Analysis, critiques: Insight[], volumesNonAtteints: Set<Theme> = new Set()): Analysis {
  const themesCritiques = new Set(critiques.map(themeDe));
  const tous = [...ia.N, ...ia.A, ...ia.S];

  // 1 point de vigilance au plus : le premier sujet critique, avec la phrase de l'IA s'il y en a une sur ce sujet
  // (sinon celle des règles). Les autres sujets critiques sont rappelés dans ce même point (jamais en axe).
  const N: Insight[] = [];
  if (critiques.length) {
    const regle = critiques[0];
    const phraseIa = tous.find((i) => themeDe(i) === themeDe(regle));
    // Le titre et le chiffre viennent de la règle (« Installations effondrées », 47 %) ; la phrase, de l'IA s'il y en a une.
    const point = phraseIa ? { ...regle, dd: phraseIa.dd } : regle;
    const autres = critiques.slice(1).map((c) => c.tt.toLowerCase());
    const dd = point.dd.replace(/ Aussi critique : .*$/, ""); // une analyse déjà gardée : pas de rappel en double
    N.push(autres.length ? { ...point, dd: `${dd} Aussi critique : ${autres.join(", ")}.` } : { ...point, dd });
  }

  // Un sujet critique n'est jamais un succès ni un axe ; une « vigilance » non critique redescend en axe.
  const pasCritique = (i: Insight) => !themesCritiques.has(themeDe(i));
  // Un volume non atteint n'est jamais un succès : un tel « succès » redescend en axe.
  const celebrable = (i: Insight) => !volumesNonAtteints.has(themeDe(i));
  const S = ia.S.filter(pasCritique).filter(celebrable);
  // Les axes : ventes / installs / POS d'abord, le secondaire (send back, conversion IH, OG…) ensuite.
  const A = [...ia.N.filter(pasCritique), ...ia.S.filter(pasCritique).filter((i) => !celebrable(i)), ...ia.A.filter(pasCritique)]
    .map((i, ordre) => ({ i, ordre }))
    .sort((a, b) => rangHierarchie(themeDe(a.i)) - rangHierarchie(themeDe(b.i)) || a.ordre - b.ordre)
    .map(({ i }) => i);
  return { S: S.slice(0, 3), A: A.slice(0, 2), N: N.slice(0, 1) };
}

// Une analyse GARDÉE (fiche) relue avec les règles d'aujourd'hui : un pilier « cata » y est toujours la vigilance,
// même si elle a été générée avant (ex. un délai de pose qui avait pris la place des installs effondrées).
export function analyseAJour(a: AnalyseIa | null, rep: Rep, equipe: boolean): AnalyseIa | null {
  if (!a) return null;
  return { ...a, analyse: appliquerGravite(a.analyse, equipe ? critiquesTm(rep) : critiquesCommercial(rep), nonAtteints(rep)) };
}

// La sortie de l'IA → l'analyse gardée : 1) garde-fou (tout chiffre non fourni est marqué « à vérifier »), 2) gravité
// fixée par les règles MOMENTO (les points des règles sont des faits : ils ne passent pas par le garde-fou).
export function finaliserAnalyse(
  brut: { analyse: Analysis; sujets: SujetPrevu[] },
  critiques: Insight[],
  autorisees: number[],
  genereLe: string,
  volumesNonAtteints: Set<Theme> = new Set(),
): AnalyseIa {
  const marquer = (t: string) => marquerTexte(t, autorisees).texte;
  return {
    analyse: appliquerGravite(verifierAnalyse(brut.analyse, autorisees), critiques, volumesNonAtteints),
    sujets: brut.sujets.map((s) => ({ titre: marquer(s.titre), constat: marquer(s.constat), questions: s.questions.map(marquer) })),
    genereLe,
  };
}

// ——— L'analyse RAPIDE (règles MOMENTO, sans IA, immédiate) : affichée à l'ouverture d'une personne ———
// Les points des règles, rangés par la même gravité que l'analyse IA : un seul point de vigilance (POS 0-1 en M3+,
// send back > 18 %, volume effondré…), 3 succès et 2 axes au plus.

export const analyseRapideCommercial = (rep: Rep): Analysis =>
  appliquerGravite(analyse(rep), critiquesCommercial(rep), nonAtteints(rep));

// Un « succès » d'équipe porté par 1 ou 2 sales n'est pas un succès d'équipe : on signale la DÉPENDANCE à la place.
// Concentré = au moins 3 sales, et le 1er fait la moitié du total, ou (dès 4 sales) les 2 premiers en font 70 %.
type LigneSales = { nom: string; donnees: Record<string, number | null> };
const CLES_CONCENTRATION: Partial<Record<Theme, { cle: string; libelle: string }>> = {
  og: { cle: "og", libelle: "Ventes OG" },
  posSales: { cle: "posSales", libelle: "POS vendus" },
  ventes: { cle: "ventes", libelle: "Ventes" },
};

export function dependance(theme: Theme, sales: LigneSales[]): Insight | null {
  const k = CLES_CONCENTRATION[theme];
  if (!k || sales.length < 3) return null;
  const parSales = sales.map((s) => ({ nom: s.nom.split(" ")[0], v: s.donnees[k.cle] ?? 0 })).sort((a, b) => b.v - a.v);
  const total = parSales.reduce((t, s) => t + s.v, 0);
  if (total <= 0) return null;
  const top = parSales[0].v / total >= 0.5 ? parSales.slice(0, 1) : sales.length >= 4 && (parSales[0].v + parSales[1].v) / total >= 0.7 ? parSales.slice(0, 2) : null;
  if (!top) return null;
  const part = top.reduce((t, s) => t + s.v, 0);
  const noms = top.map((s) => s.nom).join(" et ");
  return {
    big: `${part}/${total}`,
    tt: `${k.libelle} portées par ${noms}`,
    dd: `${noms} ${top.length > 1 ? "font" : "fait"} ${part} sur ${total} : le résultat de l'équipe dépend de ${top.length > 1 ? "ces 2 sales" : "ce sales"}.`,
  };
}

// Les succès d'équipe vérifiés sur le détail par sales : un succès concentré devient un axe « dépendance ».
export function verifierSuccesEquipe(a: Analysis, sales: LigneSales[]): Analysis {
  const dependances: Insight[] = [];
  const S = a.S.filter((i) => {
    const d = dependance(themeDe(i), sales);
    if (d) dependances.push(d);
    return !d;
  });
  return { S, A: [...dependances, ...a.A].slice(0, 2), N: a.N };
}

export const analyseRapideTm = (rep: Rep, nbActifs: number, sales: LigneSales[] = []): Analysis =>
  verifierSuccesEquipe(appliquerGravite(analyseTm(rep, nbActifs), critiquesTm(rep), nonAtteints(rep)), sales);

// ——— Les SUJETS du 1:1 (sales en accès TM, TM en accès RM, zoom sales RM) ———
// - 1 à 3 sujets, SEULEMENT autant que de vrais problèmes (jamais remplir pour faire 3) ;
// - jamais deux sujets sur le même thème ;
// - dans l'ordre : priorités absolues (pace sous 80 %, POS share sous 20 %, POS 0-1) → ventes / installs / POS sous
//   l'objectif → le secondaire (send back, conversion IH, OG) ;
// - chaque sujet porte son OBJECTIF chiffré (ventes / installs : 100 % du budget du niveau ; POS share : 25 % ; …).

// Une question ouverte par sujet, adressée au sales (jamais sur les leads).
const QUESTIONS: Record<Theme, string> = {
  ventes: "Qu'est-ce qui a freiné tes signatures ce mois-ci, et sur quoi tu veux agir en premier ?",
  install: "Qu'est-ce qui retarde le passage de la vente à l'installation ?",
  posSales: "Qu'est-ce qui te freine pour proposer le POS en rendez-vous ?",
  posShare: "Dans quelles situations le POS passe-t-il le mieux, et comment le proposer plus souvent ?",
  og: "Comment tu t'organises pour faire plus de ventes en prospection (OG) ?",
  sendback: "D'où viennent les dossiers renvoyés par le KYC, et comment les fiabiliser dès la signature ?",
  conversion: "Qu'est-ce qui t'aiderait à signer plus souvent sur tes rendez-vous IH ?",
  delai: "Qu'est-ce qui allonge le délai entre la signature et la pose ?",
  autre: "Qu'est-ce qui t'aiderait à progresser sur ce point ?",
};

// Pour un TM : la question engage son plan d'action de manager sur l'équipe (jamais sur les leads).
const QUESTIONS_EQUIPE: Record<Theme, string> = {
  ventes: "Quel plan d'action mets-tu en place avec l'équipe pour remonter les signatures ?",
  install: "Quel plan d'action mets-tu en place avec l'équipe pour remonter les installations ?",
  posSales: "Comment vas-tu accompagner l'équipe pour proposer le POS à chaque rendez-vous ?",
  posShare: "Comment vas-tu faire monter le POS share de l'équipe vers 25 % ?",
  og: "Comment vas-tu aider l'équipe à faire plus de ventes en prospection (OG) ?",
  sendback: "Comment vas-tu fiabiliser les dossiers de l'équipe pour faire baisser le send back ?",
  conversion: "Comment vas-tu aider l'équipe à mieux convertir les rendez-vous IH (cible 20 %) ?",
  delai: "Comment vas-tu aider l'équipe à raccourcir le délai entre la signature et la pose ?",
  autre: "Quel plan d'action mets-tu en place avec l'équipe sur ce point ?",
};

// Ce qui fait un « vrai problème » et l'objectif de chaque thème, pour une personne.
export type ContexteSujets = {
  equipe: boolean; // un TM (son équipe) plutôt qu'un sales
  posShare: boolean; // les règles POS share s'appliquent (TM, ou sales M3+)
  posVendusMin: number | null; // POS vendus minimum (sales M3+ : 4 ; équipe : effectif × 4), null = aucune exigence
  ogMin: number | null; // ventes OG minimum (sales hors M1 ; équipe : effectif × 5), null = aucune exigence
  objectifs: { ventes: ObjectifChiffre; install: ObjectifChiffre; posVendus: number | null; og: number | null };
};

const objectif = (kpi: KpiKey, sens: SensCible, valeur: number): ObjectifChiffre => ({ kpi, sens, valeur });

// Un sales : volume au budget de son niveau (pour un objectif « mois prochain », celui du mois prochain).
export function contexteCommercial(rep: Rep, prochain?: { budget: number; posMin: number | null; ogCible: number }): ContexteSujets {
  const c = ciblesVolume(rep);
  const m3 = rep.level === "M3+";
  const budget = prochain?.budget ?? rep.objectif;
  return {
    equipe: false,
    posShare: m3,
    posVendusMin: m3 ? c.posMin : null,
    ogMin: rep.level !== "M1" ? c.ogCible : null,
    objectifs: {
      ventes: objectif("ventes", ">=", budget),
      install: objectif("install", ">=", budget),
      posVendus: prochain ? prochain.posMin : m3 ? c.posMin : null,
      og: prochain ? prochain.ogCible : c.ogCible,
    },
  };
}

// Un TM (son équipe) : pace 100 %, POS = effectif × 4, OG = effectif × 5, POS share 25 %.
export function contexteEquipe(effectif: number): ContexteSujets {
  const o = objectifsEquipe(effectif);
  return {
    equipe: true,
    posShare: true,
    posVendusMin: effectif ? o.posVendus : null,
    ogMin: effectif ? o.og : null,
    objectifs: {
      ventes: objectif("vPace", ">=", o.pace),
      install: objectif("iPace", ">=", o.pace),
      posVendus: effectif ? o.posVendus : null,
      og: effectif ? o.og : null,
    },
  };
}

export type Probleme = { theme: Theme; insight: Insight; cible: ObjectifChiffre | null };

// Les vrais problèmes d'une personne, un par thème, dans l'ordre de la hiérarchie.
export function problemes(rep: Rep, ctx: ContexteSujets): Probleme[] {
  if (!rep.hasKpis) return [];
  const critiques = ctx.equipe ? critiquesTm(rep) : critiquesCommercial(rep);
  const liste: { insight: Insight; rang: number }[] = critiques.map((i) => ({ insight: i, rang: rangHierarchie(themeDe(i)) * 2 }));
  const ajouter = (insight: Insight) => liste.push({ insight, rang: rangHierarchie(themeDe(insight)) * 2 + 1 });

  // Principaux sous l'objectif (sans être critiques).
  if (rep.vPaceF < 1) ajouter({ big: pctF(rep.vPaceF), tt: "Ventes sous l'objectif", dd: `Pace ventes à ${pctF(rep.vPaceF)} : l'objectif est 100 %.` });
  if (rep.iPaceF < 1) ajouter({ big: pctF(rep.iPaceF), tt: "Installations sous l'objectif", dd: `Pace installations à ${pctF(rep.iPaceF)} : l'objectif est 100 %.` });
  if (ctx.posShare && rep.posShare != null && rep.posShare < POS_SHARE_EQUIPE) {
    ajouter({ big: pc(rep.posShare), tt: "POS share sous la cible", dd: `${pc(rep.posShare)} de POS share (cible ${POS_SHARE_EQUIPE} %).` });
  }
  if (ctx.posVendusMin != null && rep.posSales < ctx.posVendusMin) {
    ajouter({ big: `${rep.posSales}/${ctx.posVendusMin}`, tt: "POS vendus sous l'objectif", dd: `${rep.posSales} POS vendus pour un objectif de ${ctx.posVendusMin}.` });
  }
  // Le secondaire.
  if (rep.sendback != null && rep.sendback > 10) ajouter({ big: pc(rep.sendback), tt: "Send back au-dessus de la cible", dd: `${pc(rep.sendback)} de send back (cible ≤ 10 %).` });
  if (rep.ihcr != null && rep.ihcr < 20) ajouter({ big: pc(rep.ihcr), tt: "Conversion IH sous 20 %", dd: `${pc(rep.ihcr)} de conversion IH (cible 20 %).` });
  if (rep.avgDays != null && rep.avgDays >= DELAI_CIBLE) ajouter({ big: `${rep.avgDays} j`, tt: "Délai de pose à réduire", dd: `${rep.avgDays} j entre la vente et la pose (cible < ${DELAI_CIBLE} j).` });
  if (ctx.ogMin != null && rep.og < ctx.ogMin) ajouter({ big: `${rep.og}/${ctx.ogMin}`, tt: "Ventes OG sous l'objectif", dd: `${rep.og} ventes OG pour un objectif de ${ctx.ogMin}.` });

  const cibleDe = (t: Theme): ObjectifChiffre | null => {
    const o = ctx.objectifs;
    if (t === "ventes") return o.ventes;
    if (t === "install") return o.install;
    if (t === "posShare") return objectif("posShare", ">=", POS_SHARE_EQUIPE);
    if (t === "posSales") return o.posVendus != null ? objectif("posSales", ">=", o.posVendus) : null;
    if (t === "og") return o.og != null ? objectif("og", ">=", o.og) : null;
    if (t === "sendback") return objectif("sendback", "<=", 10);
    if (t === "conversion") return objectif("ihcr", ">=", 20);
    if (t === "delai") return objectif("avgDays", "<=", DELAI_CIBLE - 1);
    return null;
  };

  // Critique avant non critique (à niveau égal), principaux avant secondaires ; un seul problème par thème.
  const vus = new Set<Theme>();
  return liste
    .map((x, ordre) => ({ ...x, ordre }))
    .sort((a, b) => a.rang - b.rang || a.ordre - b.ordre)
    .flatMap(({ insight }) => {
      const theme = themeDe(insight);
      if (vus.has(theme)) return [];
      vus.add(theme);
      return [{ theme, insight, cible: cibleDe(theme) }];
    });
}

const themeDeTextes = (titre: string, detail: string) => {
  const t = themeDuTexte(titre);
  return t !== "autre" ? t : themeDuTexte(detail);
};

// L'objectif d'un sujet : celui de la règle (100 % du budget, 25 %…), l'IA pouvant seulement viser plus haut.
function fusionnerObjectif(ia: ObjectifChiffre | null, regle: ObjectifChiffre | null): ObjectifChiffre | null {
  if (!regle) return ia;
  if (ia && ia.kpi === regle.kpi && ia.sens === regle.sens && ia.valeur != null && regle.valeur != null) {
    return { ...regle, valeur: regle.sens === ">=" ? Math.max(ia.valeur, regle.valeur) : Math.min(ia.valeur, regle.valeur) };
  }
  return regle;
}

// Le rang d'un sujet de la fiche : les piliers (ventes, installs, POS) d'abord, le secondaire ensuite.
export const rangSujet = (s: Subject) => rangHierarchie(themeDeTextes(s.t, s.o));

const SUJETS_MAX = 3;

// Les sujets d'un 1:1 (fiche) : un par vrai problème, avec le texte de l'IA quand il en a un sur ce thème, sinon tiré de
// la règle. Sans aucun vrai problème : le premier sujet de l'IA seul (au moins 1 sujet).
export function construireSujets(ia: Subject[], probs: Probleme[], equipe: boolean): Subject[] {
  const choisis = probs.slice(0, SUJETS_MAX).map((p): Subject => {
    const s = ia.find((x) => themeDeTextes(x.t, x.o) === p.theme);
    const base: Subject = s ?? {
      ...emptySubject(),
      t: p.insight.tt,
      o: p.insight.dd,
      questions: (equipe ? QUESTIONS_EQUIPE : QUESTIONS)[p.theme],
      ia: true,
    };
    return { ...base, cible: fusionnerObjectif(base.cible, p.cible) };
  });
  return choisis.length ? choisis : ia.slice(0, 1);
}

// Les sujets PRÉVUS (zoom RM sur un sales) : même règle, l'objectif écrit en clair.
export function construireSujetsPrevus(ia: SujetPrevu[], probs: Probleme[]): SujetPrevu[] {
  const choisis = probs.slice(0, SUJETS_MAX).map((p): SujetPrevu => {
    const s = ia.find((x) => themeDeTextes(x.titre, x.constat) === p.theme);
    const base = s ?? { titre: p.insight.tt, constat: p.insight.dd, questions: [QUESTIONS[p.theme]] };
    const cible = libelleObjectifChiffre(p.cible);
    return { ...base, ...(cible ? { objectif: cible } : {}) };
  });
  return choisis.length ? choisis : ia.slice(0, 1);
}
