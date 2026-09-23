import type { ReactNode } from "react";
import { pc } from "@/lib/momento";
import type { Rep } from "@/lib/types";

type Tone = "good" | "bad" | null;

const tileTones = {
  good: "border-good-line bg-good-soft",
  bad: "border-bad-line2 bg-bad-soft",
  none: "border-line2 bg-paper",
};

const valueTones = { good: "text-good", bad: "text-bad", none: "" };

function Tile({ label, value, caption, tone }: { label: string; value: ReactNode; caption: string; tone: Tone }) {
  const t = tone ?? "none";
  return (
    <div className={`rounded-[11px] border px-2.5 py-[9px] ${tileTones[t]}`}>
      <div className="text-[10.5px] font-semibold leading-[1.2] text-muted">{label}</div>
      <div className={`mt-[3px] font-display text-lg font-bold leading-[1.1] ${valueTones[t]}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-faint">{caption}</div>
    </div>
  );
}

const Small = ({ children }: { children: ReactNode }) => <small className="text-xs text-faint">{children}</small>;

// Choisit la couleur d'une tuile : vert si `good`, rouge si `bad`, neutre sinon.
const tone = (good: boolean, bad = false): Tone => (good ? "good" : bad ? "bad" : null);

// Le bloc « Tous les KPIs » affiché à gauche du formulaire.
export function KpiBox({ rep: r, month }: { rep: Rep; month: string }) {
  const m3 = r.level === "M3+";
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-muted">Tous les KPIs — {month}</h4>
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Ventes signées"
          value={<>{r.ventes}<Small>/{r.budget}</Small></>}
          caption={`obj ${r.budget} · ${Math.round(r.vAtt * 100)}%`}
          tone={tone(r.vAtt >= 1, r.vAtt < 0.5)}
        />
        <Tile
          label="Installations"
          value={<>{r.install}<Small>/{r.budget}</Small></>}
          caption={`obj ${r.budget} · ${Math.round(r.iAtt * 100)}%`}
          tone={tone(r.iAtt >= 1, r.iAtt < 0.4)}
        />
        <Tile label="Ventes OG" value={r.og} caption="cible 5" tone={tone(r.og >= 5, r.og <= 1 && r.level !== "M1")} />
        <Tile label="Taux moyen" value={r.rate.toFixed(2) + "%"} caption=">0,85 %" tone={tone(r.rate >= 1, r.rate < 0.8)} />
        <Tile
          label="POS vendus"
          value={r.posSales}
          caption={m3 ? "min 4/mois" : "—"}
          tone={tone(m3 && r.posSales >= 4, m3 && r.posSales <= 1)}
        />
        <Tile
          label="POS installés"
          value={<>{r.posInst}<Small> · {pc(r.posInstPct)}</Small></>}
          caption="cible ≥20 %"
          tone={tone(r.install > 0 && r.posInstPct >= 20, r.install > 0 && r.posInst === 0)}
        />
        <Tile label="POS share" value={pc(r.posShare)} caption="cible 25 %" tone={tone(r.posShare >= 25)} />
        <Tile label="POS upfront" value={`€${r.posUpfront}`} caption="moy. 1200 €" tone={tone(r.posUpfront >= 1200)} />
        <Tile
          label="Send back"
          value={pc(r.sendback)}
          caption="<10 %"
          tone={tone(r.sendback != null && r.sendback <= 10, r.sendback != null && r.sendback > 18)}
        />
        <Tile label="Quick install" value={pc(r.quick)} caption=">60 %" tone={tone(r.quick != null && r.quick >= 60)} />
        <Tile
          label="Délai moyen"
          value={r.avgDays == null ? "—" : r.avgDays + " j"}
          caption="cible 3 j"
          tone={tone(r.avgDays != null && r.avgDays <= 5, r.avgDays != null && r.avgDays > 16)}
        />
        <Tile label="Conversion IH" value={pc(r.ihcr)} caption=">20 %" tone={tone(r.ihcr >= 20, r.ihcr < 12)} />
        <Tile label="IH quick" value={pc(r.ihQuick)} caption="closing IH" tone={null} />
        <Tile label="Meeting avec AC" value={pc(r.mtgAc)} caption="cible 50 %" tone={tone(r.mtgAc >= 40)} />
      </div>
    </div>
  );
}
