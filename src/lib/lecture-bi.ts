// Lecture des captures Power BI : nettoyage de la réponse de Gemini (serveur)
// et correspondance des noms lus avec les commerciaux Supabase (navigateur).
import { BUDGETS, formatKpi, KPI_FIELDS, type KpiDonnees, type KpiKey } from "@/lib/kpis";
import { BUDGET_PAR_SENIORITE } from "@/lib/seniorite";

// Une ligne du tableau Power BI : un commercial et ses chiffres lus (null = illisible ou absent).
// seniorite / budget : seulement si les captures les affichent (servent à créer un commercial inconnu).
export type LigneBi = { nom: string; valeurs: KpiDonnees; seniorite?: string | null; budget?: number | null };

// `reessayable` : surcharge passagère de Google (503), relancer un peu plus tard a de bonnes chances de marcher.
export type LectureBiReponse =
  | { ok: true; commerciaux: LigneBi[] }
  | { ok: false; error: string; reessayable?: boolean };

// Les 3 captures, dans l'ordre attendu par le prompt (IMAGE A, B, C).
export const CAPTURES_BI = [
  { code: "A", titre: "Performance Overview", hint: "installs · ventes · pace · POS" },
  { code: "B", titre: "Installation Performance", hint: "installs · délai · quick · backlog" },
  { code: "C", titre: "Sales Performance", hint: "OG · IH CR · IH quick · meeting AC" },
] as const;

export const TYPES_IMAGE = ["image/png", "image/jpeg", "image/webp"];
export const TAILLE_MAX_IMAGE = 5 * 1024 * 1024; // 5 Mo par capture

