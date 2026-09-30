// Import du BI RM : 2 captures Power BI ALIGNÉES LIGNE PAR LIGNE (hiérarchie Région → TM → sales).
// Le screen 2 porte les noms ; le screen 1 garde le même ordre de lignes, sans les noms : ligne N = ligne N.
// Utilisé par la route /api/lecture-bi-rm (serveur), l'onglet Import du RM et l'enregistrement.
import type { KpiDonnees, KpiKey } from "@/lib/kpis";
import { associerLignes, nombre, normaliserNom } from "@/lib/lecture-bi";

// Les 2 captures, dans l'ordre de dépôt (le screen 2, avec les noms, en premier).
export const CAPTURES_BI_RM = [
  { code: "2", titre: "Performance Overview", hint: "avec les noms · budget · installs · ventes · pace" },
  { code: "1", titre: "Ventes & POS", hint: "sans les noms · quick sale · OG · POS · upfront" },
] as const;

// Une colonne du BI RM : sa clé dans `donnees`, son intitulé exact dans le BI, et sa capture.
// Les clés qui sont des KPIs MOMENTO (ventes, install, vPace…) sont reprises telles quelles par l'analyse ;
// les autres sont gardées pour plus tard. AC1% et Avg TPV ne sont PAS lus (décision : jamais stockés).
type ColonneBi = { cle: string; libelle: string; ecran: "1" | "2"; kpi?: true };

export const COLONNES_BI_RM: readonly ColonneBi[] = [
  // Screen 2 — Performance Overview
  { cle: "objectif", libelle: "Sales Budget", ecran: "2" },
  { cle: "awaitingInstall", libelle: "Awaiting Installations", ecran: "2" },
  { cle: "install", libelle: "Installations", ecran: "2", kpi: true },
  { cle: "slackInstall", libelle: "Slack Installations", ecran: "2" },
  { cle: "budgetReachedInstall", libelle: "% Budget reached (Install)", ecran: "2" },
  { cle: "iPace", libelle: "Budget Pace", ecran: "2", kpi: true },
  { cle: "ipp", libelle: "IPP", ecran: "2" },
  { cle: "ippPace", libelle: "IPP Pace", ecran: "2" },
  { cle: "backlog", libelle: "Sale Backlog", ecran: "2", kpi: true }, // installs en attente de validation
  { cle: "sendback", libelle: "Sent Back Rate", ecran: "2", kpi: true },
  { cle: "ventes", libelle: "Signed Sales", ecran: "2", kpi: true },
  { cle: "budgetReachedSigned", libelle: "% Budget reached (Signed)", ecran: "2" },
  { cle: "vPace", libelle: "Sales Budget Pace", ecran: "2", kpi: true },
  { cle: "spp", libelle: "SPP", ecran: "2" },
  { cle: "sppPace", libelle: "SPP Pace", ecran: "2" },
  { cle: "missingOutcome", libelle: "Missing outcome", ecran: "2" },
  { cle: "followUps", libelle: "Follow Ups", ecran: "2" },
  { cle: "ihPerformed", libelle: "IH Performed", ecran: "2" },
  { cle: "ogPerformed", libelle: "OG Performed", ecran: "2" },
  { cle: "ihCrmSales", libelle: "IH CRM Sales", ecran: "2" },
  { cle: "ihcr", libelle: "CRM IH CR%", ecran: "2", kpi: true },
  // Screen 1
  { cle: "quickSale", libelle: "Quick Sale %", ecran: "1" },
  { cle: "slackSales", libelle: "Slack Sales", ecran: "1" },
  { cle: "crmSales", libelle: "CRM Sales", ecran: "1" },
  { cle: "ogPct", libelle: "Signed OG Sales %", ecran: "1" },
  { cle: "og", libelle: "Signed OG Sales #", ecran: "1", kpi: true },
  { cle: "taux", libelle: "Avg Signed Rate", ecran: "1", kpi: true },
  { cle: "posSales", libelle: "POS Signed #", ecran: "1", kpi: true },
  { cle: "posPp", libelle: "POS PP", ecran: "1" },
  { cle: "posShare", libelle: "POS Signed %", ecran: "1", kpi: true },
  { cle: "posRate", libelle: "Average POS Rate Sold", ecran: "1" },
  { cle: "upfrontTotal", libelle: "Total Upfront", ecran: "1" }, // prix total des caisses
  { cle: "posUpfront", libelle: "Avg Upfront", ecran: "1", kpi: true }, // upfront moyen
];

