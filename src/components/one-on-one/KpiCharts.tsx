import { clamp, pc } from "@/lib/momento";
import type { Rep } from "@/lib/types";

const GOOD = "var(--color-good)";
const WARN = "var(--color-warn)";
const BAD = "var(--color-bad)";

// vert ≥ 100 % · orange 80–100 % · rouge < 80 %
const paceColor = (pace: number) => (pace >= 1 ? GOOD : pace >= 0.8 ? WARN : BAD);

function Donut({ fraction, value, label, color }: { fraction: number; value: string; label: string; color: string }) {
  const circumference = 2 * Math.PI * 22;
  const offset = circumference * (1 - clamp(fraction, 0, 1));
  return (
    <div className="min-w-[120px] flex-1 rounded-[14px] border border-line bg-surface px-3 pt-3.5 pb-3 text-center shadow-card">
      <div className="relative mx-auto size-[74px]">
        <svg width="74" height="74" viewBox="0 0 60 60" aria-hidden="true">
          <circle cx="30" cy="30" r="22" fill="none" stroke="var(--color-track)" strokeWidth="6" />
          <circle
            cx="30"
            cy="30"
            r="22"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference.toFixed(1)}
            strokeDashoffset={offset.toFixed(1)}
            transform="rotate(-90 30 30)"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center font-display text-[15px] font-bold" style={{ color }}>
          {value}
        </div>
      </div>
      <div className="mt-[9px] text-[11px] font-semibold leading-[1.3] text-muted">{label}</div>
    </div>
  );
}

// Les camemberts : ventes, installs, POS share, puis send back (ou POS installés).
export function KpiCharts({ rep }: { rep: Rep }) {
  return (
    <div className="mb-[22px] flex flex-wrap gap-3">
      <Donut
        fraction={rep.vPaceF}
        value={Math.round(rep.vPaceF * 100) + "%"}
        label="Ventes (pace)"
        color={paceColor(rep.vPaceF)}
      />
      <Donut
        fraction={rep.iPaceF}
        value={Math.round(rep.iPaceF * 100) + "%"}
        label="Installs (pace)"
        color={paceColor(rep.iPaceF)}
      />
      <Donut
        fraction={rep.posShare / 25}
        value={pc(rep.posShare)}
        label="POS share / 25 %"
        color={rep.posShare >= 25 ? GOOD : WARN}
      />
      {rep.sendback != null ? (
        <Donut
          fraction={rep.sendback / 25}
          value={pc(rep.sendback)}
          label="Send back / 10 %"
          color={rep.sendback <= 10 ? GOOD : rep.sendback <= 18 ? WARN : BAD}
        />
      ) : rep.install ? (
        <Donut
          fraction={rep.posInstPct / 20}
          value={pc(rep.posInstPct)}
          label="POS installés / 20 %"
          color={rep.posInstPct >= 20 ? GOOD : WARN}
        />
      ) : null}
    </div>
  );
}
