"use server";

// Enregistrement automatique des entretiens 1:1 : une ligne par commercial et par mois.
import { getMyCommerciaux } from "@/lib/commerciaux";
import { normaliserEntretien } from "@/lib/entretien-contenu";
import { getCurrentUser } from "@/lib/managers";
import { isMonthLabel } from "@/lib/mois";
import { createClient } from "@/lib/supabase/server";

// `deconnecte` : la session a expiré, il faut se reconnecter pour enregistrer.
export type SaveEntretienResult = { ok: true } | { ok: false; error: string; deconnecte?: boolean };

export async function saveEntretien(commercialId: string, mois: string, contenu: unknown): Promise<SaveEntretienResult> {
  if (!(await getCurrentUser())) {
    return { ok: false, deconnecte: true, error: "Tu as été déconnecté : reconnecte-toi pour enregistrer ce 1:1." };
  }
  if (!isMonthLabel(mois)) return { ok: false, error: "Mois invalide." };
  if (!(await getMyCommerciaux()).some((c) => c.id === commercialId)) {
    return { ok: false, error: "Ce commercial ne fait pas partie de ton équipe." };
  }

  // Pas de refresh() ici : la fiche affichée est déjà à jour, inutile de recharger toute la page à chaque frappe.
  const supabase = await createClient();
  const { error } = await supabase.from("entretiens").upsert(
    {
      commercial_id: commercialId,
      mois,
      contenu: normaliserEntretien(contenu), // on ne fait jamais confiance au navigateur
      updated_at: new Date().toISOString(),
    },
    { onConflict: "commercial_id,mois" },
  );
  if (error) return { ok: false, error: `Enregistrement du 1:1 impossible : ${error.message}` };
  return { ok: true };
}
