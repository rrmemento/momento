// Le « Brief auto » du 1:1 : préparé par Gemini à partir des chiffres, de l'analyse MOMENTO
// et des engagements du mois précédent. Gardé dans la fiche (entretiens.contenu.brief).
import { formatKpi, KPI_FIELDS, normaliserObjectifChiffre, type KpiDonnees, type KpiKey } from "./kpis";
import { RAISONS } from "./mois-special";
import { emptySubject, pc } from "./momento";
import type { Engagement, StatutEngagement } from "./suivi";
import type { Analysis, BriefIa, Rep, Status, Subject } from "./types";

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
    genereLe: typeof o.genereLe === "string" && !Number.isNaN(Date.parse(o.genereLe)) ? o.genereLe : "",
  };
  return brief.aborder && brief.sujet && brief.question && brief.genereLe ? brief : null;
}

// Un sujet proposé par Gemini → un sujet de fiche (« Sa réponse » vide, à remplir pendant le 1:1), ou null.
// L'objectif chiffré n'est gardé que s'il est complet et valide (KPI connu, cible cohérente).
function lireSujet(raw: unknown): Subject | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const questions = Array.isArray(o.questions) ? o.questions.map(texte).filter(Boolean).slice(0, QUESTIONS_MAX) : [];
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

function lignesChiffres(d: KpiDonnees) {
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

function lignesEngagements(liste: Engagement[]) {
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
}: {
  rep: Rep;
  mois: string;
  moisPrecedent: string;
  chiffres: KpiDonnees;
  status: Status;
  analysis: Analysis;
  engagements: Engagement[];
}) {
  const prenom = rep.name.split(" ")[0];
  const pace = (p: number | null, att: number) => (p != null ? pc(p) : `${Math.round(att * 100)} % (atteinte)`);
  return `Tu es un directeur commercial expérimenté. Tu prépares, pour un manager, son One-on-One de ${mois.toLowerCase()} avec ${prenom}, un(e) commercial(e) de son équipe. Tu écris AU MANAGER (tutoiement), en français, court et actionnable, avec un ton bienveillant et direct. Pas de blabla, pas de jargon RH, pas de formules creuses.

LE COMMERCIAL
- Nom : ${rep.name}
- Niveau : ${rep.level} (budget mensuel habituel : ${rep.budget} ventes et ${rep.budget} installations)${rep.sen ? `\n- Séniorité : ${rep.sen}` : ""}${
    rep.special
      ? `\n- MOIS PARTICULIER (${RAISONS.find((r) => r.value === rep.special!.raison)?.label ?? "autre"}) : l'objectif de ce mois est AJUSTÉ à ${rep.objectif} ventes et ${rep.objectif} installations. Juge l'atteinte sur cet objectif ajusté (le pace ci-dessous en tient déjà compte), jamais sur le budget habituel, et tiens compte du contexte.`
      : ""
  }
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
3. L'exigence POS (4 POS par mois minimum) ne concerne que les M3+. Ne reproche jamais le POS à un M1 ou un M2.
4. Délai moyen d'installation (vente → pose) : cible moins de 7 jours ; de 7 à 12 jours, à améliorer ; au-delà de 12 jours, critique.
5. Les points de vigilance sont réservés aux situations vraiment critiques, celles listées par MOMENTO ci-dessus. N'en invente pas et ne transforme pas un axe de progression en alerte.
6. Adapte-toi au niveau : un M1 apprend le métier (encourager, cadrer, simplifier), un M3+ est attendu sur l'autonomie, la qualité et l'exemplarité.
7. N'utilise QUE les chiffres et les faits fournis ci-dessus. N'invente aucun chiffre, aucun événement, aucune cause.

CE QUE TU DOIS PRODUIRE
- "aborder" : « Comment l'aborder », 1 à 2 phrases de posture managériale pour cet entretien (état d'esprit, ce qu'il faut éviter).
- "celebrer" : « À célébrer », 1 à 3 points forts RÉELS du mois, chacun en une phrase courte avec le chiffre à l'appui. Si le mois est difficile, trouve le vrai point d'appui (même modeste) sans l'exagérer.
- "engagements" : « Engagements du mois dernier », 1 à 2 phrases : ce qui a été tenu (le reconnaître), ce qui ne l'a pas été (comment en parler sans reproche, en cherchant la cause). S'il n'y a aucun engagement, renvoie une chaîne vide "".
- "sujet" : « Le sujet à ouvrir », 1 à 2 phrases : le point principal à travailler (en priorité un point de vigilance, sinon l'axe de progression le plus utile, sinon un sujet de développement si tout va bien), formulé de façon à mobiliser sans démotiver.
- "question" : « Question à poser », UNE question ouverte et concrète, adressée directement à ${prenom} (tutoiement), liée au sujet à ouvrir.
- "sujets" : 2 à 3 SUJETS à travailler pendant l'entretien, du plus important au moins important. Ils seront insérés dans la fiche du 1:1 que le manager complétera. Le premier correspond au « sujet à ouvrir ». Un engagement NON TENU du mois dernier peut justifier un sujet. Si tout va bien, propose des sujets de développement (confirmer, aller plus loin), jamais des reproches. Pour chaque sujet :
  - "titre" : un titre court et mobilisateur (moins de 60 caractères), ex. « Transformer les ventes en installations ».
  - "constat" : 1 à 2 phrases factuelles, avec les chiffres fournis (et l'engagement du mois dernier s'il y en a un sur ce thème). Aucun jugement, aucun chiffre inventé.
  - "questions" : 1 à 3 questions ouvertes et concrètes, adressées directement à ${prenom} (tutoiement), pour lui faire trouver les causes et les solutions.
  - "objectif" : un objectif chiffré pour le mois prochain SEULEMENT s'il est pertinent et mesurable par un des KPIs ci-dessous, sinon null. Forme : {"kpi": "<clé>", "sens": ">=" ou "<=", "valeur": <nombre>}. La cible doit être réaliste par rapport au chiffre actuel et au niveau. « <= » pour ce qu'on veut faire baisser (délai moyen, backlog, send back), « >= » pour le reste. Pourcentages en nombre sans le signe % (ex. 25), valeurs entières pour les comptes (ventes, installations, POS…). Jamais d'objectif POS pour un M1 ou un M2.

KPIs utilisables pour "objectif" (clé → libellé) :
${KPI_FIELDS.map((f) => `- ${f.key} → ${f.label}${f.unit ? ` (${f.unit})` : ""}${f.integer ? " (nombre entier)" : ""}`).join("\n")}

Chaque texte fait au plus 300 caractères. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme :
{"aborder": "…", "celebrer": ["…", "…"], "engagements": "…", "sujet": "…", "question": "…",
 "sujets": [{"titre": "…", "constat": "…", "questions": ["…", "…"], "objectif": {"kpi": "install", "sens": ">=", "valeur": 12}}, {"titre": "…", "constat": "…", "questions": ["…"], "objectif": null}]}`;
}
