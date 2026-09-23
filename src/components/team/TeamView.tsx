"use client";

import { useState } from "react";
import { firstName, orderReps, statut } from "@/lib/momento";
import type { Rep } from "@/lib/types";
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
          <div className="mt-0.5 text-[12.5px] text-muted">{st.why}</div>
        </div>
        <StatusPill status={st} />
      </button>
      {open && (
        <div className="border-t border-line2 px-[15px] pt-0.5 pb-[15px]">
          <div className="my-[13px] flex flex-wrap gap-[7px]">
            <Fact label="Niveau" value={rep.level} />
            <Fact label="Ventes" value={`${rep.ventes}/${rep.budget}`} />
            <Fact label="Installs" value={`${rep.install}/${rep.budget}`} />
            <Fact label="POS" value={rep.posSales} />
            <Fact label="OG" value={rep.og} />
          </div>
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
  reps,
  month,
  onOpenOneOnOne,
}: {
  reps: Rep[];
  month: string;
  onOpenOneOnOne: (repId: string) => void;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const ok = reps.filter((r) => statut(r).k === "ok").length;
  const acc = reps.filter((r) => statut(r).k === "acc").length;

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
      <PageTitle kicker="Marseille Nord" title="Qui a besoin de toi" month={month} />
      <div className="mb-4 flex gap-2.5">
        <StatCard value={ok} label="En forme" valueClass="text-good" />
        <StatCard value={reps.length - ok - acc} label="À surveiller" />
        <StatCard value={acc} label="À accompagner" valueClass="text-bad" />
      </div>
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
