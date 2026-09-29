import type { ObjectifChiffre } from "./kpis";
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
  level: Level;
  vAtt: number; // atteinte ventes (ventes / budget)
  iAtt: number; // atteinte installations
  posInstPct: number; // % d'installations qui sont des POS
  vPaceF: number; // pace ventes en fraction (1 = 100 %)
  iPaceF: number; // pace installations en fraction
};

export type StatusKey = "acc" | "watch" | "ok" | "none"; // none = chiffres pas encore renseignés

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
  brief: BriefIa | null; // le brief préparé par l'IA, gardé pour ne pas rappeler Gemini à chaque ouverture
};

// Le « Brief auto » du 1:1, généré par Gemini.
export type BriefIa = {
  aborder: string; // comment l'aborder (posture managériale)
  celebrer: string[]; // les vrais points forts du mois
  engagements: string; // ce qu'il faut dire des engagements du mois dernier ("" s'il n'y en avait pas)
  sujet: string; // le sujet à ouvrir
  question: string; // la question ouverte à poser
  genereLe: string; // date et heure de génération (ISO)
};

export type View = "equipe" | "oo" | "suivi" | "saisie" | "import";

// Ce que l'interface affiche du manager connecté (lu dans Supabase côté serveur).
export type ManagerProfile = { nom: string; equipe: string | null; initials: string };
