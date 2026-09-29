// Le suivi des engagements : ce qui a été décidé au 1:1 d'un mois, confronté aux chiffres du mois suivant.
// Utilisé par l'onglet Suivi et par le rappel en haut de la fiche One-on-One.
import { formatKpi, kpiField, libelleObjectifChiffre, type KpiDonnees } from "./kpis";
import type { OneOnOne, Subject } from "./types";

// Le choix du manager pour un engagement en texte libre (enregistré dans le sujet, colonne entretiens.contenu).
export type SuiviManuel = "tenu" | "non_tenu" | "en_cours";

export const SUIVI_MANUEL: readonly { value: SuiviManuel; label: string }[] = [
  { value: "tenu", label: "Tenu" },
  { value: "non_tenu", label: "Non tenu" },
  { value: "en_cours", label: "En cours" },
];

export const isSuiviManuel = (v: unknown): v is SuiviManuel => SUIVI_MANUEL.some((s) => s.value === v);

// manquant = objectif chiffré, mais le KPI du mois n'est pas encore saisi ; a_juger = texte libre pas encore jugé.
export type StatutEngagement = SuiviManuel | "manquant" | "a_juger";

export type Engagement = {
  index: number; // position du sujet dans la fiche du mois précédent
  titre: string;
  objectif: string; // l'objectif concret, en texte
  cible: string | null; // « POS vendus ≥ 4 » ; null = engagement en texte libre
  reel: string | null; // « 6 », « 18 % »… ; null si pas de cible ou chiffre manquant
  statut: StatutEngagement;
};

const UNITES = { "%": " %", j: " j", "€": " €" } as const;

// Un sujet vide (ni titre, ni objectif, ni cible) n'est pas un engagement.
function engagement(s: Subject, index: number, kpis: KpiDonnees | undefined): Engagement | null {
  const titre = s.t.trim();
  const objectif = s.g.trim();
  const cible = libelleObjectifChiffre(s.cible);
  if (!titre && !objectif && !cible) return null;
  const base = { index, titre: titre || `Sujet ${index + 1}`, objectif, cible };

  // Texte libre : c'est le manager qui juge.
  if (!cible || !s.cible || s.cible.valeur == null) return { ...base, reel: null, statut: s.suivi ?? "a_juger" };

  // Objectif chiffré : rapprochement automatique avec le chiffre réel du mois.
  const reel = kpis?.[s.cible.kpi];
  if (reel == null) return { ...base, reel: null, statut: "manquant" };
  const tenu = s.cible.sens === ">=" ? reel >= s.cible.valeur : reel <= s.cible.valeur;
  const unite = kpiField(s.cible.kpi)?.unit;
  return { ...base, reel: `${formatKpi(reel)}${unite ? UNITES[unite] : ""}`, statut: tenu ? "tenu" : "non_tenu" };
}

// Les engagements pris au 1:1 `fiche`, jugés avec les chiffres `kpis` du mois suivant.
export function engagements(fiche: OneOnOne | undefined, kpis: KpiDonnees | undefined): Engagement[] {
  if (!fiche) return [];
  return fiche.sujets.flatMap((s, k) => engagement(s, k, kpis) ?? []);
}

export function compter(liste: Engagement[]) {
  const n = (statut: StatutEngagement) => liste.filter((e) => e.statut === statut).length;
  return {
    total: liste.length,
    tenus: n("tenu"),
    nonTenus: n("non_tenu"),
    aJuger: n("a_juger"),
    enCours: n("en_cours"),
    manquants: n("manquant"),
  };
}
