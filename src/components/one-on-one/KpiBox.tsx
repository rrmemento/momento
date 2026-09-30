import type { ReactNode } from "react";
import { ciblesVolume, DELAI_CIBLE, DELAI_MAX, niveauDelai, pc } from "@/lib/momento";
import type { Rep } from "@/lib/types";

export type Tone = "good" | "warn" | "bad" | null;

const tileTones = {
  good: "border-good-line bg-good-soft",
  warn: "border-warn-line bg-warn-soft",
  bad: "border-bad-line2 bg-bad-soft",
  none: "border-line2 bg-paper",
};

const valueTones = { good: "text-good", warn: "text-warn", bad: "text-bad", none: "" };

export function Tile({ label, value, caption, tone }: { label: string; value: ReactNode; caption: string; tone: Tone }) {
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

// Le délai moyen vente → pose : indicateur clé, en tuile large (vert < 7 j, orange 7 à 12 j, rouge au-delà).
const TONS_DELAI = { bon: "good", moyen: "warn", critique: "bad" } as const;
function DelaiTile({ jours }: { jours: number | null }) {
  const t = jours == null ? "none" : TONS_DELAI[niveauDelai(jours)];
  return (
    <div className={`col-span-2 flex items-center gap-3 rounded-[11px] border px-3 py-2.5 ${tileTones[t]}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-bold text-ink2">Délai moyen d&apos;installation</div>
        <div className="mt-0.5 text-[10.5px] text-faint">
          vente → pose · cible &lt; {DELAI_CIBLE} j · alerte au-delà de {DELAI_MAX} j
        </div>
      </div>
      <div className={`font-display text-[26px] font-bold leading-none ${valueTones[t]}`}>
        {jours == null ? "—" : `${String(jours).replace(".", ",")} j`}
      </div>
    </div>
  );
}

// Le bloc « Tous les KPIs » affiché à gauche du formulaire.
export function KpiBox({ rep: r, month }: { rep: Rep; month: string }) {
  const m3 = r.level === "M3+";
  const c = ciblesVolume(r); // POS et OG au prorata de l'objectif du mois (mois particulier)
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-muted">Tous les KPIs — {month}</h4>
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Ventes signées"
          value={<>{r.ventes}<Small>/{r.objectif}</Small></>}
          caption={`${r.special ? "obj ajusté" : "obj"} ${r.objectif} · ${Math.round(r.vAtt * 100)}%`}
          tone={tone(r.vAtt >= 1, r.vAtt < 0.5)}
        />
        <Tile
          label="Installations"
          value={<>{r.install}<Small>/{r.objectif}</Small></>}
          caption={`${r.special ? "obj ajusté" : "obj"} ${r.objectif} · ${Math.round(r.iAtt * 100)}%`}
          tone={tone(r.iAtt >= 1, r.iAtt < 0.4)}
        />
        <DelaiTile jours={r.avgDays} />
        <Tile
          label="Ventes OG"
          value={r.og}
          caption={`cible ${c.ogCible}${r.special ? " (ajustée)" : ""}`}
          tone={tone(r.og >= c.ogCible, r.og <= Math.floor(c.ratio) && r.level !== "M1")}
        />
        <Tile
          label="Taux moyen"
          value={r.rate == null ? "—" : r.rate.toFixed(2) + "%"}
          caption=">0,85 %"
          tone={tone(r.rate != null && r.rate >= 1, r.rate != null && r.rate < 0.8)}
        />
        <Tile
          label="POS vendus"
          value={r.posSales}
          caption={m3 ? `min ${c.posMin}/mois${r.special ? " (ajusté)" : ""}` : "—"}
          tone={tone(m3 && r.posSales >= c.posMin, m3 && r.posSales <= c.posQuasiNul)}
        />
        <Tile
          label="POS installés"
          value={<>{r.posInst}<Small> · {pc(r.posInstPct)}</Small></>}
          caption="cible ≥20 %"
          tone={tone(r.install > 0 && r.posInstPct >= 20, r.install > 0 && r.posInst === 0)}
        />
        <Tile label="POS share" value={pc(r.posShare)} caption="cible 25 %" tone={tone(r.posShare != null && r.posShare >= 25)} />
        <Tile
          label="POS upfront"
          value={r.posUpfront == null ? "—" : `€${r.posUpfront}`}
          caption="moy. 1200 €"
          tone={tone(r.posUpfront != null && r.posUpfront >= 1200)}
        />
        <Tile
          label="Send back"
          value={pc(r.sendback)}
          caption="<10 %"
          tone={tone(r.sendback != null && r.sendback <= 10, r.sendback != null && r.sendback > 18)}
        />
        <Tile label="Quick install" value={pc(r.quick)} caption=">60 %" tone={tone(r.quick != null && r.quick >= 60)} />
        <Tile label="Conversion IH" value={pc(r.ihcr)} caption=">20 %" tone={tone(r.ihcr != null && r.ihcr >= 20, r.ihcr != null && r.ihcr < 12)} />
        <Tile label="IH quick" value={pc(r.ihQuick)} caption="closing IH" tone={null} />
        <Tile label="Meeting avec AC" value={pc(r.mtgAc)} caption="cible 50 %" tone={tone(r.mtgAc != null && r.mtgAc >= 40)} />
      </div>
    </div>
  );
}
