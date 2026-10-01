// Le « Brief auto » du 1:1 : préparé par Gemini à partir des chiffres, de l'analyse MOMENTO
// et des engagements du mois précédent. Gardé dans la fiche (entretiens.contenu.brief).
import { formatKpi, KPI_FIELDS, normaliserObjectifChiffre, type KpiDonnees, type KpiKey } from "./kpis";
import { RAISONS } from "./mois-special";
import { ciblesVolume, emptySubject, pc } from "./momento";
import type { Engagement, StatutEngagement } from "./suivi";
import type { AnalyseIa, Analysis, BriefIa, Insight, Rep, Status, Subject, SujetPrevu } from "./types";

const TAILLE_MAX = 600; // caractères par texte du brief
const CELEBRER_MAX = 4;

const SUJETS_MAX = 3;
const QUESTIONS_MAX = 3;

// Ce que la route renvoie au navigateur : le brief (note privée) + les sujets proposés pour la fiche.
export type BriefReponse =
  | { ok: true; brief: BriefIa; sujets: Subject[] }
  | { ok: false; error: string; reessayable?: boolean };

// Un sujet sur lequel le manager a déjà écrit quelque chose (à ne jamais écraser sans lui demander).
export const sujetRempli = (s: Subject) =>
  Boolean(s.t.trim() || s.o.trim() || s.r.trim() || s.g.trim() || s.questions.trim() || s.reponse.trim() || s.cible);

const texte = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, TAILLE_MAX) : "");

// Questions interdites : rien qui sous-entende une évolution de carrière, une promotion ou de l'argent
// (pas de faux espoirs). Le développement porte sur les compétences et la méthode du poste ACTUEL.
const QUESTIONS_INTERDITES = [
  /où (est-ce que )?tu te vois/i,
  /dans (\d+|un|une|deux|trois|six|quelques) (mois|ans?|années)/i,
  /(quel|autre|prochain|futur|nouveau) poste/i,
  /\bpromo(tion)?s?\b|\bpromue?\b/i,
  /tu veux évoluer|évoluer vers|évolution (de carrière|professionnelle|interne)|carrière/i,
  /\baugmentation\b|\bprimes?\b|\bsalaire|\brémunération|\bbonus\b/i,
  /devenir (manager|team ?lead|chef|responsable|formateur)/i,
];
export const questionAutorisee = (q: string) => !QUESTIONS_INTERDITES.some((r) => r.test(q));

// Pistes d'ouverture par défaut (tant que le brief IA n'a pas été préparé) : bien-être, bienveillant, pas intrusif.
export const PISTES_OUVERTURE = [
  "Qu'est-ce qui te motive le plus en ce moment ?",
  "Comment tu vis ta charge de travail ces temps-ci ?",
  "Comment tu te sens dans l'équipe en ce moment ?",
  "Qu'est-ce qui t'a donné de l'énergie ce mois-ci ?",
];

// Vue RM : l'analyse d'un TM lue en base (ou renvoyée par Gemini) → 3 succès, 2 axes, 1 vigilance au plus ; null si vide.
const LIMITES_ANALYSE = { S: 3, A: 2, N: 1 } as const;
export function normaliserAnalyse(raw: unknown): Analysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const liste = (v: unknown, max: number): Insight[] =>
    Array.isArray(v)
      ? v
          .map((x) => {
            const i = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
            return { big: texte(i.big).slice(0, 24), tt: texte(i.tt).slice(0, 120), dd: texte(i.dd) };
          })
          .filter((i) => i.tt && i.dd)
          .slice(0, max)
      : [];
  const analyse = { S: liste(o.S, LIMITES_ANALYSE.S), A: liste(o.A, LIMITES_ANALYSE.A), N: liste(o.N, LIMITES_ANALYSE.N) };
  return analyse.S.length + analyse.A.length + analyse.N.length ? analyse : null;
}

