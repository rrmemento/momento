"use server";

// Actions serveur de connexion / déconnexion (Supabase Auth, email + mot de passe).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Renseigne ton email et ton mot de passe.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: loginErrorMessage(error.code, error.status), email };

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function loginErrorMessage(code?: string, status?: number) {
  switch (code) {
    case "invalid_credentials":
      return "Email ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Ton email n'est pas encore confirmé.";
    case "user_banned":
      return "Ce compte est désactivé. Contacte ton administrateur.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Trop de tentatives. Réessaie dans quelques minutes.";
  }
  if (status === 429) return "Trop de tentatives. Réessaie dans quelques minutes.";
  return "Connexion impossible pour le moment. Vérifie ta connexion internet et réessaie.";
}
