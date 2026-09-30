"use server";

// Enregistrement de l'import du BI RM : remplace en une fois toutes les lignes du RM pour ce mois
// (fonction Supabase remplacer_bi_rm). Table séparée : les chiffres que les TM saisissent ne sont jamais touchés.
import { refresh } from "next/cache";
import { getCommerciauxDesTM } from "@/lib/commerciaux";
import { type LigneReconnue, nettoyerDonnees } from "@/lib/lecture-bi-rm";
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
    .filter((l) => l.etat !== "ignore")
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
