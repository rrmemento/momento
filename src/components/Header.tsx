import { logout } from "@/app/login/actions";
import type { ManagerProfile, View } from "@/lib/types";
import { Logo } from "./ui/Logo";

const TABS: { id: View; label: string }[] = [
  { id: "equipe", label: "Équipe" },
  { id: "oo", label: "One-on-One" },
  { id: "saisie", label: "Chiffres" },
  { id: "import", label: "Import" },
];

export function Header({
  manager,
  view,
  onViewChange,
  month,
  months,
  onMonthChange,
}: {
  manager: ManagerProfile;
  view: View;
  onViewChange: (view: View) => void;
  month: string;
  months: string[];
  onMonthChange: (month: string) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1000px] items-center gap-2.5 px-5 pt-3">
        <div className="flex items-center gap-[9px] font-display text-[19px] font-extrabold tracking-[-0.03em]">
          <Logo />
          momento
        </div>
        <div className="ml-auto hidden text-right leading-tight sm:block">
          <div className="text-[13px] font-semibold text-ink">{manager.nom}</div>
          {manager.equipe && <div className="text-[11.5px] text-muted">{manager.equipe}</div>}
        </div>
        <div
          title={manager.nom}
          aria-label={manager.nom}
          className="ml-auto grid size-8 place-items-center rounded-[9px] bg-ink text-[12.5px] font-bold text-white sm:ml-0"
        >
          {manager.initials}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-[9px] border border-line bg-surface px-3 py-[7px] text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Se déconnecter
          </button>
        </form>
      </div>
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-2.5 px-[18px] pt-2.5 pb-3">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onViewChange(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={`rounded-[10px] px-3 py-[9px] sm:px-3.5 text-sm font-semibold transition-colors duration-100 ${
                view === tab.id ? "bg-ink text-white" : "text-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <label className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-muted">
          1:1 de
          <select
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            className="rounded-[9px] border border-line bg-surface px-2.5 py-[7px] text-[13px] font-bold text-ink"
          >
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
