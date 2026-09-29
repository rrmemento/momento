// « Analyser avec l'IA » (onglet Parcours) : Gemini relit tout le parcours d'un commercial
// et repère 2 à 3 signaux faibles. Le résultat est rangé dans le 1:1 du mois en cours (contenu.signauxIa).
import { formatKpi, KPI_FIELDS, type KpiDonnees, type KpiKey } from "./kpis";
import { rangMois } from "./mois";
import { engagementsDuParcours, moisDuParcours } from "./parcours";
import { libelleMoisParticulier, type MoisSpeciaux } from "./mois-special";
import type { SignalFaible } from "./parcours-analyse";
import type { StatutEngagement } from "./suivi";
import type { OneOnOne, SignauxIa } from "./types";

const TAILLE_MAX = 500;
const SIGNAUX_MAX = 3;

export type SignauxIaReponse = { ok: true; signauxIa: SignauxIa } | { ok: false; error: string; reessayable?: boolean };

const texte = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, TAILLE_MAX) : "");

// jsonb lu en base (ou envoyé par le navigateur) → analyse valide, ou null.
export function normaliserSignauxIa(raw: unknown): SignauxIa | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const signaux = Array.isArray(o.signaux)
    ? o.signaux
        .map((s) => {
          const x = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
          return { titre: texte(x.titre), constat: texte(x.constat), action: texte(x.action) };
        })
        .filter((s) => s.titre && s.constat && s.action)
        .slice(0, SIGNAUX_MAX)
    : [];
  const genereLe = typeof o.genereLe === "string" && !Number.isNaN(Date.parse(o.genereLe)) ? o.genereLe : "";
  return signaux.length && genereLe ? { signaux, genereLe } : null;
}

// Réponse texte de Gemini → analyse, ou null si elle est inexploitable (on passe alors au modèle suivant).
export function lireReponseSignaux(reponse: string, genereLe: string): SignauxIa | null {
  const json = reponse.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return normaliserSignauxIa({ ...JSON.parse(json), genereLe });
  } catch {
    return null;
  }
}

// ——— Le prompt ———

const UNITES = { "%": " %", j: " j", "€": " €" } as const;
const court = (t: string, n = 220) => (t.length > n ? `${t.slice(0, n)}…` : t);

const STATUTS: Record<StatutEngagement, string> = {
  tenu: "TENU",
  non_tenu: "NON TENU",
  en_cours: "en cours",
  manquant: "chiffre pas encore saisi",
  a_juger: "pas encore jugé",
};

function ligneChiffres(d: KpiDonnees | undefined) {
  if (!d) return "(pas de chiffres)";
  const parts = KPI_FIELDS.flatMap((fld) => {
    const v = d[fld.key as KpiKey];
    return v == null ? [] : [`${fld.label} ${formatKpi(v)}${fld.unit ? UNITES[fld.unit] : ""}`];
  });
  return parts.length ? parts.join(", ") : "(pas de chiffres)";
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

export function promptSignaux({
  nom,
  niveau,
  budget,
  moisEnCours,
  historique,
  entretiens,
  repId,
  signauxRegles,
  speciaux = {},
}: {
  nom: string;
  niveau: string;
  budget: number;
  moisEnCours: string;
  historique: Record<string, Record<string, KpiDonnees>>;
  entretiens: Record<string, Record<string, OneOnOne>>;
  repId: string;
  signauxRegles: SignalFaible[];
  speciaux?: MoisSpeciaux;
}) {
  const prenom = nom.split(" ")[0];
  const mois = moisDuParcours(historique, repId);
  // Un mois particulier (congés…) est signalé avec son objectif ajusté : ses volumes ne se comparent pas aux autres.
  const note = (m: string) => {
    const s = speciaux[m]?.[repId];
    return [
      m === moisEnCours && "mois en cours, pas terminé",
      s && `${libelleMoisParticulier(s).toUpperCase()}, objectif ajusté à ${s.objectif}`,
    ].filter(Boolean);
  };
  const chiffres = mois.map((m) => {
    const n = note(m);
    return `- ${m}${n.length ? ` (${n.join(" ; ")})` : ""} : ${ligneChiffres(historique[m]?.[repId])}`;
  });
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

  return `Tu es un directeur commercial expérimenté. Tu relis TOUT le parcours de ${nom}, un(e) commercial(e) de niveau ${niveau} (budget mensuel : ${budget} ventes et ${budget} installations), pour aider son manager à repérer les SIGNAUX FAIBLES : ce qui mérite son attention avant que ça devienne un problème. Tu écris AU MANAGER (tutoiement), en français, court, concret, bienveillant et direct. Pas de blabla.

SES CHIFFRES, MOIS PAR MOIS
${chiffres.join("\n") || "- (aucun chiffre)"}

SES 1:1 (ressenti, auto-note, blocages, besoins)
${unUn.join("\n") || "- (aucun 1:1 renseigné)"}

SES ENGAGEMENTS ET LEUR RÉSULTAT
${engagements.join("\n") || "- (aucun engagement)"}

SIGNAUX DÉJÀ REPÉRÉS PAR LES RÈGLES MOMENTO
${signauxRegles.map((s) => `- ${s.titre} : ${s.detail}`).join("\n") || "- (aucun)"}

RÈGLES MOMENTO (à respecter strictement)
1. Le volume (ventes, installations) passe avant tout. Si le volume est au rendez-vous, un POS ou un indicateur secondaire un peu faible n'est pas un signal prioritaire.
2. L'exigence POS (4 par mois minimum) ne concerne que les M3+. Ne parle jamais de POS insuffisant pour un M1 ou un M2.
3. Pas d'alarmisme : un signal faible est une tendance ou un décalage à surveiller, pas une faute. Réserve le ton d'alerte aux situations vraiment critiques.
4. Le mois en cours n'est pas terminé : ne juge pas ses volumes (ventes, installations, POS, OG) comme s'ils étaient définitifs. Un MOIS PARTICULIER (congés, arrêt, ramp-up) a un objectif ajusté : juge-le sur cet objectif, et n'interprète pas sa baisse de volume comme un signal.
5. N'utilise QUE les faits fournis. N'invente aucun chiffre, aucune cause, aucun événement.
6. Cherche surtout ce que les règles ne voient pas : un décalage entre le ressenti et les chiffres, un blocage qui revient d'un 1:1 à l'autre, un engagement qui revient sans jamais être tenu, une énergie qui baisse, un besoin exprimé resté sans réponse. Ne te contente pas de répéter les signaux des règles.

CE QUE TU DOIS PRODUIRE
2 à 3 signaux faibles, du plus important au moins important. S'il y a vraiment très peu de données, 1 seul suffit. Pour chacun :
- "titre" : le signal en quelques mots (moins de 60 caractères).
- "constat" : ce que tu vois, 1 à 2 phrases, avec les faits à l'appui.
- "action" : ce que le manager pourrait faire concrètement au prochain 1:1 avec ${prenom} (1 phrase).

Chaque texte fait au plus 300 caractères. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"signaux": [{"titre": "…", "constat": "…", "action": "…"}]}`;
}
