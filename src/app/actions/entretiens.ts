"use server";

// Enregistrement automatique des entretiens 1:1 : une ligne par commercial et par mois.
// Pour un RM, la « personne » est un de ses TM : sa fiche va dans entretiens_tm (une ligne par RM, TM et mois).
import { getMyCommerciaux } from "@/lib/commerciaux";
import { normaliserEntretien } from "@/lib/entretien-contenu";
import { getCurrentManager, getCurrentUser, getMesTM } from "@/lib/managers";
import { isMonthLabel } from "@/lib/mois";
import { createClient } from "@/lib/supabase/server";

// `deconnecte` : la session a expiré, il faut se reconnecter pour enregistrer.
export type SaveEntretienResult = { ok: true } | { ok: false; error: string; deconnecte?: boolean };

export async function saveEntretien(commercialId: string, mois: string, contenu: unknown): Promise<SaveEntretienResult> {
  if (!(await getCurrentUser())) {
    return { ok: false, deconnecte: true, error: "Tu as été déconnecté : reconnecte-toi pour enregistrer ce 1:1." };
  }
  if (!isMonthLabel(mois)) return { ok: false, error: "Mois invalide." };

  const manager = await getCurrentManager();
  if (manager?.role === "RM") return saveEntretienTm(manager.id, commercialId, mois, contenu);

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

// Le 1:1 d'un RM avec l'un de SES TM (même contenu qu'une fiche commercial).
async function saveEntretienTm(rmId: string, tmId: string, mois: string, contenu: unknown): Promise<SaveEntretienResult> {
  if (!(await getMesTM()).some((t) => t.id === tmId)) return { ok: false, error: "Ce TM ne fait pas partie de tes TM." };

  const supabase = await createClient();
  const { error } = await supabase.from("entretiens_tm").upsert(
    {
      rm_id: rmId,
      tm_id: tmId,
      mois,
      contenu: normaliserEntretien(contenu),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "rm_id,tm_id,mois" },
  );
  if (error) return { ok: false, error: `Enregistrement du 1:1 impossible : ${error.message}` };
  return { ok: true };
}