// Tous les chiffres d'une ligne du BI RM : clé → nombre, ou null si vide / illisible.
export type DonneesBiRm = Record<string, number | null>;

export type NiveauBi = "region" | "tm" | "sales";

// Une ligne lue et assemblée (screen 2 + screen 1), dans l'ordre du BI.
export type LigneBiRm = { rang: number; nom: string; niveau: NiveauBi; donnees: DonneesBiRm };

// Une ligne après reconnaissance, prête à vérifier puis à enregistrer.
// etat : ok · inconnu (sales dont le nom n'est pas dans l'équipe du TM : enregistré sans rattachement)
//        · ignore (TM qui n'est pas l'un des tiens, ou ligne sous ce TM : non enregistrée).
export type LigneReconnue = LigneBiRm & {
  tmId: string | null;
  commercialId: string | null;
  etat: "ok" | "inconnu" | "ignore";
};

export type LectureBiRmReponse =
  | { ok: true; lignes: LigneReconnue[] }
  | { ok: false; error: string; reessayable?: boolean };

// Les KPIs MOMENTO d'une ligne (pour l'analyse et les écrans du 1:1).
export function kpisDuBi(d: DonneesBiRm): KpiDonnees {
  const kpis: KpiDonnees = {};
  for (const c of COLONNES_BI_RM) if (c.kpi && c.cle in d) kpis[c.cle as KpiKey] = d[c.cle];
  return kpis;
}

// Ne garde que les colonnes connues, en nombres (on ne fait jamais confiance à ce qui arrive).
export function nettoyerDonnees(brut: unknown, ecran?: "1" | "2"): DonneesBiRm {
  const src = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  const out: DonneesBiRm = {};
  for (const c of COLONNES_BI_RM) if (!ecran || c.ecran === ecran) out[c.cle] = nombre(src[c.cle]);
  return out;
}

const liste = (ecran: "1" | "2") =>
  COLONNES_BI_RM.filter((c) => c.ecran === ecran)
    .map((c) => `- "${c.libelle}" -> ${c.cle}`)
    .join("\n");

export const PROMPT_BI_RM = `Tu reçois 2 captures d'écran d'un tableau Power BI de performance commerciale, organisé en hiérarchie : une ligne Région (synthèse), puis pour chaque manager (TM) une ligne agrégée suivie des lignes de ses commerciaux (sales).
Les 2 captures sont ALIGNÉES LIGNE PAR LIGNE : elles montrent EXACTEMENT les mêmes lignes, dans le MÊME ORDRE. L'IMAGE 2 affiche les noms ; l'IMAGE 1 n'affiche pas les noms.

IMAGE 2 — "Performance Overview" : pour CHAQUE ligne, de haut en bas, lis le nom affiché, son niveau, et ces colonnes :
${liste("2")}
Niveau : "region" pour la ligne de synthèse de la région (ou total), "tm" pour une ligne agrégée de manager (souvent en gras, ou avec un bouton +/- pour déplier), "sales" pour une ligne de commercial (souvent en retrait sous son manager).

IMAGE 1 : pour CHAQUE ligne, de haut en bas, dans le MÊME ordre que l'IMAGE 2, lis ces colonnes :
${liste("1")}
N'invente pas de nom pour l'IMAGE 1. Ignore les colonnes "AC1%" et "Avg TPV Signed" : ne les recopie pas.

Règles : ne saute AUCUNE ligne et n'en ajoute aucune (même une ligne presque vide compte). Une case vide ou illisible = null (jamais deviner). Recopie ce qui est affiché, ne calcule rien. Les pourcentages en nombre sans le signe % (ex: 133 pour "133 %", 0.76 pour "0,76 %"). Les euros sans symbole (ex: 1375 pour "€ 1 375"). Décimales avec un point.

FORMAT DE SORTIE : UNIQUEMENT un objet JSON valide, sans texte autour :
{
  "image2": [ { "nom": "Sud Est", "niveau": "region", "objectif": 450, "install": 380, "iPace": 96, "ventes": 402, "vPace": 101, "sendback": 7.2 } ],
  "image1": [ { "quickSale": 41, "og": 120, "posSales": 88, "posShare": 21.9, "posUpfront": 1180 } ]
}
Les deux listes doivent avoir exactement le même nombre d'éléments. Mets toutes les clés listées ci-dessus (null si vide).`;

