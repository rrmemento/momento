import type { Analysis, Insight } from "@/lib/types";
import { InsightCard, type InsightTone } from "@/components/ui/InsightCard";

const titleTones: Record<InsightTone, string> = {
  success: "text-good",
  axe: "text-warn",
  alert: "text-bad",
  done: "text-good",
};

function InsightColumn({ label, tone, items }: { label: string; tone: InsightTone; items: Insight[] }) {
  return (
    <div>
      <div
        className={`mb-[9px] flex items-center gap-[7px] text-[11.5px] font-bold uppercase tracking-[0.03em] ${titleTones[tone]}`}
      >
        {label} · {items.length}
      </div>
      {items.length ? (
        items.map((item) => <InsightCard key={item.tt} insight={item} tone={tone} />)
      ) : (
        <div className="rounded-xl border border-dashed border-line px-[13px] py-2.5 text-[12.5px] text-faint">
          Rien à signaler.
        </div>
      )}
    </div>
  );
}

// « Ce que MOMENTO voit » : succès / axes de progression / points de vigilance.
export function MomentoSees({ analysis }: { analysis: Analysis }) {
  return (
    <>
      <div className="mx-0.5 mt-0.5 mb-3 flex items-center gap-[9px]">
        <div className="grid size-[26px] flex-none place-items-center rounded-lg bg-accent">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" fill="#fff" />
          </svg>
        </div>
        <h3 className="text-base font-bold">Ce que MOMENTO voit</h3>
      </div>
      <div className="mb-[22px] grid grid-cols-1 gap-3 min-[761px]:grid-cols-3">
        <InsightColumn label="✦ Succès du mois" tone="success" items={analysis.S} />
        <InsightColumn label="↗ Axes de progression" tone="axe" items={analysis.A} />
        <InsightColumn label="▲ Points de vigilance" tone="alert" items={analysis.N} />
      </div>
    </>
  );
}
