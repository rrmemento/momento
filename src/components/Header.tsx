import type { View } from "@/lib/types";

const TABS: { id: View; label: string }[] = [
  { id: "equipe", label: "Équipe" },
  { id: "oo", label: "One-on-One" },
  { id: "import", label: "Import" },
];

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <path
        d="M7 33 L7 14 L22 27 L37 8"
        stroke="var(--color-ink)"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="37" cy="8" r="4.2" fill="var(--color-accent)" />
    </svg>
  );
}

export function Header({
  view,
  onViewChange,
  month,
  months,
  onMonthChange,
}: {
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
        <div className="ml-auto grid size-8 place-items-center rounded-[9px] bg-ink text-[12.5px] font-bold text-white">
          RR
        </div>
      </div>
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-2.5 px-[18px] pt-2.5 pb-3">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onViewChange(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={`rounded-[10px] px-3.5 py-[9px] text-sm font-semibold transition-colors duration-100 ${
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
