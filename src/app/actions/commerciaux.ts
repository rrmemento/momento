"use server";

// Gestion de l'équipe : ajouter, renommer, retirer un commercial (table « commerciaux »).
import { refresh } from "next/cache";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { BUDGETS } from "@/lib/kpis";
import { normaliserNom } from "@/lib/lecture-bi";
import { getCurrentManager } from "@/lib/managers";
import { SENIORITES } from "@/lib/seniorite";
import { createClient } from "@/lib/supabase/server";

export type CommercialResult = { ok: true; id: string } | { ok: false; error: string };

// Supabase refuse sans message clair quand une règle de sécurité (RLS) manque.
const refusRls = (action: string) =>
  `Supabase refuse de ${action} ce commercial : la règle d'accès correspondante manque sans doute dans Supabase.`;

// « jimmy  dupont » → « Jimmy Dupont » ; renvoie une erreur si le nom est vide, trop long ou déjà pris.
async function verifierNom(nom: string, saufId?: string): Promise<{ nom: string } | { error: string }> {
  const propre = nom.trim().replace(/\s+/g, " ");
  if (!propre) return { error: "Le nom est obligatoire." };
  if (propre.length > 60) return { error: "Nom trop long (60 caractères maximum)." };
  const doublon = (await getMyCommerciaux()).find((c) => c.id !== saufId && normaliserNom(c.nom) === normaliserNom(propre));
  if (doublon) return { error: `${doublon.nom} fait déjà partie de ton équipe.` };
  return { nom: propre };
}

export async function ajouterCommercial(input: { nom: string; seniorite: string; budget: number }): Promise<CommercialResult> {
  const manager = await getCurrentManager();
  if (!manager) return { ok: false, error: "Compte non configuré." };
  if (!SENIORITES.includes(input.seniorite)) return { ok: false, error: "Séniorité invalide." };
  if (!BUDGETS.some((b) => b.value === input.budget)) return { ok: false, error: "Budget invalide." };
  const verif = await verifierNom(input.nom);
  if ("error" in verif) return { ok: false, error: verif.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commerciaux")
    .insert({ nom: verif.nom, seniorite: input.seniorite, budget: input.budget, manager_id: manager.id, actif: true })
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: error.code === "42501" ? refusRls("créer") : `Création impossible : ${error.message}` };
  }

  refresh();
  return { ok: true, id: String(data.id) };
}

export type AjoutGroupeResult =
  | { ok: true; crees: { nom: string; id: string }[]; refuses: { nom: string; raison: string }[] } // nom : tel qu'envoyé
  | { ok: false; error: string };

// « Créer tous les commerciaux détectés » : les noms valides sont créés en une seule écriture,
// les autres (vide, trop long, déjà dans l'équipe, en double dans la liste) sont renvoyés avec la raison.
export async function ajouterCommerciaux(
  liste: { nom: string; seniorite: string; budget: number }[],
): Promise<AjoutGroupeResult> {
  const manager = await getCurrentManager();
  if (!manager) return { ok: false, error: "Compte non configuré." };
  if (liste.length > 100) return { ok: false, error: "Trop de commerciaux d'un coup (100 maximum)." };

  const existants = new Map((await getMyCommerciaux()).map((c) => [normaliserNom(c.nom), c.nom]));
  const valides: { envoye: string; nom: string; seniorite: string; budget: number }[] = [];
  const refuses: { nom: string; raison: string }[] = [];
  for (const c of liste) {
    const propre = c.nom.trim().replace(/\s+/g, " ");
    const cle = normaliserNom(propre);
    const raison = !cle
      ? "Nom vide."
      : propre.length > 60
        ? "Nom trop long (60 caractères maximum)."
        : existants.has(cle)
          ? `${existants.get(cle)} fait déjà partie de ton équipe.`
          : valides.some((v) => normaliserNom(v.nom) === cle)
            ? "En double dans la liste."
            : !SENIORITES.includes(c.seniorite) || !BUDGETS.some((b) => b.value === c.budget)
              ? "Séniorité ou budget invalide."
              : null;
    if (raison) refuses.push({ nom: c.nom, raison });
    else valides.push({ envoye: c.nom, nom: propre, seniorite: c.seniorite, budget: c.budget });
  }
  if (!valides.length) return { ok: true, crees: [], refuses };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commerciaux")
    .insert(valides.map((v) => ({ nom: v.nom, seniorite: v.seniorite, budget: v.budget, manager_id: manager.id, actif: true })))
    .select("id, nom");
  if (error) {
    return { ok: false, error: error.code === "42501" ? refusRls("créer") : `Création impossible : ${error.message}` };
  }

  // On retrouve chaque ligne créée par son nom (unique dans la liste), pour que le navigateur y rattache les chiffres lus.
  const idParNom = new Map(data.map((row) => [normaliserNom(row.nom), String(row.id)]));
  const crees = valides.flatMap((v) => {
    const id = idParNom.get(normaliserNom(v.nom));
    return id ? [{ nom: v.envoye, id }] : [];
  });

  refresh();
  return { ok: true, crees, refuses };
}

// Modifie un commercial de l'équipe du manager connecté (le filtre manager_id s'ajoute à la RLS).
async function modifier(commercialId: string, changes: { nom?: string; actif?: boolean }, action: string) {
  const manager = await getCurrentManager();
  if (!manager) return "Compte non configuré.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commerciaux")
    .update(changes)
    .eq("id", commercialId)
    .eq("manager_id", manager.id)
    .select("id");
  if (error) return error.code === "42501" ? refusRls(action) : `Modification impossible : ${error.message}`;
  if (!data.length) return "Ce commercial ne fait pas partie de ton équipe.";
  return null;
}

export async function renommerCommercial(commercialId: string, nom: string): Promise<CommercialResult> {
  const verif = await verifierNom(nom, commercialId);
  if ("error" in verif) return { ok: false, error: verif.error };
  const error = await modifier(commercialId, { nom: verif.nom }, "renommer");
  if (error) return { ok: false, error };
  refresh();
  return { ok: true, id: commercialId };
}

// Retire le commercial de l'équipe sans rien supprimer : ses chiffres passés restent en base.
export async function desactiverCommercial(commercialId: string): Promise<CommercialResult> {
  const error = await modifier(commercialId, { actif: false }, "retirer");
  if (error) return { ok: false, error };
  refresh();
  return { ok: true, id: commercialId };
}
