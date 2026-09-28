// Lecture côté serveur des entretiens 1:1 (table « entretiens »).
import "server-only";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { normaliserEntretien } from "@/lib/entretien-contenu";
import { createClient } from "@/lib/supabase/server";
import type { OneOnOne } from "@/lib/types";

// Les entretiens des mois demandés, pour l'équipe du manager connecté : { mois: { idCommercial: fiche } }.
export async function getEntretiens(mois: string[]): Promise<Record<string, Record<string, OneOnOne>>> {
  const parMois: Record<string, Record<string, OneOnOne>> = Object.fromEntries(mois.map((m) => [m, {}]));
  const commerciaux = await getMyCommerciaux();
  if (commerciaux.length === 0) return parMois;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entretiens")
    .select("commercial_id, mois, contenu")
    .in("mois", mois)
    .in(
      "commercial_id",
      commerciaux.map((c) => c.id),
    );

  if (error) throw new Error(`Lecture des entretiens 1:1 impossible : ${error.message}`);
  for (const row of data) parMois[row.mois][String(row.commercial_id)] = normaliserEntretien(row.contenu);
  return parMois;
}
