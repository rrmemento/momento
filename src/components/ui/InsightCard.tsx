import type { Insight } from "@/lib/types";

// success = succès (vert) · axe = axe de progression (orange) · alert = point de vigilance (rouge)
// done = confirmation (fond vert)
export type InsightTone = "success" | "axe" | "alert" | "done";

const cardTones: Record<InsightTone, string> = {
  success: "border-line bg-surface",
  axe: "border-warn-line bg-warn-soft",
  alert: "border-bad-line bg-bad-soft",
  done: "border-good-line bg-good-soft",
};

const bigTones: Record<InsightTone, string> = {
  success: "text-good",
  axe: "text-warn",
  alert: "text-bad",
  done: "text-good",
};

export function InsightCard({ insight, tone }: { insight: Insight; tone: InsightTone }) {
  return (
    <div className={`mb-2.5 rounded-[14px] border px-[15px] py-3.5 shadow-card ${cardTones[tone]}`}>
      <div className={`font-display text-[26px] font-bold leading-none tracking-[-0.02em] ${bigTones[tone]}`}>
        {insight.big}
      </div>
      <div className="mt-2 mb-1 text-[13.5px] font-bold">{insight.tt}</div>
      <div className="text-[12.5px] leading-[1.45] text-muted">{insight.dd}</div>
    </div>
  );
}
