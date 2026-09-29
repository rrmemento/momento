"use client";

import { useState } from "react";
import type { SignalFaible } from "@/lib/parcours-analyse";
import type { SignauxIaReponse } from "@/lib/parcours-ia";
import type { SignauxIa } from "@/lib/types";
import { Button } from "@/components/ui/Button";

// « mardi 29 septembre à 14:05 », heure de Paris.
const dateAnalyse = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

// 1. Les règles MOMENTO, calculées d'office.
function SignauxRegles({ signaux, prenom }: { signaux: SignalFaible[]; prenom: string }) {
  if (!signaux.length) {
    return (
      <div className="rounded-[14px] border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
        Aucun signal faible repéré par les règles MOMENTO sur le parcours de {prenom}.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {signaux.map((s) => (
        <li key={s.cle} className="flex gap-3 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-2.5">
          <span className="font-bold text-warn" aria-hidden="true">
            ⚠
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-ink">{s.titre}</div>
            <div className="mt-0.5 text-[12.5px] text-ink2">{s.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// 2. L'analyse IA, à la demande : gardée dans le 1:1 du mois en cours, « Régénérer » pour la refaire.
function AnalyseIa({
  repId,
  prenom,
  analyse,
  onAnalyse,
}: {
  repId: string;
  prenom: string;
  analyse: SignauxIa | null;
  onAnalyse: (analyse: SignauxIa) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function analyser() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/parcours-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commercialId: repId }),
      });
      const data = (await res.json().catch(() => null)) as SignauxIaReponse | null;
      if (data?.ok) onAnalyse(data.signauxIa);
      else setErreur(data?.error ?? "L'analyse n'a pas pu être faite. Réessaie.");
    } catch {
      setErreur("Connexion impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-accent/25 bg-surface shadow-card" aria-busy={enCours}>
      <div className="flex flex-wrap items-center gap-2.5 rounded-t-2xl bg-accent-soft px-3.5 py-3">
        <div className="grid size-[26px] flex-none place-items-center rounded-lg bg-accent">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" fill="#fff" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-accent">Analyse IA</h3>
          <div className="text-[11.5px] text-muted">
            {analyse
              ? `Faite le ${dateAnalyse(analyse.genereLe)}`
              : `Ce que les règles ne voient pas : ressenti, blocages qui reviennent, engagements, énergie de ${prenom}.`}
          </div>
        </div>
        {analyse && (
          <button
            type="button"
            onClick={analyser}
            disabled={enCours}
            className="rounded-lg border border-accent/30 bg-surface px-2.5 py-[5px] text-[11.5px] font-bold text-accent disabled:opacity-60"
          >
            {enCours ? "Analyse…" : "↻ Régénérer"}
          </button>
        )}
      </div>
      <div className="p-3.5">
        {analyse ? (
          <ol className={`flex flex-col gap-3 ${enCours ? "opacity-50" : ""}`}>
            {analyse.signaux.map((s, k) => (
              <li key={k} className="border-t border-line2 pt-3 first:border-t-0 first:pt-0">
                <div className="text-[14px] font-bold text-ink">
                  {k + 1}. {s.titre}
                </div>
                <div className="mt-1 text-[13px] leading-[1.55] text-ink2">{s.constat}</div>
                <div className="mt-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] text-ink">
                  <b className="font-semibold text-accent">À faire :</b> {s.action}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Button onClick={analyser} disabled={enCours} className="disabled:opacity-60">
            {enCours ? "Analyse du parcours… (jusqu'à 1 min)" : "✦ Analyser avec l'IA"}
          </Button>
        )}
        {erreur && (
          <div role="alert" className="mt-3 rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
            {erreur}
          </div>
        )}
      </div>
    </div>
  );
}

// « Signaux faibles » : ce qui mérite ton attention en premier.
export function SignauxFaibles({
  repId,
  prenom,
  regles,
  analyseIa,
  onAnalyseIa,
}: {
  repId: string;
  prenom: string;
  regles: SignalFaible[];
  analyseIa: SignauxIa | null;
  onAnalyseIa: (analyse: SignauxIa) => void;
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-0.5 text-[20px] font-bold">Signaux faibles</h2>
      <p className="mb-2.5 text-[12px] text-faint">
        Règles MOMENTO, calculées automatiquement. Le mois en cours n&apos;est pas compté pour les volumes : il n&apos;est
        pas terminé.
      </p>
      <SignauxRegles signaux={regles} prenom={prenom} />
      <AnalyseIa key={repId} repId={repId} prenom={prenom} analyse={analyseIa} onAnalyse={onAnalyseIa} />
    </section>
  );
}
