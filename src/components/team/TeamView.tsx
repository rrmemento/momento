"use client";

import { useState, useTransition } from "react";
import { desactiverCommercial, renommerCommercial } from "@/app/actions/commerciaux";
import { firstName, orderReps } from "@/lib/momento";
import { formatJour } from "@/lib/mois";
import { libelleAjuste } from "@/lib/mois-special";
import type { OneOnOne, Rep, StatusKey } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { StatCard } from "@/components/ui/StatCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { ATTENTE_BI, useModeRm, useStatutAffiche } from "@/components/ModeRm";
import { CommercialForm } from "./CommercialForm";
import { Demarrage } from "./Demarrage";

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold">
      {label} <b className="font-bold">{value}</b>
    </span>
  );
}

// Renommer (ex. corriger « Djimmy » en « Jimmy ») ou retirer de l'équipe, sans toucher à l'historique.
function GestionCommercial({ rep, onToast }: { rep: Rep; onToast: (message: string) => void }) {
  const [renommage, setRenommage] = useState(false);
  const [nom, setNom] = useState(rep.name);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function renommer(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await renommerCommercial(rep.id, nom);
      if (result.ok) {
        setRenommage(false);
        onToast(`Nom corrigé : ${nom.trim().replace(/\s+/g, " ")}`);
      } else setError(result.error);
    });
  }

  function retirer() {
    if (
      !window.confirm(
        `Retirer ${rep.name} de ton équipe ?\n\n${rep.name} n'apparaîtra plus dans MOMENTO, mais ses chiffres passés sont conservés.`,
      )
    ) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await desactiverCommercial(rep.id);
      if (result.ok) onToast(`Retrait de l'équipe : ${rep.name}`);
      else setError(result.error);
    });
  }

  const lien = "rounded-[9px] px-2 py-1.5 text-[12px] font-semibold text-muted hover:text-ink disabled:opacity-50";
  return (
    <div className="mt-2.5">
      {renommage ? (
        <form onSubmit={renommer} className="flex items-center gap-2">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            aria-label={`Nouveau nom de ${rep.name}`}
            autoFocus
            maxLength={60}
            className="min-w-0 flex-1 rounded-[9px] border border-line bg-field px-2.5 py-1.5 text-base focus:border-accent focus:bg-white focus:outline-none sm:text-[13px]"
          />
          <button
            type="submit"
            disabled={pending || !nom.trim()}
            className="rounded-[9px] bg-ink px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
          >
            {pending ? "…" : "Valider"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRenommage(false);
              setNom(rep.name);
              setError("");
            }}
            className={lien}
          >
            Annuler
          </button>
        </form>
      ) : (
        <div className="flex justify-end gap-1">
          <button type="button" onClick={() => setRenommage(true)} disabled={pending} className={lien}>
            Renommer
          </button>
          <button type="button" onClick={retirer} disabled={pending} className={`${lien} hover:text-bad!`}>
            {pending ? "Retrait…" : "Retirer de l'équipe"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-[12px] font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function LeadCard({
  rep,
  open,
  onToggle,
  onOpenOneOnOne,
  onToast,
  clotureLe,
}: {
  rep: Rep;
  open: boolean;
  onToggle: () => void;
  onOpenOneOnOne: () => void;
  onToast: (message: string) => void;
  clotureLe: string | null; // date de clôture du 1:1 du mois, null = à faire
}) {
  const modeRm = useModeRm();
  const st = useStatutAffiche()(rep);
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
            {rep.hasKpis || modeRm
              ? st.why
              : [rep.sen ? `Séniorité ${rep.sen}` : "Séniorité non renseignée", rep.partial && "ventes ou installs à saisir"]
                  .filter(Boolean)
                  .join(" · ")}
          </div>
          <div className={`mt-1 text-[12px] font-semibold ${clotureLe ? "text-good" : "text-faint"}`}>
            {clotureLe ? `✓ 1:1 fait le ${formatJour(clotureLe)}` : "1:1 à faire"}
          </div>
        </div>
        <StatusPill status={st} />
      </button>
      {open && (
        <div className="border-t border-line2 px-[15px] pt-0.5 pb-[15px]">
          {rep.hasKpis ? (
            <div className="my-[13px] flex flex-wrap gap-[7px]">
              {!modeRm && <Fact label="Niveau" value={rep.level} />}
              <Fact label="Ventes" value={`${rep.ventes}/${rep.objectif}`} />
              <Fact label="Installs" value={`${rep.install}/${rep.objectif}`} />
              {rep.special && <span className="self-center text-xs font-semibold text-warn">{libelleAjuste(rep.special)}</span>}
              <Fact label="POS" value={rep.posSales} />
              <Fact label="OG" value={rep.og} />
            </div>
          ) : modeRm ? (
            <div className="my-[13px] text-xs text-faint">{ATTENTE_BI} de {firstName(rep)}.</div>
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
          {!modeRm && (
            <>
              <Demarrage key={`${rep.fiche.sen}|${rep.fiche.demarrage ?? ""}`} rep={rep} onToast={onToast} />
              <GestionCommercial key={rep.name} rep={rep} onToast={onToast} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamView({
  equipe,
  reps,
  month,
  entretiens,
  onOpenOneOnOne,
  onToast,
}: {
  equipe: string | null;
  reps: Rep[];
  month: string;
  entretiens: Record<string, OneOnOne>; // commercial → fiche 1:1 du mois affiché
  onOpenOneOnOne: (repId: string) => void;
  onToast: (message: string) => void;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [ajout, setAjout] = useState(false);
  const modeRm = useModeRm();
  const statutAffiche = useStatutAffiche();
  const count = (k: StatusKey) => reps.filter((r) => statutAffiche(r).k === k).length;
  const withKpis = reps.some((r) => statutAffiche(r).k !== "none"); // = des chiffres saisis (vue RM : ceux de son équipe)
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
      {reps.length === 0 && (
        <Notice>
          {modeRm ? "Aucun TM n'est encore rattaché à ton compte." : <>Aucun commercial actif n&apos;est encore rattaché à ton compte.</>}
        </Notice>
      )}
      {withKpis && (
        <div className="mb-4 flex gap-2.5">
          <StatCard value={count("ok")} label="En forme" valueClass="text-good" />
          <StatCard value={count("watch")} label="À surveiller" />
          <StatCard value={count("acc")} label="À accompagner" valueClass="text-bad" />
        </div>
      )}
      {!modeRm && withKpis && missing > 0 && (
        <Notice>
          {missing} commercia{missing > 1 ? "ux" : "l"} sans chiffres pour {month.toLowerCase()} : importe-les ou
          saisis-les dans l&apos;onglet Import &amp; chiffres.
        </Notice>
      )}
      {!modeRm && reps.length > 0 && !withKpis && (
        <Notice>
          Les chiffres de {month.toLowerCase()} ne sont pas encore renseignés. Ton équipe est bien là ; les
          statuts apparaîtront dès que tu les auras importés ou saisis dans l&apos;onglet
          Import &amp; chiffres.
        </Notice>
      )}
      <div className="flex flex-col gap-[9px]">
        {orderReps(reps, statutAffiche).map((rep) => (
          <LeadCard
            key={rep.id}
            rep={rep}
            open={openIds.has(rep.id)}
            onToggle={() => toggle(rep.id)}
            onOpenOneOnOne={() => onOpenOneOnOne(rep.id)}
            onToast={onToast}
            clotureLe={entretiens[rep.id]?.clotureLe ?? null}
          />
        ))}
      </div>
      {/* Toujours affiché en bas de la liste, même si l'équipe est vide (pas en vue RM : les TM se rattachent dans Supabase). */}
      {!modeRm && (
        <div className="mt-4">
          {ajout ? (
            <CommercialForm
              onCreated={(_, nom) => {
                setAjout(false);
                onToast(`Nouveau dans l'équipe : ${nom}`);
              }}
              onCancel={() => setAjout(false)}
            />
          ) : (
            <Button onClick={() => setAjout(true)}>+ Ajouter un commercial</Button>
          )}
        </div>
      )}
    </div>
  );
}
