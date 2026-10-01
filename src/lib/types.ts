import type { ObjectifChiffre } from "./kpis";
import type { MoisSpecial } from "./mois-special";
import type { NiveauMois } from "./niveau-mois";
import type { SuiviManuel } from "./suivi";

// Les chiffres bruts d'un commercial pour un mois (saisis dans MOMENTO ou issus du BI).
// null = non renseigné : les règles qui en dépendent ne se déclenchent pas.
export type RawRep = {
  id: string;
  name: string;
  sen: string; // ancienneté (M1, M3, M6…)
  budget: number; // objectif mensuel (ventes et installations)
  install: number; // installations réalisées
  vPace: number | null; // pace ventes en % (projection fin de mois)
  iPace: number | null; // pace installations en %
  quick: number | null; // % quick install
  avgDays: number | null; // délai moyen vente → pose, en jours
  backlog: number;
  ventes: number; // ventes signées
  sendback: number | null; // % de send back (dossiers en erreur)
  rate: number | null; // taux moyen
  posSales: number; // POS vendus
  posInst: number; // POS installés
  posShare: number | null; // % POS share
  posUpfront: number | null; // € POS upfront moyen
  posRate: number | null;
  og: number; // ventes OG (RDV créés en propre)
  ihcr: number | null; // % conversion IH
  ihQuick: number | null; // % IH quick
  ihMtg: number | null; // RDV IH
  mtgAc: number | null; // % meetings avec AC
  discount: number | null;
};

export type Level = "M3+" | "M2" | "M1";

// Le commercial enrichi des valeurs calculées par MOMENTO.
export type Rep = RawRep & {
  hasKpis: boolean; // false tant que ventes ET installs du mois ne sont pas renseignés
  partial: boolean; // des chiffres saisis, mais pas encore ventes et installs
  initials: string;
  level: Level; // d'après le budget normal, même si le mois est particulier
  objectif: number; // objectif du mois : le budget, ou l'objectif ajusté d'un mois particulier
  special: MoisSpecial | null; // mois particulier (congés, arrêt, ramp-up…), null sinon
  niveauMois: NiveauMois | null; // niveau et budget DE CE MOIS, calculés depuis le démarrage ; null = ceux de la fiche
  fiche: { sen: string; budget: number; demarrage: string | null }; // la fiche : niveau au démarrage, budget, mois de démarrage
  vAtt: number; // atteinte ventes (ventes / objectif du mois)
  iAtt: number; // atteinte installations
  posInstPct: number; // % d'installations qui sont des POS
  vPaceF: number; // pace ventes en fraction (1 = 100 %)
  iPaceF: number; // pace installations en fraction
};

// ok = en forme (vert) · voie = en bonne voie (orange clair) · watch = à surveiller (orange) · acc = à accompagner (rouge)
// · none = chiffres pas encore renseignés
export type StatusKey = "acc" | "watch" | "voie" | "ok" | "none";

export type Status = {
  k: StatusKey;
  t: string; // libellé affiché
  why: string; // raison courte
};

export type Insight = {
  big: string; // le chiffre mis en avant
  tt: string; // titre
  dd: string; // détail
};

export type Analysis = {
  S: Insight[]; // succès
  A: Insight[]; // axes de progression
  N: Insight[]; // points de vigilance
};

export type Subject = {
  t: string; // le sujet
  o: string; // ce que j'observe
  r: string; // comment on le règle
  g: string; // objectif concret
  questions: string; // les questions à poser au commercial, une par ligne
  reponse: string; // sa réponse, notée pendant le 1:1
  ia: boolean; // sujet proposé par le brief IA (modifiable comme les autres)
  cible: ObjectifChiffre | null; // objectif chiffré optionnel (KPI + sens + valeur)
  suivi: SuiviManuel | null; // jugé le mois suivant par le manager (engagement sans objectif chiffré)
};

export type OneOnOne = {
  ressenti: string;
  fier: string;
  bloque: string;
  note: number;
  titre: string;
  forts: string;
  sujets: Subject[];
  besoin: string;
  objectif: string;
  clotureLe: string | null; // date de clôture du 1:1 (« 2026-09-28 »), null tant qu'il n'est pas clôturé
  perfReview: boolean; // coché par le manager : la présentation se termine par une section « Perf review » (engagements)
  brief: BriefIa | null; // le brief préparé par l'IA, gardé pour ne pas rappeler Gemini à chaque ouverture
  diagnosticIa: DiagnosticIa | null; // profil + diagnostic IA du Parcours (rangé dans le 1:1 du mois en cours)
  analyseIa: AnalyseIa | null; // L'analyse « data analyst » de la personne (sales ou TM), générée une fois puis gardée
  // Vue RM, dans la fiche d'un TM : l'analyse et les sujets prévus de chacun de ses sales (clé = nom du sales).
  analysesSales: Record<string, AnalyseIa>;
};

// Le profil du commercial, déterminé par l'IA sur tout son parcours (onglet Parcours).
export type ProfilParcours = "valeur_sure" | "progression" | "risque" | "irregulier" | "rampup" | "repli";

// Le diagnostic de parcours établi par l'IA : un verdict, pas une répétition des KPIs.
export type DiagnosticIa = {
  profil: ProfilParcours;
  phrase: string; // le profil expliqué en une phrase de manager
  trajectoire: { sens: "progresse" | "stagne" | "decroche"; texte: string };
  monte: string[]; // ce qui monte
  coince: string[]; // ce qui coince
  priorite: { texte: string; action: string }; // ce qui mérite l'attention en premier + l'action concrète
  reussites: string[]; // points forts et réussites marquantes dans le temps
  genereLe: string; // date et heure de génération (ISO)
};

// Un sujet PRÉVU pour un 1:1 (ce dont il va parler), proposé par l'analyse : lecture seule, sans les réponses.
export type SujetPrevu = { titre: string; constat: string; questions: string[]; objectif?: string }; // objectif chiffré, en clair

// L'analyse « data analyst » (IA), avec la gravité de chaque point fixée par les règles MOMENTO.
export type AnalyseIa = { analyse: Analysis; sujets: SujetPrevu[]; genereLe: string };

// Le « Brief auto » du 1:1, généré par Gemini.
export type BriefIa = {
  aborder: string; // comment l'aborder (posture managériale)
  celebrer: string[]; // les vrais points forts du mois
  engagements: string; // ce qu'il faut dire des engagements du mois dernier ("" s'il n'y en avait pas)
  sujet: string; // le sujet à ouvrir
  question: string; // la question ouverte à poser
  ouverture: string[]; // 2-3 pistes pour ouvrir l'entretien (motivation, charge, ambiance, ce qui l'anime)
  genereLe: string; // date et heure de génération (ISO)
  // Vue RM uniquement : l'analyse « data analyst » du TM (3 succès, 2 axes, 1 vigilance max). Absente pour un sales.
  analyse?: Analysis;
};

export type View = "equipe" | "oo" | "parcours" | "import";

// Ce que l'interface affiche du manager connecté (lu dans Supabase côté serveur).
export type ManagerProfile = { nom: string; equipe: string | null; initials: string };
