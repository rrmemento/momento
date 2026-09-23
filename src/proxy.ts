// Proxy Next.js 16 (anciennement « middleware ») : s'exécute avant chaque page.
// Toute la logique de connexion est dans lib/supabase/proxy.ts.
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Tout sauf les fichiers techniques de Next.js et les images/icônes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
