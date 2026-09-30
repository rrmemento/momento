"use server";

// Vue RM : gérer SES TM (fonctions Supabase rm_modifier_tm / rm_retirer_tm, qui vérifient que le TM est bien à lui).
// La date de début d'un TM est informative : un TM ne monte pas en séniorité, ses objectifs ne changent jamais.
import { refresh } from "next/cache";
import { getCurrentManager } from "@/lib/managers";
import { currentMonthLabel, isMonthLabel, rangMois } from "@/lib/mois";
import { createClient } from "@/lib/supabase/server";

export type RosterResult = { ok: true } | { ok: false; error: string };

async function appeler(fonction: "rm_modifier_tm" | "rm_retirer_tm", args: Record<string, unknown>): Promise<RosterResult> {
  const manager = await getCurrentManager();
  if (manager?.role !== "RM") return { ok: false, error: "Réservé aux RM." };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fonction, args);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// La date de début d'un de tes TM (« Avril 2026 »), ou null pour l'effacer.
export async function setDateDebutTm(tmId: string, mois: string | null): Promise<RosterResult> {
  if (mois != null) {
    if (!isMonthLabel(mois)) return { ok: false, error: "Choisis un mois." };
    if ((rangMois(mois) ?? 0) > (rangMois(currentMonthLabel()) ?? 0)) {
      return { ok: false, error: "La date de début ne peut pas être dans le futur." };
    }
  }
  return appeler("rm_modifier_tm", { p_tm: tmId, p_changes: { date_debut: mois } });
}

// Renommer un TM créé depuis ton BI (sans login).
export async function renommerTm(tmId: string, nom: string): Promise<RosterResult> {
  const propre = nom.trim().replace(/\s+/g, " ");
  if (!propre) return { ok: false, error: "Le nom ne peut pas être vide." };
  return appeler("rm_modifier_tm", { p_tm: tmId, p_changes: { nom: propre } });
}

// Retirer un TM créé depuis ton BI (sans login) : il n'est plus rattaché à toi, rien n'est supprimé.
export async function retirerTm(tmId: string): Promise<RosterResult> {
  return appeler("rm_retirer_tm", { p_tm: tmId });
}