// jsonb lu en base (ou envoyé par le navigateur) → brief valide, ou null.
export function normaliserBrief(raw: unknown): BriefIa | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const brief: BriefIa = {
    aborder: texte(o.aborder),
    celebrer: Array.isArray(o.celebrer) ? o.celebrer.map(texte).filter(Boolean).slice(0, CELEBRER_MAX) : [],
    engagements: texte(o.engagements),
    sujet: texte(o.sujet),
    question: texte(o.question),
    ouverture: Array.isArray(o.ouverture) ? o.ouverture.map(texte).filter((q) => q && questionAutorisee(q)).slice(0, 3) : [],
    genereLe: typeof o.genereLe === "string" && !Number.isNaN(Date.parse(o.genereLe)) ? o.genereLe : "",
  };
  // Vue RM : l'analyse du TM, gardée seulement si elle existe (jamais ajoutée au brief d'un sales).
  const analyse = normaliserAnalyse(o.analyse);
  if (analyse) brief.analyse = analyse;
  return brief.aborder && brief.sujet && brief.question && brief.genereLe ? brief : null;
}

// Un sujet proposé par Gemini → un sujet de fiche (« Sa réponse » vide, à remplir pendant le 1:1), ou null.
// L'objectif chiffré n'est gardé que s'il est complet et valide (KPI connu, cible cohérente).
export function lireSujet(raw: unknown): Subject | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // Chaque question peut arriver en texte ou en { "q", "type" } ; les questions interdites sont écartées.
  const questions = Array.isArray(o.questions)
    ? o.questions
        .map((q) => texte(q && typeof q === "object" ? (q as Record<string, unknown>).q : q))
        .filter((q) => q && questionAutorisee(q))
        .slice(0, QUESTIONS_MAX)
    : [];
  const cible = normaliserObjectifChiffre(o.objectif);
  const sujet: Subject = {
    ...emptySubject(),
    t: texte(o.titre),
    o: texte(o.constat),
    questions: questions.join("\n"),
    cible: cible?.valeur != null ? cible : null,
    ia: true,
  };
  return sujet.t && sujet.o && questions.length ? sujet : null;
}

// Réponse texte de Gemini → brief + sujets, ou null si elle est inexploitable (on passe alors au modèle suivant).
export function lireReponseBrief(reponse: string, genereLe: string): { brief: BriefIa; sujets: Subject[] } | null {
  const json = reponse.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    const o = JSON.parse(json);
    const brief = normaliserBrief({ ...o, genereLe });
    const sujets = Array.isArray(o.sujets) ? o.sujets.flatMap((s: unknown) => lireSujet(s) ?? []).slice(0, SUJETS_MAX) : [];
    return brief && sujets.length ? { brief, sujets } : null;
  } catch {
    return null;
  }
}

// ——— Le prompt ———

const STATUTS: Record<StatutEngagement, string> = {
  tenu: "TENU",
  non_tenu: "NON TENU",
  en_cours: "en cours",
  manquant: "chiffre du mois pas encore saisi, impossible à juger",
  a_juger: "pas encore jugé par le manager",
};

const UNITES = { "%": " %", j: " j", "€": " €" } as const;

export function lignesChiffres(d: KpiDonnees) {
  return KPI_FIELDS.flatMap((f) => {
    const v = d[f.key as KpiKey];
    return v == null ? [] : [`- ${f.label} : ${formatKpi(v)}${f.unit ? UNITES[f.unit] : ""}`];
  });
}

function lignesAnalyse(a: Analysis) {
  const partie = (titre: string, items: Analysis["S"]) => [
    `${titre} :`,
    ...(items.length ? items.map((i) => `- ${i.tt} (${i.big}) — ${i.dd}`) : ["- (aucun)"]),
  ];
  return [
    ...partie("Succès du mois", a.S),
    ...partie("Axes de progression", a.A),
    ...partie("Points de vigilance (situations critiques uniquement)", a.N),
  ];
}

