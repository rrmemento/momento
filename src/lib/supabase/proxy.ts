// Logique d'authentification exécutée par src/proxy.ts avant chaque page :
// rafraîchit la session Supabase (cookies) et redirige selon que l'utilisateur est connecté ou non.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

// Pages accessibles sans être connecté.
const PUBLIC_PATHS = ["/login"];

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Les nouveaux cookies doivent être visibles par la page (request) ET renvoyés au navigateur (response).
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Ne rien intercaler entre la création du client et getClaims() : c'est cet appel qui
  // vérifie la session et la renouvelle si elle expire.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) return redirectKeepingCookies(request, response, "/login");
  if (isLoggedIn && isPublic) return redirectKeepingCookies(request, response, "/");

  return response;
}

// Une redirection doit conserver les cookies de session éventuellement renouvelés.
function redirectKeepingCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";
  const redirect = NextResponse.redirect(target);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  response.headers.forEach((value, key) => {
    if (key !== "location" && key !== "set-cookie") redirect.headers.set(key, value);
  });
  return redirect;
}
