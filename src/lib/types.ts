// Les chiffres bruts d'un commercial pour un mois, tels qu'ils sortent du BI.
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
  rate: number; // taux moyen
  posSales: number; // POS vendus
  posInst: number; // POS installés
  posShare: number; // % POS share
  posUpfront: number; // € POS upfront moyen
  posRate: number;
  og: number; // ventes OG (RDV créés en propre)
  ihcr: number; // % conversion IH
  ihQuick: number; // % IH quick
  ihMtg: number; // RDV IH
  mtgAc: number; // % meetings avec AC
  discount: number;
};

export type Level = "M3+" | "M2" | "M1";

// Le commercial enrichi des valeurs calculées par MOMENTO.
export type Rep = RawRep & {
  initials: string;
  level: Level;
  vAtt: number; // atteinte ventes (ventes / budget)
  iAtt: number; // atteinte installations
  posInstPct: number; // % d'installations qui sont des POS
  vPaceF: number; // pace ventes en fraction (1 = 100 %)
  iPaceF: number; // pace installations en fraction
};

export type StatusKey = "acc" | "watch" | "ok";

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
};

export type View = "equipe" | "oo" | "import";
