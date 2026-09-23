// Lecture côté serveur des chiffres du mois (table « kpis_mensuels »).
import "server-only";
import { cache } from "react";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { cleanDonnees, type KpiDonnees } from "@/lib/kpis";
import { createClient } from "@/lib/supabase/server";

// Les KPIs du mois pour les commerciaux du manager connecté : { idCommercial: donnees }.
export const getKpisDuMois = cache(async (mois: string): Promise<Record<string, KpiDonnees>> => {
  const commerciaux = await getMyCommerciaux();
  if (commerciaux.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kpis_mensuels")
    .select("commercial_id, donnees")
    .eq("mois", mois)
    .in(
      "commercial_id",
      commerciaux.map((c) => c.id),
    );

  if (error) throw new Error(`Lecture des chiffres du mois impossible : ${error.message}`);
  return Object.fromEntries(data.map((row) => [String(row.commercial_id), cleanDonnees(row.donnees)]));
});
