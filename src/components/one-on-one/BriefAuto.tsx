"use client";

import { useState, type ReactNode } from "react";
import type { BriefReponse } from "@/lib/brief";
import { firstName } from "@/lib/momento";
import type { BriefIa, Rep } from "@/lib/types";
import { Button } from "@/components/ui/Button";

// « lundi 29 septembre à 14:05 », heure de Paris.
const dateBrief = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

function Rubrique({ titre, ton, children }: { titre: string; ton: string; children: ReactNode }) {
  return (
    <div className="border-t border-line2 pt-3 first:border-t-0 first:pt-0">
      <div className={`mb-1 text-[11.5px] font-bold uppercase tracking-[0.03em] ${ton}`}>{titre}</div>
      <div className="text-[13.5px] leading-[1.55] text-ink2">{children}</div>
    </div>
  );
}

function Eclair() {
  return (
    <div className="grid size-[26px] flex-none place-items-center rounded-lg bg-accent">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" fill="#fff" />
      </svg>
    </div>
  );
}

// Le « Brief auto » en haut du One-on-One : Gemini prépare l'entretien, le brief est gardé dans la fiche.
export function BriefAuto({
  rep,
  month,
  brief,
  onBrief,
}: {
  rep: Rep;
  month: string;
  brief: BriefIa | null;
  onBrief: (brief: BriefIa) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function preparer() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/brief-1on1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commercialId: rep.id, mois: month }),
      });
      const data = (await res.json().catch(() => null)) as BriefReponse | null;
      if (data?.ok) onBrief(data.brief);
      else setErreur(data?.error ?? "Le brief n'a pas pu être préparé. Réessaie.");
    } catch {
      setErreur("Connexion impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  const alerte = erreur && (
    <div role="alert" className="mt-3 rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
      {erreur}
    </div>
  );

  // Pas encore de brief : le bouton seul.
  if (!brief) {
    return (
      <section className="mb-4 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
        <div className="mb-3 flex items-center gap-[9px]">
          <Eclair />
          <div>
            <h3 className="text-base font-bold">Brief auto</h3>
            <div className="text-xs text-faint">
              L&apos;IA prépare l&apos;entretien avec {firstName(rep)} : chiffres, analyse MOMENTO et engagements du mois
              dernier.
            </div>
          </div>
        </div>
        <Button onClick={preparer} disabled={enCours || !rep.hasKpis} className="disabled:opacity-60">
          {enCours ? "Préparation du brief… (jusqu'à 1 min)" : "✦ Préparer le 1:1 (IA)"}
        </Button>
        {!rep.hasKpis && (
          <div className="mt-2 text-center text-xs text-faint">
            Disponible dès que les ventes et les installations de {month.toLowerCase()} sont saisies.
          </div>
        )}
        {alerte}
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-2xl border border-accent/25 bg-surface shadow-card" aria-busy={enCours}>
      <div className="flex flex-wrap items-center gap-[9px] rounded-t-2xl bg-accent-soft px-3.5 py-3">
        <Eclair />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-accent">Brief auto · {firstName(rep)}</h3>
          <div className="text-[11.5px] text-muted">Préparé par l&apos;IA le {dateBrief(brief.genereLe)}</div>
        </div>
        <button
          type="button"
          onClick={preparer}
          disabled={enCours}
          className="rounded-lg border border-accent/30 bg-surface px-2.5 py-[5px] text-[11.5px] font-bold text-accent disabled:opacity-60"
        >
          {enCours ? "Régénération…" : "↻ Régénérer"}
        </button>
      </div>
      <div className={`flex flex-col gap-3 p-3.5 ${enCours ? "opacity-50" : ""}`}>
        <Rubrique titre="Comment l'aborder" ton="text-accent">
          {brief.aborder}
        </Rubrique>
        {brief.celebrer.length > 0 && (
          <Rubrique titre="✦ À célébrer" ton="text-good">
            <ul className="flex flex-col gap-1">
              {brief.celebrer.map((c, k) => (
                <li key={k} className="flex gap-2">
                  <span className="text-good">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Rubrique>
        )}
        <Rubrique titre="Engagements du mois dernier" ton="text-muted">
          {brief.engagements || <span className="text-faint">Aucun engagement noté au 1:1 précédent.</span>}
        </Rubrique>
        <Rubrique titre="↗ Le sujet à ouvrir" ton="text-warn">
          {brief.sujet}
        </Rubrique>
        <Rubrique titre="Question à poser" ton="text-accent">
          <div className="rounded-xl border-l-[3px] border-accent bg-accent-soft px-3 py-2 font-semibold text-ink">
            « {brief.question} »
          </div>
        </Rubrique>
        {alerte}
      </div>
    </section>
  );
}
