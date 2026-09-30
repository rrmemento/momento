// Accès côté serveur aux commerciaux du manager connecté (table « commerciaux »).
import "server-only";
import { cache } from "react";
import { getCurrentManager } from "@/lib/managers";
import { isMonthLabel } from "@/lib/mois";
import { createClient } from "@/lib/supabase/server";

export type Commercial = {
  id: string;
  nom: string;
  seniorite: string | null;
  budget: number; // objectif ventes ET installs (5 = M1, 10 = M2, 15 = M3+)
  // Mois de démarrage (« Avril 2025 ») : avec `seniorite` (niveau à ce moment-là), il fixe le niveau de chaque mois.
  // null = non renseigné (ou colonne pas encore créée en base) → le budget de la fiche s'applique.
  demarrage: string | null;
};

// Les commerciaux actifs des managers donnés, triés par nom, avec le manager de chacun.
// Le filtre manager_id s'ajoute à la RLS : même si une règle était trop large, on ne lit que ces équipes.
async function lireCommerciaux(managerIds: string[]): Promise<(Commercial & { managerId: string })[]> {
  if (managerIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commerciaux")
    .select("*") // « * » : l'app marche même si la colonne demarrage n'a pas encore été ajoutée en base
    .in("manager_id", managerIds)
    .eq("actif", true)
    .order("nom");

  if (error) throw new Error(`Lecture des commerciaux impossible : ${error.message}`);
  return data.map((c) => ({
    id: String(c.id),
    nom: c.nom,
    seniorite: c.seniorite == null ? null : String(c.seniorite),
    budget: Number(c.budget),
    demarrage: typeof c.demarrage === "string" && isMonthLabel(c.demarrage) ? c.demarrage : null,
    managerId: String(c.manager_id),
  }));
}

// Les commerciaux actifs du manager connecté, triés par nom ([] s'il n'a pas de fiche manager).
export const getMyCommerciaux = cache(async (): Promise<Commercial[]> => {
  const manager = await getCurrentManager();
  if (!manager) return [];
  return (await lireCommerciaux([manager.id])).map((c) => ({
    id: c.id,
    nom: c.nom,
    seniorite: c.seniorite,
    budget: c.budget,
    demarrage: c.demarrage,
  }));
});

// Vue RM : les commerciaux actifs des TM donnés (lecture seule ; la RLS ne laisse passer que les TM du RM).
export const getCommerciauxDesTM = cache(lireCommerciaux);

// Vue RM : les commerciaux PARTIS (actif = false) des TM donnés, pour ne jamais les recréer depuis le BI.
export async function getPartisDesTM(managerIds: string[]): Promise<{ id: string; nom: string; managerId: string }[]> {
  if (managerIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commerciaux")
    .select("id, nom, manager_id")
    .in("manager_id", managerIds)
    .eq("actif", false);
  if (error) throw new Error(`Lecture des commerciaux partis impossible : ${error.message}`);
  return data.map((c) => ({ id: String(c.id), nom: c.nom, managerId: String(c.manager_id) }));
}
