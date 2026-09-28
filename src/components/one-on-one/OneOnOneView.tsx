import { analyse, statut } from "@/lib/momento";
import type { OneOnOne, Rep } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatusPill } from "@/components/ui/StatusPill";
import { KpiBox } from "./KpiBox";
import { KpiCharts } from "./KpiCharts";
import { MomentoSees } from "./MomentoSees";
import { OneOnOneForm } from "./OneOnOneForm";
import { RepPicker } from "./RepPicker";

const paceText = (pace: number | null, attainment: number) =>
  pace != null ? pace + " %" : Math.round(attainment * 100) + " %";

export function OneOnOneView({
  reps,
  rep,
  month,
  fiche,
  onFicheChange,
  onSelectRep,
  onToast,
}: {
  reps: Rep[];
  rep: Rep;
  month: string;
  fiche: OneOnOne;
  onFicheChange: (fiche: OneOnOne) => void;
  onSelectRep: (repId: string) => void;
  onToast: (message: string) => void;
}) {
  const analysis = analyse(rep);
  const status = statut(rep);

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
                {rep.level} · pace ventes {paceText(rep.vPace, rep.vAtt)} · pace installs {paceText(rep.iPace, rep.iAtt)}
              </>
            ) : (
              <>{rep.sen && <>Séniorité {rep.sen} · </>}chiffres du mois non renseignés</>
            )}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {rep.hasKpis && (
        <>
          <MomentoSees analysis={analysis} />
          <KpiCharts rep={rep} />
        </>
      )}

      {/* KPIs à gauche, formulaire à droite (empilés sur mobile) */}
      <div className="grid grid-cols-1 items-start gap-[18px] min-[761px]:grid-cols-[300px_1fr]">
        <div className="min-[761px]:sticky min-[761px]:top-[130px]">
          {rep.hasKpis ? (
            <KpiBox rep={rep} month={month} />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-3.5 text-[13px] text-muted">
              Les KPIs de {month.toLowerCase()} ne sont pas encore renseignés. L&apos;analyse MOMENTO apparaîtra dès
              qu&apos;ils seront importés ; tu peux déjà préparer la fiche 1:1.
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
