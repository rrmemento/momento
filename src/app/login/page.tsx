import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion · MOMENTO" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 pt-[env(safe-area-inset-top,0px)] pb-10">
      <div className="w-full max-w-[400px] animate-fade">
        <div className="mb-8 flex items-center justify-center gap-2.5 font-display text-[24px] font-extrabold tracking-[-0.03em]">
          <Logo size={30} />
          momento
        </div>
        <div className="rounded-[18px] border border-line bg-surface p-6 shadow-card">
          <h1 className="mb-1 text-[24px] font-bold">Connexion</h1>
          <p className="mb-5 text-sm text-muted">Accède à tes One-on-One et au suivi de ton équipe.</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
