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

export async function saveKpis(
  commercialId: string,
  mois: string,
  values: Record<string, string>,
): Promise<SaveKpisResult> {
  if (!isMonthLabel(mois)) return { ok: false, error: "Mois invalide." };
  if (!(await isMyCommercial(commercialId))) return { ok: false, error: "Ce commercial ne fait pas partie de ton équipe." };

  // Même contrôle que dans le formulaire, refait ici : on ne fait jamais confiance au navigateur.
  const donnees: KpiDonnees = {};
  const fieldErrors: Record<string, string> = {};
  for (const field of KPI_FIELDS) {
    const parsed = parseKpi(field, values[field.key] ?? "");
    if ("error" in parsed) fieldErrors[field.key] = parsed.error;
    else donnees[field.key as KpiKey] = parsed.value;
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: "Certains chiffres sont invalides.", fieldErrors };
  }

  const supabase = await createClient();

  // On conserve les éventuelles autres données déjà présentes (ex. un futur import BI).
  const { data: existing, error: readError } = await supabase
    .from("kpis_mensuels")
    .select("donnees")
    .eq("commercial_id", commercialId)
    .eq("mois", mois)
    .maybeSingle();
  if (readError) return { ok: false, error: `Lecture impossible : ${readError.message}` };

  const { error } = await supabase
    .from("kpis_mensuels")
    .upsert(
      { commercial_id: commercialId, mois, donnees: { ...(existing?.donnees ?? {}), ...donnees } },
      { onConflict: "commercial_id,mois" },
    );
  if (error) return { ok: false, error: `Enregistrement impossible : ${error.message}` };

  refresh(); // recharge la page avec les chiffres à jour
  return { ok: true };
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
