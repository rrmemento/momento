"use server";

// Enregistrement de l'import du BI RM (fonction Supabase remplacer_bi_rm) : ADDITIF — remplace seulement les équipes (TM)
// contenues dans ce nouvel import, en une fois ; les autres équipes du même mois sont gardées. Table séparée : les chiffres
// que les TM saisissent ne sont jamais touchés.
import { refresh } from "next/cache";
import { getCommerciauxDesTM } from "@/lib/commerciaux";
import { reconnaitreAvecLaBase } from "@/lib/bi-rm";
import { type LigneBiRm, type LigneReconnue, NIVEAUX_SALES, nettoyerDonnees } from "@/lib/lecture-bi-rm";
import { getCurrentManager, getMesTM } from "@/lib/managers";
import { isMonthLabel } from "@/lib/mois";
import { createClient } from "@/lib/supabase/server";

export type SaveBiRmResult = { ok: true; nb: number } | { ok: false; error: string };

export async function saveBiRm(mois: string, lignes: LigneReconnue[]): Promise<SaveBiRmResult> {
  const manager = await getCurrentManager();
  if (manager?.role !== "RM") return { ok: false, error: "Import réservé aux RM." };
  if (!isMonthLabel(mois)) return { ok: false, error: "Mois invalide." };

  // On ne fait jamais confiance au navigateur : TM et sales revérifiés, chiffres nettoyés.
  const tms = new Set((await getMesTM()).map((t) => t.id));
  const equipeDe = new Map<string, string>(); // commercial → son TM
  for (const c of await getCommerciauxDesTM([...tms])) equipeDe.set(c.id, c.managerId);

  const aEnregistrer = lignes
    // Enregistrées : Région, TM et sales reconnus, et sales « à créer » non créés sous un TM connu (sans rattachement).
    // Jamais : un TM non créé (ni ses sales), un sales parti, une ligne inexploitable.
    .filter((l) => l.etat === "ok" || (l.etat === "a_creer" && l.niveau === "sales" && l.tmId != null))
    .map((l) => {
      const region = l.niveau === "region";
      const tmId = region ? null : l.tmId;
      const commercialId = l.niveau === "sales" && l.commercialId && equipeDe.get(l.commercialId) === tmId ? l.commercialId : null;
      return {
        rang: Math.trunc(Number(l.rang)),
        niveau: l.niveau,
        tm_id: tmId,
        commercial_id: commercialId,
        nom: String(l.nom ?? "").slice(0, 120),
        donnees: nettoyerDonnees(l.donnees),
      };
    });
  if (aEnregistrer.some((l) => !["region", "tm", "sales"].includes(l.niveau) || !Number.isFinite(l.rang))) {
    return { ok: false, error: "Import invalide : recharge les captures." };
  }
  if (aEnregistrer.some((l) => l.niveau !== "region" && (!l.tm_id || !tms.has(l.tm_id)))) {
    return { ok: false, error: "Une ligne est rattachée à un TM qui n'est pas le tien : recharge les captures." };
  }
  if (!aEnregistrer.some((l) => l.niveau === "tm")) {
    return { ok: false, error: "Aucun de tes TM n'a été reconnu : rien à enregistrer." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remplacer_bi_rm", { p_mois: mois, p_lignes: aEnregistrer });
  if (error) return { ok: false, error: `Enregistrement impossible : ${error.message}` };
  refresh(); // la page relit le BI : statuts et fiches des TM à jour
  return { ok: true, nb: typeof data === "number" ? data : aEnregistrer.length };
}

// ——— Création des TM et sales confirmés par le RM (fonction Supabase creer_equipes_bi_rm) ———

// Ce que le RM confirme : un TM (existant ou à créer) et les sales à créer sous lui, avec niveau et budget choisis.
export type EquipeACreer = {
  tmId: string | null; // null = TM à créer
  tmNom: string;
  region: string | null; // la ligne Région du BI, reprise comme « équipe » d'un nouveau TM
  sales: { nom: string; seniorite: string; budget: number; demarrage?: string | null }[]; // démarrage proposé (M1 / M2)
};

export type BilanCreation = {
  tmCrees: string[];
  tmExistants: number;
  salesCrees: string[];
  salesExistants: number;
  signales: string[];
};

export type CreerEquipesResult = { ok: true; bilan: BilanCreation } | { ok: false; error: string };

const texteCourt = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const listeTextes = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function creerEquipesBiRm(equipes: EquipeACreer[]): Promise<CreerEquipesResult> {
  const manager = await getCurrentManager();
  if (manager?.role !== "RM") return { ok: false, error: "Réservé aux RM." };

  // On ne fait jamais confiance au navigateur : niveaux et budgets revérifiés (la fonction Supabase revérifie aussi
  // les TM, les sales et les doublons).
  const payload = (Array.isArray(equipes) ? equipes : []).flatMap((e) => {
    const tmNom = texteCourt(e?.tmNom);
    if (!tmNom) return [];
    const sales = (Array.isArray(e.sales) ? e.sales : []).flatMap((s) => {
      const nom = texteCourt(s?.nom);
      const niveau = NIVEAUX_SALES.find((n) => n.seniorite === s?.seniorite && n.budget === s?.budget);
      const demarrage = typeof s?.demarrage === "string" && isMonthLabel(s.demarrage) ? s.demarrage : null;
      return nom && niveau ? [{ commercial_id: null, nom, seniorite: niveau.seniorite, budget: niveau.budget, demarrage }] : [];
    });
    return [{ tm_id: typeof e.tmId === "string" && e.tmId ? e.tmId : null, tm_nom: tmNom, region: texteCourt(e.region) || null, sales }];
  });
  if (!payload.some((e) => !e.tm_id || e.sales.length)) return { ok: false, error: "Rien à créer." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creer_equipes_bi_rm", { p_equipes: payload });
  if (error) return { ok: false, error: `Création impossible : ${error.message}` };

  const b = (data ?? {}) as Record<string, unknown>;
  refresh(); // tes nouveaux TM apparaissent dans l'app (onglet Équipe…)
  return {
    ok: true,
    bilan: {
      tmCrees: listeTextes(b.tm_crees),
      tmExistants: Number(b.tm_existants) || 0,
      salesCrees: listeTextes(b.sales_crees),
      salesExistants: Number(b.sales_existants) || 0,
      signales: listeTextes(b.signales),
    },
  };
}

// Reconnaît de nouveau les lignes lues (sans relire les captures), avec les fiches qui viennent d'être créées.
export async function reconnaitreBiRm(lignes: LigneBiRm[]): Promise<LigneReconnue[] | null> {
  const manager = await getCurrentManager();
  if (manager?.role !== "RM" || !Array.isArray(lignes)) return null;
  const propres: LigneBiRm[] = lignes.map((l, i) => ({
    rang: Number.isFinite(Number(l?.rang)) ? Math.trunc(Number(l.rang)) : i + 1,
    nom: texteCourt(l?.nom),
    niveau: l?.niveau === "region" || l?.niveau === "tm" ? l.niveau : "sales",
    donnees: nettoyerDonnees(l?.donnees),
  }));
  return reconnaitreAvecLaBase(propres);
}
