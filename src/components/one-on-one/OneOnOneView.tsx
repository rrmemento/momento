import { analyse, statut } from "@/lib/momento";
import type { Rep } from "@/lib/types";
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
  onSelectRep,
  onToast,
}: {
  reps: Rep[];
  rep: Rep;
  month: string;
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
            {rep.level} · pace ventes {paceText(rep.vPace, rep.vAtt)} · pace installs {paceText(rep.iPace, rep.iAtt)}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <MomentoSees analysis={analysis} />
      <KpiCharts rep={rep} />

      {/* KPIs à gauche, formulaire à droite (empilés sur mobile) */}
      <div className="grid grid-cols-1 items-start gap-[18px] min-[761px]:grid-cols-[300px_1fr]">
        <div className="min-[761px]:sticky min-[761px]:top-[130px]">
          <KpiBox rep={rep} month={month} />
        </div>
        <OneOnOneForm key={`${month}|${rep.id}`} rep={rep} month={month} analysis={analysis} onToast={onToast} />
      </div>
    </>
  );
}
