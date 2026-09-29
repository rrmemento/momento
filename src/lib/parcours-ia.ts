// Le diagnostic de parcours (onglet Parcours) : Gemini relit tout l'historique d'un commercial et rend un verdict
// (profil + trajectoire + priorité). Le résultat est rangé dans le 1:1 du mois en cours (contenu.diagnosticIa).
import { formatKpi, KPI_FIELDS, type KpiDonnees, type KpiKey } from "./kpis";
import { rangMois } from "./mois";
import { libelleMoisParticulier, type MoisSpeciaux } from "./mois-special";
import { objectifsDuCommercial, type NiveauxMois } from "./niveau-mois";
import { engagementsDuParcours, moisDuParcours, moisSaisi, valeurDuMois } from "./parcours";
import type { CoupDEclat, SignalFaible } from "./parcours-analyse";
import type { StatutEngagement } from "./suivi";
import type { DiagnosticIa, OneOnOne, ProfilParcours } from "./types";

type Historique = Record<string, Record<string, KpiDonnees>>;
type Entretiens = Record<string, Record<string, OneOnOne>>;

// ——— Les profils ———

export const PROFILS: Record<ProfilParcours, { label: string; icone: string }> = {
  valeur_sure: { label: "Valeur sûre", icone: "★" },
  progression: { label: "En progression", icone: "↗" },
  risque: { label: "À risque", icone: "!" },
  irregulier: { label: "Irrégulier", icone: "≈" },
  rampup: { label: "En ramp-up / démarrage", icone: "◔" },
  repli: { label: "En repli", icone: "↘" },
};

const PROFIL_CLES = Object.keys(PROFILS) as ProfilParcours[];

// Moins de 3 mois de chiffres (ventes et installations saisies) : pas assez de recul pour un profil honnête.
export const RECUL_MIN = 3;
export function moisAvecChiffres(historique: Historique, repId: string) {
  return moisDuParcours(historique, repId).filter((m) => moisSaisi(historique[m]?.[repId]));
}

// ——— Lecture et validation ———

export type DiagnosticReponse = { ok: true; diagnostic: DiagnosticIa } | { ok: false; error: string; reessayable?: boolean };

const TAILLE_MAX = 500;
const texte = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, TAILLE_MAX) : "");
const liste = (v: unknown, max: number) => (Array.isArray(v) ? v.map(texte).filter(Boolean).slice(0, max) : []);

// jsonb lu en base (ou envoyé par le navigateur) → diagnostic valide, ou null.
export function normaliserDiagnostic(raw: unknown): DiagnosticIa | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const traj = (o.trajectoire ?? {}) as Record<string, unknown>;
  const prio = (o.priorite ?? {}) as Record<string, unknown>;
  const sens = traj.sens === "progresse" || traj.sens === "stagne" || traj.sens === "decroche" ? traj.sens : null;
  const profil = PROFIL_CLES.find((p) => p === o.profil);
  const phrase = texte(o.phrase);
  const trajTexte = texte(traj.texte);
  const priorite = { texte: texte(prio.texte), action: texte(prio.action) };
  const genereLe = typeof o.genereLe === "string" && !Number.isNaN(Date.parse(o.genereLe)) ? o.genereLe : "";
  if (!profil || !phrase || !sens || !trajTexte || !priorite.texte || !priorite.action || !genereLe) return null;
  return {
    profil,
    phrase,
    trajectoire: { sens, texte: trajTexte },
    monte: liste(o.monte, 3),
    coince: liste(o.coince, 3),
    priorite,
    reussites: liste(o.reussites, 3),
    genereLe,
  };
}

// Réponse texte de Gemini → diagnostic, ou null si elle est inexploitable (on passe alors au modèle suivant).
export function lireReponseDiagnostic(reponse: string, genereLe: string): DiagnosticIa | null {
  const json = reponse.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return normaliserDiagnostic({ ...JSON.parse(json), genereLe });
  } catch {
    return null;
  }
}

// ——— Le prompt ———

const UNITES = { "%": " %", j: " j", "€": " €" } as const;
const court = (t: string, n = 220) => (t.length > n ? `${t.slice(0, n)}…` : t);
const pct = (v: number, o: number) => (o ? `${Math.round((v / o) * 100)} %` : "—");

const STATUTS: Record<StatutEngagement, string> = {
  tenu: "TENU",
  non_tenu: "NON TENU",
  en_cours: "en cours",
  manquant: "chiffre pas encore saisi",
  a_juger: "pas encore jugé",
};

