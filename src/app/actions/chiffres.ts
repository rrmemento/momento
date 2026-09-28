"use server";

// Enregistrement des chiffres mensuels et du budget d'un commercial.
import { refresh } from "next/cache";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { BUDGETS, KPI_FIELDS, parseKpi, type KpiDonnees, type KpiKey } from "@/lib/kpis";
import { getCurrentManager } from "@/lib/managers";
import { isMonthLabel } from "@/lib/mois";
import { createClient } from "@/lib/supabase/server";

export type SaveKpisResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

// Vérifie que le commercial fait bien partie de l'équipe du manager connecté.
async function isMyCommercial(commercialId: string) {
  const commerciaux = await getMyCommerciaux();
  return commerciaux.some((c) => c.id === commercialId);
}

// Texte du formulaire → chiffres. Même contrôle que dans le formulaire, refait ici : on ne fait jamais confiance au navigateur.
function lireValeurs(values: Record<string, string>): { donnees: KpiDonnees } | { fieldErrors: Record<string, string> } {
  const donnees: KpiDonnees = {};
  const fieldErrors: Record<string, string> = {};
  for (const field of KPI_FIELDS) {
    const parsed = parseKpi(field, values[field.key] ?? "");
    if ("error" in parsed) fieldErrors[field.key] = parsed.error;
    else donnees[field.key as KpiKey] = parsed.value;
  }
  return Object.keys(fieldErrors).length ? { fieldErrors } : { donnees };
}

// Enregistre les chiffres d'un mois pour un ou plusieurs commerciaux, en une seule écriture.
// On conserve les éventuelles autres données déjà présentes pour ce mois.
async function enregistrer(mois: string, fiches: { commercialId: string; donnees: KpiDonnees }[]) {
  const supabase = await createClient();
  const { data: existants, error: readError } = await supabase
    .from("kpis_mensuels")
    .select("commercial_id, donnees")
    .eq("mois", mois)
    .in(
      "commercial_id",
      fiches.map((f) => f.commercialId),
    );
  if (readError) return `Lecture impossible : ${readError.message}`;
  const avant = new Map(existants.map((row) => [String(row.commercial_id), row.donnees ?? {}]));

  const { error } = await supabase.from("kpis_mensuels").upsert(
    fiches.map((f) => ({ commercial_id: f.commercialId, mois, donnees: { ...avant.get(f.commercialId), ...f.donnees } })),
    { onConflict: "commercial_id,mois" },
  );
  return error ? `Enregistrement impossible : ${error.message}` : null;
}

export async function saveKpis(
  commercialId: string,
  mois: string,
  values: Record<string, string>,
): Promise<SaveKpisResult> {
  if (!isMonthLabel(mois)) return { ok: false, error: "Mois invalide." };
  if (!(await isMyCommercial(commercialId))) return { ok: false, error: "Ce commercial ne fait pas partie de ton équipe." };

  const lu = lireValeurs(values);
  if ("fieldErrors" in lu) return { ok: false, error: "Certains chiffres sont invalides.", fieldErrors: lu.fieldErrors };

  const error = await enregistrer(mois, [{ commercialId, donnees: lu.donnees }]);
  if (error) return { ok: false, error };

  refresh(); // recharge la page avec les chiffres à jour
  return { ok: true };
}

export type SaveGroupeResult =
  | { ok: true; enregistres: string[]; refuses: Record<string, string> } // refuses : commercial → raison
  | { ok: false; error: string };

// « Tout enregistrer » après un import BI : les fiches valides sont enregistrées ensemble,
// les autres sont renvoyées avec la raison, pour correction.
export async function saveKpisGroupe(
  mois: string,
  fiches: { commercialId: string; values: Record<string, string> }[],
): Promise<SaveGroupeResult> {
  if (!isMonthLabel(mois)) return { ok: false, error: "Mois invalide." };
  const equipe = new Set((await getMyCommerciaux()).map((c) => c.id));

  const valides: { commercialId: string; donnees: KpiDonnees }[] = [];
  const refuses: Record<string, string> = {};
  for (const f of fiches) {
    const lu = lireValeurs(f.values);
    if (!equipe.has(f.commercialId)) refuses[f.commercialId] = "Ne fait plus partie de ton équipe.";
    else if ("fieldErrors" in lu) refuses[f.commercialId] = "Certains chiffres sont invalides.";
    else valides.push({ commercialId: f.commercialId, donnees: lu.donnees });
  }
  if (!valides.length) return { ok: true, enregistres: [], refuses };

  const error = await enregistrer(mois, valides);
  if (error) return { ok: false, error };

  refresh();
  return { ok: true, enregistres: valides.map((v) => v.commercialId), refuses };
}

export async function setBudget(commercialId: string, budget: number): Promise<SaveKpisResult> {
  if (!BUDGETS.some((b) => b.value === budget)) return { ok: false, error: "Budget invalide." };
  const manager = await getCurrentManager();
  if (!manager) return { ok: false, error: "Compte non configuré." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commerciaux")
    .update({ budget })
    .eq("id", commercialId)
    .eq("manager_id", manager.id)
    .select("id");
  if (error) return { ok: false, error: `Enregistrement impossible : ${error.message}` };
  // Aucune ligne modifiée = pas le droit (RLS) ou commercial introuvable.
  if (!data.length) return { ok: false, error: "Ce commercial ne fait pas partie de ton équipe." };

  refresh();
  return { ok: true };
}
