"use client";

import { useState } from "react";
import type { SalesBi } from "@/lib/bi-rm";
import type { AnalyseSalesReponse } from "@/lib/brief-tm";
import { kpisDuBi } from "@/lib/lecture-bi-rm";
import { analyse, firstName, orderReps, repFromKpis, statut } from "@/lib/momento";
import type { Analysis, Rep } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { KpiBoxTm } from "./KpiBoxTm";
import { KpiCharts } from "./KpiCharts";
import { MomentoSees } from "./MomentoSees";

// Une ligne « sales » du BI RM, lue comme un commercial : son objectif = son propre « Sales Budget » du BI,
// donc son niveau et l'analyse MOMENTO habituelle s'appliquent tels quels.
const versRep = (s: SalesBi): Rep =>
  repFromKpis({ id: `bi-${s.rang}`, name: s.nom, sen: "", budget: s.donnees.objectif ?? 0 }, kpisDuBi(s.donnees));

const pc = (v: number | null | undefined) => (v == null ? "—" : `${String(v).replace(".", ",")} %`);

function CarteSales({ rep, ligne, actif, onOuvrir }: { rep: Rep; ligne: SalesBi; actif: boolean; onOuvrir: () => void }) {
  const st = statut(rep);
  const edge = st.k === "acc" ? "border-l-[3px] border-l-bad" : st.k === "ok" ? "border-l-[3px] border-l-good" : "";
  return (
    <button
      type="button"
      onClick={onOuvrir}
      aria-pressed={actif}
      className={`flex w-full items-center gap-3 overflow-hidden rounded-[15px] border bg-surface px-3.5 py-3 text-left shadow-card ${edge} ${
        actif ? "border-accent" : "border-line"
      }`}
    >
      <Avatar initials={rep.initials} />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold">{rep.name}</div>
        <div className="mt-0.5 text-[12px] text-muted">
          ventes {rep.ventes}/{rep.objectif || "—"} · pace {pc(ligne.donnees.vPace)} · POS share {pc(ligne.donnees.posShare)}
        </div>
        {!ligne.rattache && <div className="mt-0.5 text-[11px] font-semibold text-warn">nom non rattaché à un commercial du TM</div>}
      </div>
      <StatusPill status={st} />
    </button>
  );
}

// Le zoom sur un sales : ses KPIs du BI, l'analyse MOMENTO (règles) et, à la demande, l'analyse data analyst (IA).
function ZoomSales({ tmId, month, rep, ligne, onFermer }: { tmId: string; month: string; rep: Rep; ligne: SalesBi; onFermer: () => void }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ia, setIa] = useState<Analysis | null>(null);

  async function analyser() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/analyse-sales-rm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmId, mois: month, rang: ligne.rang }),
      });
      const data = (await res.json().catch(() => null)) as AnalyseSalesReponse | null;
      if (data?.ok) setIa(data.analyse);
      else setErreur(data?.error ?? "L'analyse n'a pas pu être établie. Réessaie.");
    } catch {
      setErreur("Connexion impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-paper p-3.5">
      <div className="mb-4 flex items-center gap-3">
        <Avatar initials={rep.initials} size="lg" />
        <div className="min-w-0 flex-1">
          <h4 className="text-[19px] font-bold">{rep.name}</h4>
          <div className="text-[12px] text-muted">BI de {month.toLowerCase()} · lecture seule</div>
        </div>
        <StatusPill status={statut(rep)} />
        <button type="button" onClick={onFermer} className="rounded-lg px-2 py-1 text-[13px] font-bold text-faint hover:text-ink">
          ✕
        </button>
      </div>

      {rep.hasKpis && <KpiCharts rep={rep} />}

      <div className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.03em] text-muted">
        {ia ? "Analyse data analyst (IA)" : "Analyse MOMENTO (règles)"}
      </div>
      <MomentoSees analysis={ia ?? analyse(rep)} />

      {!ia && (
        <div className="mb-4">
          <Button onClick={analyser} disabled={enCours || !rep.hasKpis} className="disabled:opacity-60">
            {enCours ? "Analyse en cours… (jusqu'à 1 min)" : `✦ Analyse data analyst de ${firstName(rep)} (IA)`}
          </Button>
          {erreur && (
            <div role="alert" className="mt-2 rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
              {erreur}
            </div>
          )}
        </div>
      )}

      <KpiBoxTm donnees={ligne.donnees} month={month} titre={`BI de ${firstName(rep)}`} />
    </div>
  );
}

// Les sales d'un TM dans le BI du mois (vue RM, lecture seule) : cartes, puis zoom sur un sales au clic.
export function SalesDuTm({ tmId, nomTm, month, sales }: { tmId: string; nomTm: string; month: string; sales: SalesBi[] }) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  const reps = sales.map((s) => ({ rep: versRep(s), ligne: s }));
  const parId = new Map(reps.map((r) => [r.rep.id, r]));
  const choisi = reps.find((r) => r.ligne.rang === ouvert);

  return (
    <section className="mb-[22px] rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <h3 className="mb-0.5 text-[15px] font-bold">
        Les sales de {nomTm.split(" ")[0]} · {month.toLowerCase()}
      </h3>
      <div className="mb-3 text-xs text-faint">
        {sales.length
          ? `${sales.length} sales dans le BI importé · lecture seule · clique un sales pour zoomer`
          : "Aucun sales sous ce TM dans le BI importé pour ce mois."}
      </div>
      <div className="grid grid-cols-1 gap-2 min-[761px]:grid-cols-2">
        {orderReps(reps.map((r) => r.rep)).map((rep) => {
          const r = parId.get(rep.id)!;
          return (
            <CarteSales
              key={rep.id}
              rep={rep}
              ligne={r.ligne}
              actif={r.ligne.rang === ouvert}
              onOuvrir={() => setOuvert(r.ligne.rang === ouvert ? null : r.ligne.rang)}
            />
          );
        })}
      </div>
      {choisi && (
        <ZoomSales
          key={`${month}|${choisi.ligne.rang}`}
          tmId={tmId}
          month={month}
          rep={choisi.rep}
          ligne={choisi.ligne}
          onFermer={() => setOuvert(null)}
        />
      )}
    </section>
  );
}