// Un mois : l'atteinte des objectifs (sur l'objectif AJUSTÉ si mois particulier), puis les autres chiffres.
function ligneMois(
  m: string,
  d: KpiDonnees | undefined,
  duMois: ReturnType<typeof objectifsDuCommercial>,
  speciaux: MoisSpeciaux,
  repId: string,
  enCours: boolean,
) {
  const s = speciaux[m]?.[repId];
  const { niveau, objectif: obj } = duMois(m);
  const notes = [
    niveau ? `${niveau.seniorite}, objectif ${niveau.budget}` : `objectif ${duMois(m).budget} (budget de la fiche)`,
    enCours && "mois en cours, pas terminé",
    s && `${libelleMoisParticulier(s).toUpperCase()}, objectif ajusté à ${obj}`,
  ]
    .filter(Boolean)
    .join(" ; ");
  const titre = `- ${m}${notes ? ` (${notes})` : ""}`;
  if (!moisSaisi(d)) return `${titre} : pas de chiffres`;
  const ventes = valeurDuMois(d, "ventes") ?? 0; // mois saisi : case vide = 0
  const installs = valeurDuMois(d, "install") ?? 0;
  const atteinte = `ventes ${ventes}/${obj} (${pct(ventes, obj)}), installations ${installs}/${obj} (${pct(installs, obj)})`;
  const autres = KPI_FIELDS.filter((f) => f.key !== "ventes" && f.key !== "install").flatMap((f) => {
    const v = valeurDuMois(d, f.key as KpiKey); // compte vide dans un mois saisi = 0
    return v == null ? [] : [`${f.label} ${formatKpi(v)}${f.unit ? UNITES[f.unit] : ""}`];
  });
  return `${titre} : ${atteinte}${autres.length ? ` · ${autres.join(", ")}` : ""}`;
}

function ligne1on1(mois: string, fiche: OneOnOne) {
  const parts = [
    fiche.note > 0 && `auto-note ${fiche.note}/10`,
    fiche.ressenti.trim() && `ressenti : ${court(fiche.ressenti.trim())}`,
    fiche.fier.trim() && `fier de : ${court(fiche.fier.trim())}`,
    fiche.bloque.trim() && `bloqué par : ${court(fiche.bloque.trim())}`,
    fiche.besoin.trim() && `besoin : ${court(fiche.besoin.trim())}`,
  ].filter(Boolean);
  return parts.length ? `- 1:1 de ${mois} : ${parts.join(" · ")}` : null;
}

