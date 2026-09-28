// Appel à Gemini « qui tient le coup » : réessais automatiques et modèles de secours en cascade.
// Utilisé uniquement côté serveur (la clé ne quitte jamais le serveur).
import "server-only";
import { ApiError, GoogleGenAI, type ContentListUnion } from "@google/genai";

// Dans l'ordre d'essai ; modifiable via GEMINI_MODELS dans .env.local (séparés par des virgules).
// Peu de modèles et peu de réessais : le quota gratuit limite le nombre d'appels par minute.
const MODELES_PAR_DEFAUT = ["gemini-3.7-flash", "gemini-2.0-flash"];
const PAUSES_MS = [2000, 5000]; // 2 réessais max par modèle (surcharge 503 uniquement)
const DELAI_APPEL_MS = 60_000; // un appel qui dépasse ce délai est abandonné (puis réessayé)
export const BUDGET_TOTAL_MS = 170_000; // au-delà, on arrête et on prévient l'utilisateur
const LISTE_VALIDE_MS = 10 * 60_000; // la liste des modèles disponibles est gardée 10 min

export type EchecGemini = "quota" | "indisponible" | "illisible" | "images" | "cle" | "aucun-modele";
export type ResultatGemini<T> = { ok: true; valeur: T; modele: string } | { ok: false; raison: EchecGemini };

export function modelesConfigures() {
  const liste = (process.env.GEMINI_MODELS ?? "")
    .split(",")
    .map((m) => m.trim().replace(/^models\//, ""))
    .filter(Boolean);
  return liste.length ? liste : MODELES_PAR_DEFAUT;
}

// ——— Modèles réellement disponibles pour la clé (API listModels) ———

let cacheModeles: { cle: string; noms: Set<string>; expire: number } | null = null;

// Renvoie null si Google ne répond pas : on tente alors tous les modèles configurés, sans filtrer.
async function modelesDisponibles(ai: GoogleGenAI, apiKey: string): Promise<Set<string> | null> {
  if (cacheModeles && cacheModeles.cle === apiKey && cacheModeles.expire > Date.now()) return cacheModeles.noms;
  try {
    const noms = new Set<string>();
    const pager = await ai.models.list({ config: { httpOptions: { timeout: 10_000 } } });
    for await (const m of pager) {
      if (!m.name) continue;
      if (m.supportedActions && !m.supportedActions.includes("generateContent")) continue;
      noms.add(m.name.replace(/^models\//, ""));
    }
    cacheModeles = { cle: apiKey, noms, expire: Date.now() + LISTE_VALIDE_MS };
    return noms;
  } catch (e) {
    console.warn("[gemini] Liste des modèles indisponible, on tente toute la liste :", e);
    return null;
  }
}

// Modèles qui ont répondu 404 (inexistants pour cette clé) : écartés jusqu'au redémarrage du serveur,
// pour ne plus perdre de temps dessus même si la liste de Google n'a pas pu être lue.
const modelesAbsents = new Map<string, Set<string>>(); // clé API → modèles écartés

function ecarterModele(apiKey: string, modele: string) {
  const absents = modelesAbsents.get(apiKey) ?? new Set<string>();
  absents.add(modele);
  modelesAbsents.set(apiKey, absents);
  cacheModeles?.noms.delete(modele);
  console.warn(`[gemini] ${modele} n'existe pas pour cette clé (404) : retiré de la liste.`);
}

// ——— Classement des erreurs ———

type TypeErreur = "passager" | "quota" | "modele" | "images" | "cle";

function classer(e: unknown): TypeErreur {
  if (e instanceof ApiError) {
    if (e.status === 429) return "quota"; // limite par minute : réessayer aggraverait, on change de modèle
    if (e.status === 401 || e.status === 403) return "cle";
    if (e.status === 404) return "modele"; // modèle inconnu ou retiré : on passe au suivant
    if (e.status === 400) return "images"; // requête refusée par ce modèle : on essaie le suivant
    return "passager"; // 408 délai, 500/502/503/504 surcharge…
  }
  return "passager"; // coupure réseau, délai dépassé…
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Envoie la requête au premier modèle disponible ; en cas de surcharge, réessaie puis passe au suivant.
// `lire` transforme la réponse texte en résultat (null = réponse inexploitable → modèle suivant).
export async function genererAvecSecours<T>(
  apiKey: string,
  contents: ContentListUnion,
  lire: (texte: string) => T | null,
): Promise<ResultatGemini<T>> {
  const debut = Date.now();
  const ai = new GoogleGenAI({ apiKey });

  const disponibles = await modelesDisponibles(ai, apiKey);
  const absents = modelesAbsents.get(apiKey);
  const modeles = modelesConfigures().filter((m) => (!disponibles || disponibles.has(m)) && !absents?.has(m));
  if (!modeles.length) return { ok: false, raison: "aucun-modele" };

  const echecs = new Set<EchecGemini>();

  for (const modele of modeles) {
    for (let essai = 0; essai <= PAUSES_MS.length; essai++) {
      const reste = BUDGET_TOTAL_MS - (Date.now() - debut);
      if (reste < 5_000) {
        console.warn("[gemini] Temps total dépassé, abandon.");
        return { ok: false, raison: "indisponible" };
      }

      try {
        const result = await ai.models.generateContent({
          model: modele,
          contents,
          config: {
            responseMimeType: "application/json",
            httpOptions: { timeout: Math.min(DELAI_APPEL_MS, reste) },
          },
        });
        const valeur = lire(result.text ?? "");
        if (valeur !== null) return { ok: true, valeur, modele };
        console.warn(`[gemini] ${modele} : réponse inexploitable`, (result.text ?? "").slice(0, 500));
        echecs.add("illisible");
        break; // un autre modèle lira peut-être mieux
      } catch (e) {
        const type = classer(e);
        console.warn(`[gemini] ${modele} essai ${essai + 1} : ${type}`, e instanceof ApiError ? e.status : e);
        if (type === "quota") echecs.add("quota");
        if (type === "cle") echecs.add("cle");
        if (type === "images") echecs.add("images");
        if (type === "modele") ecarterModele(apiKey, modele);
        if (type !== "passager") break; // réessayer le même modèle ne changerait rien (ou aggraverait)

        echecs.add("indisponible");
        if (essai === PAUSES_MS.length) break; // réessais épuisés : modèle suivant
        // Pause croissante (2 s puis 5 s) + un peu de hasard pour ne pas retomber pile dans le pic.
        await pause(PAUSES_MS[essai] + Math.random() * 300);
      }
    }
  }

  // Tous les modèles ont échoué : on garde la cause la plus probable.
  for (const raison of ["quota", "indisponible", "illisible", "images", "cle"] as const) {
    if (echecs.has(raison)) return { ok: false, raison };
  }
  return { ok: false, raison: "aucun-modele" };
}