// « Kélly  HOCHET » → « kelly hochet »
export function normaliserNom(nom: string) {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents détachés par NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LIGNES_SYNTHESE = ["france", "sud est", "total", "grand total"];

// « 1 375 », « 0,76 % », « € 1 498 » → nombre ; tout le reste → null.
function nombre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  // Unités éventuelles retirées : « 27,3 % », « € 1 375 », « 10,6 j », « 10.6 days » (espaces insécables comprises).
  const t = v
    .replace(/[\s\u00a0\u202f%€]/g, "")
    .replace(/(jours?|j|days?|d)$/i, "")
    .replace(",", ".");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Texte renvoyé par Gemini → lignes propres. null si ce n'est pas le JSON attendu.
export function lireReponseGemini(texte: string, nomManager?: string): LigneBi[] | null {
  let json: unknown;
  try {
    // Par sécurité, on retire un éventuel bloc ```json … ``` autour de la réponse.
    json = JSON.parse(texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }
  const brut = (json as { commerciaux?: unknown } | null)?.commerciaux;
  if (!Array.isArray(brut)) return null;

  const exclus = new Set(LIGNES_SYNTHESE);
  if (nomManager) exclus.add(normaliserNom(nomManager));

  // Un même commercial lu deux fois : on fusionne, la première valeur non vide l'emporte.
  const parNom = new Map<string, LigneBi>();
  for (const item of brut) {
    if (!item || typeof item !== "object") continue;
    const nom = typeof (item as { nom?: unknown }).nom === "string" ? (item as { nom: string }).nom.trim() : "";
    const cle = normaliserNom(nom);
    if (!cle || exclus.has(cle)) continue;

    const champs = item as Record<string, unknown>;
    const ligne = parNom.get(cle) ?? { nom, valeurs: {} };
    for (const f of KPI_FIELDS) {
      const key = f.key as KpiKey;
      if (ligne.valeurs[key] == null) ligne.valeurs[key] = nombre(champs[key]);
    }
    ligne.seniorite ??=
      typeof champs.seniorite === "string" || typeof champs.seniorite === "number"
        ? String(champs.seniorite).trim() || null
        : null;
    ligne.budget ??= nombre(champs.budget);
    parNom.set(cle, ligne);
  }
  return [...parNom.values()];
}

// « M1 », « M6 », « 2 mois », « M3+ » → M1 / M2 / M3+ ; null si illisible.
function niveauDeSeniorite(lu: string | null | undefined) {
  const n = Number(lu?.match(/\d+/)?.[0]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 3 ? "M3+" : n === 2 ? "M2" : "M1";
}

// Séniorité et budget d'un nouveau commercial d'après sa ligne lue.
// On prend ce qui est lisible sur les captures, on complète l'un par l'autre, sinon M3+ / 15 (modifiable ensuite).
export function profilDetecte(ligne: LigneBi): { seniorite: string; budget: number } {
  const budgetLu = BUDGETS.find((b) => b.value === ligne.budget);
  const seniorite = niveauDeSeniorite(ligne.seniorite) ?? budgetLu?.label ?? "M3+";
  return { seniorite, budget: budgetLu?.value ?? BUDGET_PAR_SENIORITE[seniorite] };
}

// ——— Correspondance nom lu → commercial ———

type Candidat = { id: string; name: string };

// 3 = mêmes mots (ordre libre) · 2 = prénom seul / nom partiel · 1 = mots tronqués (« Bastien G. ») · 0 = rien.
function score(lu: string[], connu: string[]) {
  if (!lu.length || !connu.length) return 0;
  const inclus = (a: string[], b: string[]) => a.every((m) => b.includes(m));
  if (lu.length === connu.length && inclus(lu, connu)) return 3;
  if (inclus(lu, connu) || inclus(connu, lu)) return 2;
  if (lu.every((m) => connu.some((c) => c.startsWith(m)))) return 1;
  return 0;
}

export type Correspondance = {
  reconnus: { repId: string; ligne: LigneBi }[];
  // inconnu : aucun nom approchant dans l'équipe → candidat à « Créer tous les commerciaux détectés ».
  // Les noms ambigus ou en double ressemblent à un commercial existant : on ne les crée pas en masse.
  nonReconnus: { ligne: LigneBi; raison: string; inconnu?: boolean }[];
};

export function associerLignes(lignes: LigneBi[], reps: Candidat[]): Correspondance {
  const mots = (s: string) => normaliserNom(s).split(" ").filter(Boolean);
  const nonReconnus: Correspondance["nonReconnus"] = [];
  const trouves: { repId: string; ligne: LigneBi; score: number }[] = [];

  for (const ligne of lignes) {
    const lu = mots(ligne.nom);
    const notes = reps.map((r) => ({ rep: r, score: score(lu, mots(r.name)) })).filter((n) => n.score > 0);
    const meilleur = Math.max(0, ...notes.map((n) => n.score));
    const premiers = notes.filter((n) => n.score === meilleur);
    if (!premiers.length) {
      nonReconnus.push({ ligne, raison: "Aucun commercial de ton équipe ne porte ce nom.", inconnu: true });
    } else if (premiers.length > 1) {
      nonReconnus.push({
        ligne,
        raison: `Nom ambigu : ${premiers.map((n) => n.rep.name).join(", ")}.`,
      });
    } else {
      trouves.push({ repId: premiers[0].rep.id, ligne, score: meilleur });
    }
  }

  // Deux lignes pour le même commercial : la correspondance la plus sûre l'emporte.
  const reconnus: Correspondance["reconnus"] = [];
  for (const t of trouves.sort((a, b) => b.score - a.score)) {
    const deja = reconnus.find((r) => r.repId === t.repId);
    if (deja) {
      nonReconnus.push({ ligne: t.ligne, raison: `Même commercial que « ${deja.ligne.nom} », déjà rattaché.` });
    } else {
      reconnus.push({ repId: t.repId, ligne: t.ligne });
    }
  }
  return { reconnus, nonReconnus };
}

// Un import en cours de vérification : rien n'est enregistré tant que le manager ne valide pas chaque fiche.
export type ImportBi = {
  id: number; // change à chaque nouvel import (remonte les formulaires)
  mois: string;
  lignes: Record<string, LigneBi>; // commercial → ligne lue
  valeurs: Record<string, Record<string, string>>; // commercial → brouillon du formulaire
  nonReconnus: Correspondance["nonReconnus"];
  enregistres: string[]; // commerciaux dont le brouillon a été enregistré
};

// Valeurs du formulaire : le chiffre lu, sinon celui déjà enregistré (on n'efface rien faute de lecture).
export function valeursFormulaire(lu: KpiDonnees, enregistre: KpiDonnees | undefined): Record<string, string> {
  return Object.fromEntries(
    KPI_FIELDS.map((f) => {
      const key = f.key as KpiKey;
      return [f.key, formatKpi(lu[key] ?? enregistre?.[key])];
    }),
  );
}