export function promptDiagnostic({
  nom,
  niveau,
  budget,
  budgetFiche,
  moisEnCours,
  historique,
  entretiens,
  speciaux,
  niveaux = {},
  repId,
  signauxRegles,
  eclats,
}: {
  nom: string;
  niveau: string;
  budget: number; // budget ACTUEL (mois le plus récent)
  budgetFiche?: number; // budget de la fiche : secours pour les mois sans séniorité connue
  moisEnCours: string;
  historique: Historique;
  entretiens: Entretiens;
  speciaux: MoisSpeciaux;
  niveaux?: NiveauxMois; // séniorité et budget de chaque mois
  repId: string;
  signauxRegles: SignalFaible[];
  eclats: CoupDEclat[];
}) {
  const prenom = nom.split(" ")[0];
  const mois = moisDuParcours(historique, repId);
  const duMois = objectifsDuCommercial(repId, budgetFiche ?? budget, niveaux, speciaux);
  const chiffres = mois.map((m) => ligneMois(m, historique[m]?.[repId], duMois, speciaux, repId, m === moisEnCours));
  const unUn = Object.keys(entretiens)
    .filter((m) => entretiens[m][repId])
    .sort((a, b) => (rangMois(a) ?? 0) - (rangMois(b) ?? 0))
    .flatMap((m) => ligne1on1(m, entretiens[m][repId]) ?? []);
  const engagements = engagementsDuParcours(repId, historique, entretiens)
    .reverse()
    .flatMap((m) =>
      m.liste.map(
        (e) =>
          `- 1:1 de ${m.mois} : « ${e.titre} »${e.cible ? ` (cible ${e.cible}${e.reel ? `, réalisé ${e.reel}` : ""})` : ""} → ${STATUTS[e.statut]}`,
      ),
    );

  return `Tu es un directeur commercial expérimenté. Tu établis le DIAGNOSTIC DE PARCOURS de ${nom}, commercial(e) de niveau ${niveau} (budget actuel : ${budget} ventes et ${budget} installations par mois ; il a pu être différent les mois passés, voir chaque mois). Le manager veut un VERDICT sur la personne dans le temps, pour savoir s'il doit s'inquiéter, la pousser ou la récompenser. Pas une répétition des chiffres. Tu écris AU MANAGER (tutoiement), en français, court, concret, bienveillant et direct.

SES MOIS (séniorité et objectif DE CHAQUE MOIS : M1 → 5, M2 → 10, M3+ → 15 ; ajusté pour les mois particuliers)
${chiffres.join("\n")}

SES 1:1 (ressenti, auto-note, blocages, besoins)
${unUn.join("\n") || "- (aucun 1:1 renseigné)"}

SES ENGAGEMENTS ET LEUR RÉSULTAT
${engagements.join("\n") || "- (aucun engagement)"}

SES COUPS D'ÉCLAT (calculés)
${eclats.map((e) => `- ${e.titre} (${e.detail})`).join("\n") || "- (aucun)"}

SIGNAUX FAIBLES REPÉRÉS PAR LES RÈGLES MOMENTO (à intégrer à ton diagnostic)
${signauxRegles.map((s) => `- ${s.titre} : ${s.detail}`).join("\n") || "- (aucun)"}

RÈGLES MOMENTO (à respecter strictement)
1. Le volume (ventes, installations, jugés sur l'objectif DU MOIS, qui suit sa séniorité de ce mois-là) passe avant tout. Un commercial qui passe de M1 à M2 puis M3+ voit son objectif monter : juge sa progression dans ce contexte. Un POS ou un indicateur secondaire un peu faible ne fait pas basculer un profil si le volume est là.
2. L'exigence POS (4 par mois minimum) ne concerne que les M3+. Jamais de reproche POS à un M1 ou un M2.
3. MOIS PARTICULIER (congés, arrêt, ramp-up) : juge-le sur son objectif AJUSTÉ ; les cibles de volume (POS vendus, ventes OG) suivent le même prorata (ex. objectif divisé par 2 → 2 POS au lieu de 4). Les pourcentages ne changent pas. Ne pénalise jamais la baisse de volume d'un mois de congés ou d'arrêt, et ne la compte pas comme un repli.
4. Le mois en cours n'est pas terminé : ne juge pas ses volumes comme définitifs.
5. Délai moyen d'installation (vente → pose) : cible moins de 7 jours ; de 7 à 12 jours, à améliorer ; au-delà de 12 jours, critique.
6. Le ton d'alerte est réservé aux situations vraiment critiques. N'invente aucun chiffre, aucune cause, aucun événement : uniquement les faits ci-dessus.

LES PROFILS (choisis-en UN, le plus juste)
- "valeur_sure" : régulier et fiable, atteint ou dépasse ses objectifs la plupart des mois.
- "progression" : tendance nette à l'amélioration sur ce qui compte.
- "risque" : décroche sur le volume de façon durable, ou plusieurs signaux graves qui s'accumulent.
- "irregulier" : alterne bons et mauvais mois sans tendance claire.
- "rampup" : en phase de démarrage (M1, ou mois marqués ramp-up), à juger sur sa courbe d'apprentissage.
- "repli" : était bon, baisse depuis quelques mois sans être encore critique.

CE QUE TU DOIS PRODUIRE (JSON)
- "profil" : une des clés ci-dessus.
- "phrase" : le profil expliqué en UNE phrase de manager, avec un fait à l'appui (ex. « Régulier et fiable, dépasse ses objectifs 3 mois sur 4 »).
- "trajectoire" : {"sens": "progresse" | "stagne" | "decroche", "texte": 1 phrase sur ce qui compte vraiment}.
- "monte" et "coince" : ce qui monte et ce qui coince, 2 à 3 points AU TOTAL entre les deux listes (une liste peut être vide), une phrase courte chacun.
- "priorite" : {"texte": ce qui mérite l'attention du manager en premier (1 phrase), "action": une action concrète à mener avec ${prenom} (1 phrase)}.
- "reussites" : 1 à 3 points forts ou réussites marquantes dans le temps.

Chaque texte fait au plus 250 caractères. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"profil": "…", "phrase": "…", "trajectoire": {"sens": "…", "texte": "…"}, "monte": ["…"], "coince": ["…"], "priorite": {"texte": "…", "action": "…"}, "reussites": ["…"]}`;
}
