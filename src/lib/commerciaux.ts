// Accès côté serveur aux commerciaux du manager connecté (table « commerciaux »).
import "server-only";
import { cache } from "react";
import { getCurrentManager } from "@/lib/managers";
import { createClient } from "@/lib/supabase/server";

export type Commercial = {
  id: string;
  nom: string;
  seniorite: string | null;
  budget: number; // objectif ventes ET installs (5 = M1, 10 = M2, 15 = M3+)
};

// Les commerciaux actifs du manager connecté, triés par nom ([] s'il n'a pas de fiche manager).
export const getMyCommerciaux = cache(async (): Promise<Commercial[]> => {
  const manager = await getCurrentManager();
  if (!manager) return [];

  const supabase = await createClient();
  // Le filtre manager_id s'ajoute à la RLS : même si une règle était trop large, on ne lit que son équipe.
  const { data, error } = await supabase
    .from("commerciaux")
    .select("id, nom, seniorite, budget")
    .eq("manager_id", manager.id)
    .eq("actif", true)
    .order("nom");

  if (error) throw new Error(`Lecture des commerciaux impossible : ${error.message}`);
  return data.map((c) => ({
    id: String(c.id),
    nom: c.nom,
    seniorite: c.seniorite == null ? null : String(c.seniorite),
    budget: Number(c.budget),
  }));
});
