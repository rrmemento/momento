"use client";

import { useState } from "react";
import type { SalesBi } from "@/lib/bi-rm";
import { analyseAJour, analyseRapideCommercial, construireSujetsPrevus, contexteCommercial, problemes } from "@/lib/gravite";
import { normaliserNom } from "@/lib/lecture-bi";
import { kpisDuBi } from "@/lib/lecture-bi-rm";
import { firstName, orderReps, repFromKpis, statut } from "@/lib/momento";
import type { AnalyseIa, Rep, SujetPrevu } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill, statusBord } from "@/components/ui/StatusPill";
import { KpiBoxTm } from "./KpiBoxTm";
import { KpiCharts } from "./KpiCharts";
import { AnalyseIaBloc } from "./AnalyseIa";

// La clé d'un sales dans les analyses gardées de la fiche du TM : son nom normalisé.
const cleSales = (nom: string) => normaliserNom(nom);

// Une ligne « sales » du BI RM, lue comme un commercial : son objectif = son propre « Sales Budget » du BI,
// donc son niveau et l'analyse MOMENTO habituelle s'appliquent tels quels.
const versRep = (s: SalesBi): Rep =>
  repFromKpis({ id: `bi-${s.rang}`, name: s.nom, sen: "", budget: s.donnees.objectif ?? 0 }, kpisDuBi(s.donnees));

const pc = (v: number | null | undefined) => (v == null ? "—" : `${String(v).replace(".", ",")} %`);

function CarteSales({ rep, ligne, actif, onOuvrir }: { rep: Rep; ligne: SalesBi; actif: boolean; onOuvrir: () => void }) {
  const st = statut(rep);
  const edge = statusBord[st.k];
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

// Les sujets PRÉVUS du 1:1 de ce sales (de quoi il va parler), tirés de l'analyse : lecture seule, jamais les réponses.
function SujetsPrevus({ sujets, depuisRegles, prenom }: { sujets: SujetPrevu[]; depuisRegles: boolean; prenom: string }) {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-3.5">
      <h5 className="mb-0.5 text-[14px] font-bold">Sujets prévus du 1:1 de {prenom}</h5>
      <div className="mb-2.5 text-[11.5px] text-faint">
        Ce que son 1:1 va couvrir · {depuisRegles ? "tirés de l'analyse rapide (règles)" : "proposés par l'analyse IA"} · lecture seule
        (les réponses du TM ne sont pas affichées)
      </div>
      {sujets.length ? (
        <ol className="flex flex-col gap-2.5">
          {sujets.map((s, k) => (
            <li key={k} className="rounded-xl border border-line bg-field px-3 py-2.5">
              <div className="text-[13.5px] font-bold">
                {k + 1}. {s.titre}
              </div>
              {s.constat && <p className="mt-1 text-[12.5px] leading-[1.5] text-ink2">{s.constat}</p>}
              {s.objectif && (
                <div className="mt-1.5 inline-block rounded-lg bg-accent-soft px-2 py-0.5 text-[12px] font-bold text-accent">
                  🎯 Objectif : {s.objectif}
                </div>
              )}
              {s.questions.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {s.questions.map((q, j) => (
                    <li key={j} className="text-[12.5px] text-muted">
                      « {q} »
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[12.5px] text-muted">Rien de particulier à travailler d&apos;après les règles : tout est au niveau.</p>
      )}
    </section>
  );
}

// Le zoom sur un sales : ses KPIs du BI, son analyse UNIQUE « data analyst » (générée une fois, gardée dans la fiche du
// TM, avec « Régénérer ») et les sujets prévus de son 1:1.
function ZoomSales({
  tmId,
  month,
  rep,
  ligne,
  analyse: analyseGardee,
  onGarder,
  onFermer,
}: {
  tmId: string;
  month: string;
  rep: Rep;
  ligne: SalesBi;
  analyse: AnalyseIa | null;
  onGarder: (analyse: AnalyseIa) => void;
  onFermer: () => void;
}) {
  const rapide = analyseRapideCommercial(rep); // l'analyse rapide (règles), immédiate, sans IA
  const analyse = analyseAJour(analyseGardee, rep, false); // relue avec les règles du jour (pilier « cata » = vigilance)
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

      <AnalyseIaBloc
        analyseRegles={rapide}
        analyse={analyse}
        disponible={rep.hasKpis}
        route="/api/analyse-sales-rm"
        corps={{ tmId, mois: month, rang: ligne.rang }}
        onRecue={onGarder}
      />

      {/* Les sujets prévus : 1 à 3, un par vrai problème (règles MOMENTO), avec le texte de l'analyse IA si elle a été
          demandée ; chacun avec son objectif chiffré. */}
      <SujetsPrevus
        sujets={construireSujetsPrevus(analyse?.sujets ?? [], problemes(rep, contexteCommercial(rep)))}
        depuisRegles={!analyse}
        prenom={firstName(rep)}
      />

      <KpiBoxTm donnees={ligne.donnees} month={month} titre={`BI de ${firstName(rep)}`} />
    </div>
  );
}

// Les sales d'un TM dans le BI du mois (vue RM, lecture seule) : cartes, puis zoom sur un sales au clic.
export function SalesDuTm({
  tmId,
  nomTm,
  month,
  sales,
  analyses,
  onGarder,
}: {
  tmId: string;
  nomTm: string;
  month: string;
  sales: SalesBi[];
  analyses: Record<string, AnalyseIa>; // analyses gardées dans la fiche du TM (clé = nom du sales)
  onGarder: (cle: string, analyse: AnalyseIa) => void;
}) {
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
          analyse={analyses[cleSales(choisi.ligne.nom)] ?? null}
          onGarder={(a) => onGarder(cleSales(choisi.ligne.nom), a)}
          onFermer={() => setOuvert(null)}
        />
      )}
    </section>
  );
}
