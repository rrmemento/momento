import { logout } from "@/app/login/actions";
import { Button } from "./ui/Button";
import { Logo } from "./ui/Logo";

// Affiché quand le compte est connecté mais n'a pas encore de fiche dans la table « managers ».
export function AccountNotConfigured({ email }: { email?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 pt-[env(safe-area-inset-top,0px)] pb-10">
      <div className="w-full max-w-[400px] animate-fade">
        <div className="mb-8 flex items-center justify-center gap-2.5 font-display text-[24px] font-extrabold tracking-[-0.03em]">
          <Logo size={30} />
          momento
        </div>
        <div className="rounded-[18px] border border-line bg-surface p-6 shadow-card">
          <h1 className="mb-2 text-[22px] font-bold">Ton compte n&apos;est pas encore configuré</h1>
          <p className="mb-5 text-sm text-muted">
            Tu es bien connecté{email && <> avec <span className="font-semibold text-ink">{email}</span></>}, mais aucune
            fiche manager n&apos;est encore rattachée à ce compte. Demande à ton administrateur de la créer, puis
            reconnecte-toi.
          </p>
          <form action={logout}>
            <Button type="submit" variant="ghost">
              Se déconnecter
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
