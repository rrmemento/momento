"use client";

import { useState } from "react";
import { libelleAjuste } from "@/lib/mois-special";
import { analyseAJour, analyseRapideCommercial, analyseRapideTm } from "@/lib/gravite";
import { firstName } from "@/lib/momento";
import { objectifsEquipe } from "@/lib/objectifs-equipe";
import type { Engagement, SuiviManuel } from "@/lib/suivi";
import type { AnalyseIa, OneOnOne, Rep } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatusPill } from "@/components/ui/StatusPill";
import { Engagements } from "@/components/suivi/Engagements";
import { BriefAuto } from "./BriefAuto";
import { KpiBox } from "./KpiBox";
import { KpiBoxTm } from "./KpiBoxTm";
import { SalesDuTm } from "./SalesDuTm";
import { RosterEquipeTm } from "./RosterTm";
import { Repli } from "@/components/parcours/Repli";
import { KpiCharts } from "./KpiCharts";
import { AnalyseIaBloc } from "./AnalyseIa";
import { OneOnOneForm } from "./OneOnOneForm";
import { RepPicker } from "./RepPicker";
import { programmerFiche } from "./useAutosave";
import { Presentation } from "@/components/presentation/Presentation";
import { ATTENTE_BI, effectifEquipe, useModeRm, useStatutAffiche } from "@/components/ModeRm";

const paceText = (pace: number | null, attainment: number) =>
  pace != null ? pace + " %" : Math.round(attainment * 100) + " %";

