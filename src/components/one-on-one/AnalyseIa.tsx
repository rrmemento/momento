"use client";

import { useState } from "react";
import type { AnalyseIaReponse } from "@/lib/brief-tm";
import type { AnalyseIa, Analysis } from "@/lib/types";
import { MomentoSees } from "./MomentoSees";

// « lundi 29 septembre à 14:05 », heure de Paris.
const dateAnalyse = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

// L'analyse d'une personne. À l'ouverture : l'analyse RAPIDE (règles MOMENTO), immédiate, sans aucun appel IA.
// L'analyse « data analyst » (IA) est OPTIONNELLE : générée seulement au clic, puis GARDÉE dans la fiche (comme le
// brief) et régénérable. Dans les deux cas, la gravité des points suit les règles MOMENTO.
export function AnalyseIaBloc({
  analyseRegles,
  analyse,
  disponible,
  route,
  corps,
  onRecue,
  avecTitre = true,
}: {
  analyseRegles: Analysis; // l'analyse rapide (règles), toujours prête
  analyse: AnalyseIa | null; // l'analyse IA gardée (null = jamais demandée)
  disponible: boolean; // false tant que les chiffres du mois ne sont pas là
  route: string; // /api/analyse-commercial, /api/analyse-tm ou /api/analyse-sales-rm
  corps: Record<string, unknown>;
  onRecue: (analyse: AnalyseIa) => void; // à garder (fiche du 1:1)
  avecTitre?: boolean;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [voirRegles, setVoirRegles] = useState(false); // revenir à l'analyse rapide quand l'IA existe

  async function generer() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const data = (await res.json().catch(() => null)) as AnalyseIaReponse | null;
      if (data?.ok) {
        onRecue(data.analyseIa);
        setVoirRegles(false);
      } else setErreur(data?.error ?? "L'analyse n'a pas pu être établie. Réessaie.");
    } catch {
      setErreur("Connexion impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  if (!disponible) return null;
  const montreIa = analyse && !voirRegles;
  const lien = "font-semibold text-accent underline-offset-2 hover:underline";
  return (
    <div className="mb-[22px]" aria-busy={enCours}>
      <div className={enCours ? "opacity-60" : ""}>
        <MomentoSees analysis={montreIa ? analyse.analyse : analyseRegles} avecTitre={avecTitre} />
      </div>
      <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-faint">
        <span>
          {montreIa ? `Analyse data analyst (IA) du ${dateAnalyse(analyse.genereLe)}` : "Analyse rapide (règles MOMENTO)"}
        </span>
        {analyse && (
          <button type="button" onClick={() => setVoirRegles((v) => !v)} className={lien}>
            {voirRegles ? "Voir l'analyse IA" : "Voir l'analyse rapide"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void generer()}
          disabled={enCours}
          className="ml-auto rounded-lg border border-accent/30 bg-surface px-2.5 py-[5px] text-[11.5px] font-bold text-accent disabled:opacity-60"
        >
          {enCours
            ? "Analyse IA en cours… (jusqu'à 1 min)"
            : analyse
              ? "↻ Régénérer l'analyse IA"
              : "✦ Analyse data analyst (IA)"}
        </button>
      </div>
      {erreur && (
        <div role="alert" className="mt-2 rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
          {erreur}
        </div>
      )}
    </div>
  );
}
