"use client";

import { type ReactNode, useState } from "react";
import { firstName, orderReps, statut } from "@/lib/momento";
import type { Rep, StatusKey } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatusPill } from "@/components/ui/StatusPill";

function StatCard({ value, label, valueClass = "" }: { value: number; label: string; valueClass?: string }) {
  return (
    <div className="flex-1 rounded-[14px] border border-line bg-surface px-3.5 py-[13px] shadow-card">
      <div className={`font-display text-[23px] font-bold leading-none ${valueClass}`}>{value}</div>
      <div className="mt-1.5 text-[11.5px] font-semibold text-muted">{label}</div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-[14px] border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold">
      {label} <b className="font-bold">{value}</b>
    </span>
  );
}

function LeadCard({
  rep,
  open,
  onToggle,
  onOpenOneOnOne,
}: {
  rep: Rep;
  open: boolean;
  onToggle: () => void;
  onOpenOneOnOne: () => void;
}) {
  const st = statut(rep);
  const edge = st.k === "acc" ? "border-l-[3px] border-l-bad" : st.k === "ok" ? "border-l-[3px] border-l-good" : "";

  return (
    <div className={`overflow-hidden rounded-[15px] border border-line bg-surface shadow-card ${edge}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-[13px] px-[15px] py-3.5 text-left"
      >
        <Avatar initials={rep.initials} />
        <div className="min-w-0 flex-1">
          <div className="text-[15.5px] font-bold">{rep.name}</div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {rep.hasKpis
              ? st.why
              : [rep.sen ? `Séniorité ${rep.sen}` : "Séniorité non renseignée", rep.partial && "ventes ou installs à saisir"]
                  .filter(Boolean)
                  .join(" · ")}
          </div>
        </div>
        <StatusPill status={st} />
      </button>
      {open && (
        <div className="border-t border-line2 px-[15px] pt-0.5 pb-[15px]">
          {rep.hasKpis ? (
            <div className="my-[13px] flex flex-wrap gap-[7px]">
              <Fact label="Niveau" value={rep.level} />
              <Fact label="Ventes" value={`${rep.ventes}/${rep.budget}`} />
              <Fact label="Installs" value={`${rep.install}/${rep.budget}`} />
              <Fact label="POS" value={rep.posSales} />
              <Fact label="OG" value={rep.og} />
            </div>
          ) : (
            <div className="my-[13px] flex flex-wrap items-center gap-[7px]">
              <Fact label="Séniorité" value={rep.sen || "—"} />
              <span className="text-xs text-faint">
                {rep.partial
                  ? "Chiffres commencés : saisis ventes et installs pour voir son statut."
                  : "Ventes, installs, POS… non renseignés pour ce mois."}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onOpenOneOnOne}
            className="w-full rounded-[11px] bg-ink p-3 text-sm font-bold text-white"
          >
            Préparer le 1:1 de {firstName(rep)}
          </button>
        </div>
      )}
    </div>
  );
}

export function TeamView({
  equipe,
  reps,
  month,
  onOpenOneOnOne,
}: {
  equipe: string | null;
  reps: Rep[];
  month: string;
  onOpenOneOnOne: (repId: string) => void;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const count = (k: StatusKey) => reps.filter((r) => statut(r).k === k).length;
  const withKpis = reps.some((r) => r.hasKpis);
  const missing = reps.filter((r) => !r.hasKpis).length;

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-[600px]">
      <PageTitle kicker={equipe ?? "Mon équipe"} title="Qui a besoin de toi" month={month} />
      {reps.length === 0 && <Notice>Aucun commercial actif n&apos;est encore rattaché à ton compte.</Notice>}
      {withKpis && (
        <div className="mb-4 flex gap-2.5">
          <StatCard value={count("ok")} label="En forme" valueClass="text-good" />
          <StatCard value={count("watch")} label="À surveiller" />
          <StatCard value={count("acc")} label="À accompagner" valueClass="text-bad" />
        </div>
      )}
      {withKpis && missing > 0 && (
        <Notice>
          {missing} commercia{missing > 1 ? "ux" : "l"} sans chiffres pour {month.toLowerCase()} : saisis-les dans l&apos;onglet
          Chiffres.
        </Notice>
      )}
      {reps.length > 0 && !withKpis && (
        <Notice>
          Les chiffres de {month.toLowerCase()} ne sont pas encore renseignés. Ton équipe est bien là ; les
          statuts apparaîtront dès que tu les auras saisis dans l&apos;onglet Chiffres.
        </Notice>
      )}
      <div className="flex flex-col gap-[9px]">
        {orderReps(reps).map((rep) => (
          <LeadCard
            key={rep.id}
            rep={rep}
            open={openIds.has(rep.id)}
            onToggle={() => toggle(rep.id)}
            onOpenOneOnOne={() => onOpenOneOnOne(rep.id)}
          />
        ))}
      </div>
    </div>
  );
}
