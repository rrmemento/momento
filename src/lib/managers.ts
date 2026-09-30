// Accès côté serveur au compte connecté et à sa fiche manager (table « managers »).
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// TM = manager d'équipe (ses commerciaux) · RM = Regional Manager : lit, sans modifier, les équipes de ses TM.
export type Role = "TM" | "RM";

export type Manager = {
  id: string;
  user_id: string;
  nom: string;
  equipe: string | null;
  role: Role;
};

// Tout ce qui n'est pas explicitement « RM » est un TM (y compris tant que la colonne role n'existe pas en base).
const lireRole = (valeur: unknown): Role => (valeur === "RM" ? "RM" : "TM");

// L'utilisateur connecté (vérifié par Supabase), ou null.
// cache() : un seul appel par requête, même si plusieurs composants le demandent.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { id: data.claims.sub, email: data.claims.email as string | undefined };
});

// La fiche manager du compte connecté, ou null s'il n'est pas connecté ou pas encore configuré.
export const getCurrentManager = cache(async (): Promise<Manager | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("managers")
    .select("*") // « * » : l'app marche même si la colonne role n'a pas encore été ajoutée en base
    .eq("user_id", user.id)
    .maybeSingle();

  // Une vraie erreur (droits, réseau…) ne doit pas passer pour « compte non configuré ».
  if (error) throw new Error(`Lecture de la fiche manager impossible : ${error.message}`);
  if (!data) return null;
  return { id: String(data.id), user_id: data.user_id, nom: data.nom, equipe: data.equipe ?? null, role: lireRole(data.role) };
});

// Les TM rattachés au RM connecté (table « rm_tms »), triés par nom. [] pour un TM.
// Double barrière : le filtre rm_id ici, et la RLS en base (un RM ne lit que ses propres liens et ses TM).
export const getMesTM = cache(async (): Promise<Manager[]> => {
  const moi = await getCurrentManager();
  if (moi?.role !== "RM") return [];

  const supabase = await createClient();
  const { data: liens, error } = await supabase.from("rm_tms").select("tm_id").eq("rm_id", moi.id);
  if (error) throw new Error(`Lecture des TM rattachés impossible : ${error.message}`);
  const ids = liens.map((l) => String(l.tm_id));
  if (ids.length === 0) return [];

  const { data, error: erreurTm } = await supabase
    .from("managers")
    .select("id, user_id, nom, equipe")
    .in("id", ids)
    .order("nom");
  if (erreurTm) throw new Error(`Lecture des TM impossible : ${erreurTm.message}`);
  return data.map((m) => ({ id: String(m.id), user_id: m.user_id, nom: m.nom, equipe: m.equipe ?? null, role: "TM" }));
});

// « Roméo Rulleau » → « RR » (pour l'avatar).
export function initials(nom: string) {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
