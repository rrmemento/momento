"use client";

import { useState, type ReactNode } from "react";
import { sujetRempli, type BriefReponse } from "@/lib/brief";
import { SUJETS_MAX } from "@/lib/entretien-contenu";
import { libelleObjectifChiffre } from "@/lib/kpis";
import { firstName } from "@/lib/momento";
import type { BriefIa, OneOnOne, Rep, Subject } from "@/lib/types";
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
  onModifierFiche,
  onToast,
}: {
  rep: Rep;
  month: string;
  brief: BriefIa | null;
  onModifierFiche: (change: (fiche: OneOnOne) => OneOnOne) => void;
  onToast: (message: string) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Sujets proposés par l'IA, en attente de ton choix parce que la fiche contient déjà des sujets remplis.
  const [propositions, setPropositions] = useState<Subject[] | null>(null);

  const nb = (n: number) => `${n} sujet${n > 1 ? "s" : ""}`;

  // Le brief est toujours enregistré ; les sujets sont insérés tout de suite si la fiche n'en a aucun de rempli.
  function recevoir(brief: BriefIa, sujets: Subject[]) {
    let aChoisir = false;
    onModifierFiche((f) => {
      aChoisir = f.sujets.some(sujetRempli);
      return aChoisir ? { ...f, brief } : { ...f, brief, sujets };
    });
    setPropositions(aChoisir ? sujets : null);
    const s = sujets.length > 1 ? "s" : "";
    onToast(
      aChoisir
        ? "Brief prêt ✓ — choisis quoi faire des sujets proposés"
        : `Brief prêt ✓ — ${nb(sujets.length)} pré-rempli${s} ci-dessous`,
    );
  }

  function inserer(mode: "ajouter" | "remplacer") {
    if (!propositions) return;
    onModifierFiche((f) => ({
      ...f,
      sujets:
        mode === "remplacer" ? propositions : [...f.sujets.filter(sujetRempli), ...propositions].slice(0, SUJETS_MAX),
    }));
    const s = propositions.length > 1 ? "s" : "";
    onToast(
      mode === "remplacer" ? "Sujets remplacés par ceux de l'IA" : `${nb(propositions.length)} ajouté${s} à la suite`,
    );
    setPropositions(null);
  }

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
      if (data?.ok) recevoir(data.brief, data.sujets);
      else setErreur(data?.error ?? "Le brief n'a pas pu être préparé. Réessaie.");
    } catch {
      setErreur("Connexion impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  // Des sujets sont déjà remplis : l'IA ne les écrase pas, c'est toi qui choisis.
  const choix = propositions && (
    <div className="rounded-xl border border-warn-line bg-warn-soft p-3 text-[13px]">
      <div className="font-semibold text-ink">
        L&apos;IA propose {nb(propositions.length)}, mais ta fiche contient déjà des sujets remplis.
      </div>
      <ul className="mt-1.5 mb-2.5 flex flex-col gap-0.5 text-[12.5px] text-ink2">
        {propositions.map((s, k) => (
          <li key={k}>
            • {s.t}
            {s.cible && <span className="text-muted"> — {libelleObjectifChiffre(s.cible)}</span>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => inserer("ajouter")}
          className="rounded-[9px] bg-accent px-3 py-1.5 text-[12.5px] font-bold text-white"
        >
          Ajouter à la suite
        </button>
        <button
          type="button"
          onClick={() => inserer("remplacer")}
          className="rounded-[9px] border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink"
        >
          Remplacer mes sujets
        </button>
        <button
          type="button"
          onClick={() => setPropositions(null)}
          className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-ink"
        >
          Ne pas les ajouter
        </button>
      </div>
    </div>
  );

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
              L&apos;IA prépare l&apos;entretien avec {firstName(rep)} et pré-remplit 2 à 3 sujets, à partir des
              chiffres, de l&apos;analyse MOMENTO et des engagements du mois dernier.
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
          title="Refait le brief et propose de nouveaux sujets (sans écraser les tiens sans te demander)"
          className="rounded-lg border border-accent/30 bg-surface px-2.5 py-[5px] text-[11.5px] font-bold text-accent disabled:opacity-60"
        >
          {enCours ? "Régénération…" : "↻ Régénérer"}
        </button>
      </div>
      {choix && <div className="px-3.5 pt-3.5">{choix}</div>}
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
