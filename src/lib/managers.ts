// Accès côté serveur au compte connecté et à sa fiche manager (table « managers »).
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Manager = {
  id: string;
  user_id: string;
  nom: string;
  equipe: string | null;
};

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
    .select("id, user_id, nom, equipe")
    .eq("user_id", user.id)
    .maybeSingle();

  // Une vraie erreur (droits, réseau…) ne doit pas passer pour « compte non configuré ».
  if (error) throw new Error(`Lecture de la fiche manager impossible : ${error.message}`);
  return data;
});

// « Roméo Rulleau » → « RR » (pour l'avatar).
export function initials(nom: string) {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