export function OneOnOneView({
  reps,
  rep,
  month,
  fiche,
  onFicheChange,
  onModifierFiche,
  moisPrecedent,
  engagementsPrecedents,
  onJuger,
  onSelectRep,
  onToast,
}: {
  reps: Rep[];
  rep: Rep;
  month: string;
  fiche: OneOnOne;
  onFicheChange: (fiche: OneOnOne) => void;
  onModifierFiche: (change: (fiche: OneOnOne) => OneOnOne) => void; // brief IA : appliqué à la dernière version, puis enregistré
  moisPrecedent: string;
  engagementsPrecedents: Engagement[]; // pris au 1:1 du mois précédent
  onJuger: (index: number, suivi: SuiviManuel | null) => void;
  onSelectRep: (repId: string) => void;
  onToast: (message: string) => void;
}) {
  const modeRm = useModeRm();
  // L'analyse UNIQUE « data analyst » (IA), gardée dans la fiche. En attendant qu'elle soit générée, le récap mail et le
  // pré-remplissage s'appuient sur l'analyse des règles (jamais affichée à côté).
  const analyseRapide = modeRm ? analyseRapideTm(rep, effectifEquipe(modeRm, rep.id), modeRm.sales[rep.id] ?? []) : analyseRapideCommercial(rep);
  // L'analyse IA gardée, relue avec les règles du jour : un pilier « cata » y est toujours la vigilance.
  const analyseIa = analyseAJour(fiche.analyseIa, rep, !!modeRm);
  const analysis = analyseIa?.analyse ?? analyseRapide;
  const garderAnalyse = (a: AnalyseIa) => onModifierFiche((f) => ({ ...f, analyseIa: a }));
  const status = useStatutAffiche()(rep);
  const tmInfo = modeRm?.tms.find((t) => t.id === rep.id); // vue RM : la fiche du TM (date de début…)
  const [presentation, setPresentation] = useState(false);

  // Saisie en présentation (réponses, objectifs, besoins) : affichée tout de suite, enregistrée après la pause
  // de frappe dans la même file que le formulaire.
  function modifierEnDirect(change: (fiche: OneOnOne) => OneOnOne) {
    const next = change(fiche);
    onFicheChange(next);
    programmerFiche(rep.id, month, next);
  }

  return (
    <>
      <div className="mx-auto max-w-[600px]">
        <PageTitle kicker="Préparer & mener" title="One-on-One" month={month} />
        <RepPicker reps={reps} currentId={rep.id} onSelect={onSelectRep} />
      </div>

      <div className="mt-1 mb-4 flex items-center gap-[15px]">
        <Avatar initials={rep.initials} size="lg" />
        <div className="flex-1">
          <h2 className="text-[22px] font-bold">{rep.name}</h2>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {rep.hasKpis ? (
              <>
                {!modeRm && <>{rep.level} · </>}pace ventes {paceText(rep.vPace, rep.vAtt)} · pace installs{" "}
                {paceText(rep.iPace, rep.iAtt)}
                {rep.special && (
                  <span className="font-semibold text-warn">
                    {" "}
                    · {libelleAjuste(rep.special)} : {rep.objectif}
                  </span>
                )}
              </>
            ) : (
              <>{modeRm ? ATTENTE_BI : <>{rep.sen && <>Séniorité {rep.sen} · </>}chiffres du mois non renseignés</>}</>
            )}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <button
        type="button"
        onClick={() => setPresentation(true)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-surface p-3 text-[14.5px] font-bold text-accent shadow-card hover:border-accent"
      >
        ▶ Mode présentation
        <span className="font-semibold text-faint">— l&apos;écran à montrer à {firstName(rep)}</span>
      </button>
      {presentation && (
        <Presentation
          rep={rep}
          month={month}
          moisPrecedent={moisPrecedent}
          fiche={fiche}
          engagements={engagementsPrecedents}
          onModifier={modifierEnDirect}
          onClose={() => setPresentation(false)}
        />
      )}

      <BriefAuto
        key={`brief|${month}|${rep.id}`} // clé propre à ce bloc : deux frères ne doivent jamais partager la même clé
        rep={rep}
        month={month}
        brief={fiche.brief}
        onModifierFiche={onModifierFiche}
        onToast={onToast}
      />

      {/* Pour démarrer l'entretien sur ce qui avait été promis le mois dernier. */}
      {engagementsPrecedents.length > 0 && (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
          <h3 className="mb-0.5 text-[15px] font-bold">
            Le mois dernier, {firstName(rep)} s&apos;était engagé(e) sur :
          </h3>
          <div className="mb-3 text-xs text-faint">
            1:1 de {moisPrecedent.toLowerCase()} · objectifs chiffrés comparés aux chiffres de {month.toLowerCase()}
          </div>
          <Engagements liste={engagementsPrecedents} onJuger={onJuger} />
        </section>
      )}

      {rep.hasKpis && (
        <>
          {modeRm ? (
            // Vue RM : l'analyse de l'équipe se replie, comme les courbes et les signaux faibles du Parcours.
            <Repli
              titre={analyseIa ? "Analyse de l'équipe (IA)" : "Analyse de l'équipe"}
              resume={`${analysis.S.length} succès · ${analysis.A.length} axe${analysis.A.length > 1 ? "s" : ""} · ${analysis.N.length} vigilance`}
              lien="Voir l'analyse"
            >
              <AnalyseIaBloc
                key={`analyse|${month}|${rep.id}`}
                analyseRegles={analyseRapide}
                analyse={analyseIa}
                disponible={rep.hasKpis}
                route="/api/analyse-tm"
                corps={{ tmId: rep.id, mois: month }}
                onRecue={garderAnalyse}
                avecTitre={false}
              />
            </Repli>
          ) : (
            <AnalyseIaBloc
              key={`analyse|${month}|${rep.id}`}
              analyseRegles={analyseRapide}
              analyse={analyseIa}
              disponible={rep.hasKpis}
              route="/api/analyse-commercial"
              corps={{ commercialId: rep.id, mois: month }}
              onRecue={garderAnalyse}
            />
          )}
          <KpiCharts rep={rep} />
        </>
      )}

      {/* Vue RM : les sales de ce TM dans le BI du mois (lecture seule), avec zoom et analyse par sales. */}
      {modeRm && rep.hasKpis && (
        <SalesDuTm
          key={`sales|${month}|${rep.id}`}
          tmId={rep.id}
          nomTm={rep.name}
          month={month}
          sales={modeRm.sales[rep.id] ?? []}
          analyses={fiche.analysesSales}
          onGarder={(cle, a) => onModifierFiche((f) => ({ ...f, analysesSales: { ...f.analysesSales, [cle]: a } }))}
        />
      )}

      {/* Vue RM : le roster de l'équipe (vraies fiches commerciaux), géré comme depuis l'accès TM. */}
      {modeRm && tmInfo && (
        <RosterEquipeTm
          key={`roster|${rep.id}`}
          tm={tmInfo}
          roster={modeRm.roster[rep.id] ?? { actifs: [], partis: [] }}
          onToast={onToast}
        />
      )}

      {/* KPIs à gauche, formulaire à droite (empilés sur mobile) */}
      <div className="grid grid-cols-1 items-start gap-[18px] min-[761px]:grid-cols-[300px_1fr]">
        <div className="min-[761px]:sticky min-[761px]:top-[130px]">
          {rep.hasKpis ? (
            modeRm ? (
              <KpiBoxTm
                donnees={modeRm.bi[rep.id] ?? {}}
                month={month}
                equipe={objectifsEquipe(effectifEquipe(modeRm, rep.id))}
              />
            ) : (
              <KpiBox rep={rep} month={month} />
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-3.5 text-[13px] text-muted">
              {modeRm ? (
                <>
                  <b className="font-semibold text-ink2">{ATTENTE_BI}</b> de {firstName(rep)}. Ses chiffres et
                  l&apos;analyse MOMENTO apparaîtront après l&apos;import.
                </>
              ) : (
                <>
                  Les KPIs de {month.toLowerCase()} ne sont pas encore renseignés. L&apos;analyse MOMENTO apparaîtra dès
                  qu&apos;ils seront importés ; tu peux déjà préparer la fiche 1:1.
                </>
              )}
            </div>
          )}
        </div>
        <OneOnOneForm
          key={`${month}|${rep.id}`}
          rep={rep}
          month={month}
          analysis={analysis}
          oo={fiche}
          onChange={onFicheChange}
          onToast={onToast}
        />
      </div>
    </>
  );
}