export function lignesEngagements(liste: Engagement[]) {
  if (!liste.length) return ["- (aucun engagement noté au 1:1 du mois dernier)"];
  return liste.map((e) =>
    [
      `- « ${e.titre} »`,
      e.objectif && `objectif : ${e.objectif}`,
      e.cible && `cible chiffrée : ${e.cible}`,
      e.reel && `réalisé : ${e.reel}`,
      `→ ${STATUTS[e.statut]}`,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

export function promptBrief({
  rep,
  mois,
  moisPrecedent,
  chiffres,
  status,
  analysis,
  engagements,
  prochain,
}: {
  rep: Rep;
  mois: string;
  moisPrecedent: string;
  chiffres: KpiDonnees;
  status: Status;
  analysis: Analysis;
  engagements: Engagement[];
  prochain: ObjectifsMoisProchain; // niveau et cibles du MOIS PROCHAIN (auto-progression), pour les objectifs proposés
}) {
  const prenom = rep.name.split(" ")[0];
  const pace = (p: number | null, att: number) => (p != null ? pc(p) : `${Math.round(att * 100)} % (atteinte)`);
  return `Tu es un directeur commercial expérimenté. Tu prépares, pour un manager, son One-on-One de ${mois.toLowerCase()} avec ${prenom}, un(e) commercial(e) de son équipe. Tu écris AU MANAGER (tutoiement), en français, court et actionnable, avec un ton bienveillant et direct. Pas de blabla, pas de jargon RH, pas de formules creuses.

LE COMMERCIAL
- Nom : ${rep.name}
- Niveau : ${rep.level} (budget mensuel habituel : ${rep.budget} ventes et ${rep.budget} installations)${rep.sen ? `\n- Séniorité : ${rep.sen}` : ""}${
    rep.special
      ? `\n- MOIS PARTICULIER (${RAISONS.find((r) => r.value === rep.special!.raison)?.label ?? "autre"}) : l'objectif de ce mois est AJUSTÉ à ${rep.objectif} ventes et ${rep.objectif} installations, et les cibles de volume suivent le même prorata : au moins ${ciblesVolume(rep).posMin} POS (M3+), cible OG ${ciblesVolume(rep).ogCible}. Juge l'atteinte sur ces objectifs ajustés (le pace et l'analyse ci-dessous en tiennent déjà compte), jamais sur les cibles habituelles, et tiens compte du contexte.`
      : ""
  }
- Mois prochain (${prochain.mois.toLowerCase()}) : niveau ${prochain.seniorite} → objectif ${prochain.budget} ventes et ${prochain.budget} installations
- Statut MOMENTO : ${status.t} (${status.why})
- Pace ventes : ${pace(rep.vPace, rep.vAtt)} · Pace installations : ${pace(rep.iPace, rep.iAtt)}

SES CHIFFRES DE ${mois.toUpperCase()}
${lignesChiffres(chiffres).join("\n")}

L'ANALYSE MOMENTO (déjà calculée, elle fait foi)
${lignesAnalyse(analysis).join("\n")}

SES ENGAGEMENTS PRIS AU 1:1 DE ${moisPrecedent.toUpperCase()}
${lignesEngagements(engagements).join("\n")}

RÈGLES MOMENTO (à respecter strictement)
1. Le volume passe avant tout : le statut repose sur le pace (projection fin de mois) des ventes et des installations. Sous 80 % = à accompagner, entre 80 et 100 % = à surveiller, 100 % et plus sur les deux = en forme.
2. Si le volume est au rendez-vous, un POS ou un indicateur secondaire un peu faible n'est PAS un reproche : au mieux un axe de progression à évoquer en passant, jamais « le sujet à ouvrir » s'il existe mieux.
3. L'exigence POS (4 POS par mois minimum, ajustée au prorata pour un mois particulier) ne concerne que les M3+. Ne reproche jamais le POS à un M1 ou un M2.
4. Délai moyen d'installation (vente → pose) : cible moins de 7 jours ; de 7 à 12 jours, à améliorer ; au-delà de 12 jours, critique.
5. Les points de vigilance sont réservés aux situations vraiment critiques, celles listées par MOMENTO ci-dessus. N'en invente pas et ne transforme pas un axe de progression en alerte.
6. Adapte-toi au niveau : un M1 ou un M2 apprend le métier (accompagner, encourager, cadrer, simplifier, lui faire dire ce qu'il veut apprendre) ; un M3+ est attendu sur la maîtrise et l'excellence dans son poste actuel (autonomie, qualité, exemplarité), jamais sur une évolution.
7. N'utilise QUE les chiffres et les faits fournis ci-dessus. N'invente aucun chiffre, aucun événement, aucune cause.

CE QUE TU DOIS PRODUIRE
- "aborder" : « Comment l'aborder », 1 à 2 phrases de posture managériale pour cet entretien (état d'esprit, ce qu'il faut éviter).
- "celebrer" : « À célébrer », 1 à 3 points forts RÉELS du mois, chacun en une phrase courte avec le chiffre à l'appui. Si le mois est difficile, trouve le vrai point d'appui (même modeste) sans l'exagérer.
- "engagements" : « Engagements du mois dernier », 1 à 2 phrases : ce qui a été tenu (le reconnaître), ce qui ne l'a pas été (comment en parler sans reproche, en cherchant la cause). S'il n'y a aucun engagement, renvoie une chaîne vide "".
- "sujet" : « Le sujet à ouvrir », 1 à 2 phrases : le point principal à travailler (en priorité un point de vigilance, sinon l'axe de progression le plus utile, sinon un sujet de développement si tout va bien), formulé de façon à mobiliser sans démotiver.
- "question" : « Question à poser », UNE question ouverte et concrète, adressée directement à ${prenom} (tutoiement), liée au sujet à ouvrir.
- "ouverture" : 2 à 3 pistes pour OUVRIR l'entretien sur la personne, avant les chiffres : sa motivation du moment, sa charge de travail, l'ambiance d'équipe, ce qui l'anime. Des questions ouvertes, bienveillantes, jamais intrusives (rien sur la vie privée ou la santé), adressées à ${prenom} (tutoiement), personnalisées si ses 1:1 passés donnent des indices.
- "sujets" : 2 à 3 SUJETS à travailler pendant l'entretien, du plus important au moins important. Ils seront insérés dans la fiche du 1:1 que le manager complétera. Le premier correspond au « sujet à ouvrir ». Un engagement NON TENU du mois dernier peut justifier un sujet. Si tout va bien, propose des sujets de développement (confirmer, aller plus loin), jamais des reproches. Pour chaque sujet :
  - "titre" : un titre court et mobilisateur (moins de 60 caractères), ex. « Transformer les ventes en installations ».
  - "constat" : 1 à 2 phrases factuelles, avec les chiffres fournis (et l'engagement du mois dernier s'il y en a un sur ce thème). Aucun jugement, aucun chiffre inventé.
  - "questions" : 1 à 3 questions ouvertes, personnalisées et bienveillantes, qui font réfléchir, adressées directement à ${prenom} (tutoiement). Sur L'ENSEMBLE des sujets, les questions forment un MIX des 3 dimensions, avec AU MOINS UNE question de chaque :
      · PERFORMANCE : ancrée sur ses vrais chiffres, ce qui a marché ou bloqué, les causes et les solutions ;
      · DÉVELOPPEMENT : ce qu'il/elle veut AMÉLIORER dans son métier actuel, une compétence ou une méthode à mieux maîtriser (ex. « Qu'est-ce que tu veux mieux maîtriser ce mois-ci ? », « Sur quelle compétence tu veux progresser ? ») ;
      · HUMAIN : son ressenti, sa motivation, sa place dans l'équipe, ce dont il/elle a besoin pour se sentir bien.
    INTERDIT : toute question qui sous-entend une évolution, un autre poste ou une promotion (pas de « Où tu te vois dans 6 mois ? », « Tu vises quel poste ? », « Tu veux évoluer ? »), et toute promesse implicite (augmentation, prime, promotion). Reste sur : mieux faire son métier actuel, progresser sur ses compétences, se sentir bien.
    Chaque question est un objet {"q": "la question", "type": "performance" | "developpement" | "humain"}.
  - "objectif" : un objectif chiffré pour le mois prochain SEULEMENT s'il est pertinent et mesurable par un des KPIs ci-dessous, sinon null. Forme : {"kpi": "<clé>", "sens": ">=" ou "<=", "valeur": <nombre>}. La cible doit être réaliste par rapport au chiffre actuel et au niveau. « <= » pour ce qu'on veut faire baisser (délai moyen, backlog, send back), « >= » pour le reste. Pourcentages en nombre sans le signe % (ex. 25), valeurs entières pour les comptes (ventes, installations, POS…). OBJECTIF DU MOIS PROCHAIN : il se fixe au NIVEAU DU MOIS PROCHAIN (${prochain.seniorite}), jamais à celui de ce mois — ventes et installations : ${prochain.budget} ; ${prochain.posMin != null ? `POS vendus : au moins ${prochain.posMin}` : `aucun objectif POS (pas M3+ le mois prochain)`} ; ventes OG : au moins ${prochain.ogCible}.

KPIs utilisables pour "objectif" (clé → libellé) :
${KPI_FIELDS.map((f) => `- ${f.key} → ${f.label}${f.unit ? ` (${f.unit})` : ""}${f.integer ? " (nombre entier)" : ""}`).join("\n")}

Chaque texte fait au plus 300 caractères. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme :
{"aborder": "…", "celebrer": ["…", "…"], "engagements": "…", "sujet": "…", "question": "…", "ouverture": ["…", "…"],
 "sujets": [{"titre": "…", "constat": "…", "questions": [{"q": "…", "type": "performance"}, {"q": "…", "type": "developpement"}], "objectif": {"kpi": "install", "sens": ">=", "valeur": 12}}, {"titre": "…", "constat": "…", "questions": [{"q": "…", "type": "humain"}], "objectif": null}]}`;
}

// ——— Objectifs « pour le mois prochain » : au niveau du MOIS PROCHAIN (auto-progression), jamais du mois courant ———

export type ObjectifsMoisProchain = {
  mois: string;
  seniorite: string;
  budget: number; // objectif ventes ET installations du mois prochain (M1 5, M2 10, M3+ 15)
  posMin: number | null; // POS vendus minimum, seulement si M3+ le mois prochain
  ogCible: number; // ventes OG
};

export function objectifsMoisProchain(n: { mois: string; seniorite: string; budget: number }): ObjectifsMoisProchain {
  const c = ciblesVolume({ objectif: n.budget, budget: n.budget });
  return { ...n, posMin: n.seniorite === "M3+" ? c.posMin : null, ogCible: c.ogCible };
}

// Garantit, dans le code, que les objectifs chiffrés proposés pour le mois prochain suivent son niveau du mois prochain,
// même si l'IA s'est trompée : ventes / installs / POS / OG « ≥ » jamais sous la cible du mois prochain, et pas
// d'objectif POS si la personne n'est pas M3+ le mois prochain.
export function alignerSurMoisProchain(sujets: Subject[], p: ObjectifsMoisProchain): Subject[] {
  return sujets.map((s) => {
    const c = s.cible;
    if (!c || c.valeur == null || c.sens !== ">=") {
      return c?.kpi === "posSales" && p.posMin == null ? { ...s, cible: null } : s;
    }
    if (c.kpi === "ventes" || c.kpi === "install") return { ...s, cible: { ...c, valeur: Math.max(c.valeur, p.budget) } };
    if (c.kpi === "posSales") return p.posMin == null ? { ...s, cible: null } : { ...s, cible: { ...c, valeur: Math.max(c.valeur, p.posMin) } };
    if (c.kpi === "og") return { ...s, cible: { ...c, valeur: Math.max(c.valeur, p.ogCible) } };
    return s;
  });
}

// ——— L'analyse « data analyst » gardée dans la fiche (sales, TM, et sales vus depuis la fiche d'un TM côté RM) ———

// Un sujet prévu (titre, constat, questions) lu en base ou renvoyé par l'IA ; null s'il est vide.
export function normaliserSujetPrevu(raw: unknown): SujetPrevu | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const questions = Array.isArray(o.questions)
    ? o.questions
        .map((q) => texte(q && typeof q === "object" ? (q as Record<string, unknown>).q : q))
        .filter((q) => q && questionAutorisee(q))
        .slice(0, QUESTIONS_MAX)
    : [];
  const sujet = { titre: texte(o.titre), constat: texte(o.constat), questions };
  return sujet.titre && (sujet.constat || questions.length) ? sujet : null;
}

// jsonb lu en base → analyse gardée, ou null.
export function normaliserAnalyseIa(raw: unknown): AnalyseIa | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const analyse = normaliserAnalyse(o.analyse);
  const genereLe = typeof o.genereLe === "string" && !Number.isNaN(Date.parse(o.genereLe)) ? o.genereLe : "";
  if (!analyse || !genereLe) return null;
  const sujets = Array.isArray(o.sujets) ? o.sujets.flatMap((s) => normaliserSujetPrevu(s) ?? []).slice(0, SUJETS_MAX) : [];
  return { analyse, sujets, genereLe };
}