// Texte de Gemini → lignes assemblées (ligne N de l'image 2 + ligne N de l'image 1).
// null = pas le JSON attendu ; { decalage } = les 2 captures n'ont pas le même nombre de lignes.
export function assemblerReponse(texte: string): LigneBiRm[] | { decalage: [number, number] } | null {
  let json: unknown;
  try {
    json = JSON.parse(texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }
  const j = json as { image2?: unknown; image1?: unknown } | null;
  const image2: unknown[] | null = Array.isArray(j?.image2) ? j.image2 : null;
  const image1: unknown[] | null = Array.isArray(j?.image1) ? j.image1 : null;
  if (!image2 || !image1) return null;
  if (image2.length !== image1.length) return { decalage: [image2.length, image1.length] };

  return image2.map((brut2, i) => {
    const l2 = brut2 && typeof brut2 === "object" ? (brut2 as Record<string, unknown>) : {};
    const nom = typeof l2.nom === "string" ? l2.nom.trim() : "";
    const niveau: NiveauBi = l2.niveau === "region" || l2.niveau === "tm" ? l2.niveau : "sales";
    return {
      rang: i + 1,
      nom,
      niveau,
      donnees: { ...nettoyerDonnees(l2, "2"), ...nettoyerDonnees(image1[i], "1") },
    };
  });
}

type Personne = { id: string; nom: string };

// Reconnaissance, dans l'ordre du BI : une ligne au nom d'un de tes TM ouvre son bloc ; les lignes suivantes
// sont ses sales, rapprochés de SES commerciaux. Les lignes avant le premier TM (et celles vues « region »,
// comme un total en bas) sont la synthèse Région.
// Un nom inconnu est signalé, jamais deviné.
export function reconnaitreLignes(
  lignes: LigneBiRm[],
  tms: Personne[],
  commerciauxParTm: Record<string, Personne[]>,
): LigneReconnue[] {
  const candidats = (liste: Personne[]) => liste.map((p) => ({ id: p.id, name: p.nom }));
  // Un TM : même nom exactement ; ou ligne vue comme « tm » par Gemini et un seul TM approchant.
  const tmDe = (l: LigneBiRm) => {
    const exact = tms.filter((t) => normaliserNom(t.nom) === normaliserNom(l.nom));
    if (exact.length === 1) return exact[0].id;
    if (l.niveau !== "tm") return null;
    const { reconnus } = associerLignes([{ nom: l.nom, valeurs: {} }], candidats(tms));
    return reconnus[0]?.repId ?? null;
  };

  const resultat: LigneReconnue[] = [];
  let bloc: { tmId: string | null } | null = null; // null = pas encore de TM (lignes de synthèse)
  for (const l of lignes) {
    const tmId = tmDe(l);
    if (tmId) {
      bloc = { tmId };
      resultat.push({ ...l, niveau: "tm", tmId, commercialId: null, etat: "ok" });
    } else if (l.niveau === "tm") {
      // Un manager qui n'est pas l'un de tes TM : sa ligne et ses sales ne sont pas enregistrés.
      bloc = { tmId: null };
      resultat.push({ ...l, tmId: null, commercialId: null, etat: "ignore" });
    } else if (l.niveau === "region" || !bloc) {
      resultat.push({ ...l, niveau: "region", tmId: null, commercialId: null, etat: "ok" });
    } else if (!bloc.tmId) {
      resultat.push({ ...l, niveau: "sales", tmId: null, commercialId: null, etat: "ignore" });
    } else {
      const equipe = commerciauxParTm[bloc.tmId] ?? [];
      const { reconnus } = associerLignes([{ nom: l.nom, valeurs: {} }], candidats(equipe));
      const commercialId = reconnus[0]?.repId ?? null;
      resultat.push({ ...l, niveau: "sales", tmId: bloc.tmId, commercialId, etat: commercialId ? "ok" : "inconnu" });
    }
  }
  return resultat;
}
