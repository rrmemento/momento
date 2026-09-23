// Client Supabase pour le serveur (pages, Server Actions, Route Handlers).
// À créer à chaque requête : ne jamais le garder dans une variable globale.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

export async function createClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis une page serveur, où l'écriture de cookies est interdite.
          // Sans risque : le rafraîchissement de session sera géré par le proxy (étape login).
        }
      },
    },
  });
}
