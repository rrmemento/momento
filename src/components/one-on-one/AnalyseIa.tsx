"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyseIaReponse } from "@/lib/brief-tm";
import type { AnalyseIa } from "@/lib/types";
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

// L'analyse UNIQUE « data analyst » (IA) d'une personne : affichée directement, générée automatiquement à la première
// ouverture puis GARDÉE (aucun appel IA aux ouvertures suivantes), avec un bouton « Régénérer » qui la remplace.
// La gravité des points (succès / axe / vigilance) est fixée côté serveur par les règles MOMENTO.
export function AnalyseIaBloc({
  analyse,
  disponible,
  route,
  corps,
  onRecue,
  avecTitre = true,
}: {
  analyse: AnalyseIa | null; // l'analyse gardée (null = pas encore générée)
  disponible: boolean; // false tant que les chiffres du mois ne sont pas là : rien n'est généré
  route: string; // /api/analyse-commercial, /api/analyse-tm ou /api/analyse-sales-rm
  corps: Record<string, unknown>;
  onRecue: (analyse: AnalyseIa) => void; // à garder (fiche du 1:1)
  avecTitre?: boolean;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const lance = useRef(false); // une seule génération automatique par ouverture (même en double rendu de dev)

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
      if (data?.ok) onRecue(data.analyseIa);
      else setErreur(data?.error ?? "L'analyse n'a pas pu être établie. Réessaie.");
    } catch {
      setErreur("Connexion impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  // Dès l'ouverture : générée une fois si elle n'existe pas encore.
  useEffect(() => {
    if (analyse || !disponible || lance.current) return;
    lance.current = true;
    void generer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois par ouverture
  }, [analyse, disponible]);

  if (!disponible) return null;
  return (
    <div className="mb-[22px]" aria-busy={enCours}>
      {analyse ? (
        <div className={enCours ? "opacity-50" : ""}>
          <MomentoSees analysis={analyse.analyse} avecTitre={avecTitre} />
        </div>
      ) : (
        <div className="mb-3 rounded-2xl border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
          {enCours ? "Analyse data analyst en cours… (jusqu'à 1 min)" : "L'analyse n'a pas encore pu être établie."}
        </div>
      )}
      <div className="-mt-3 flex flex-wrap items-center gap-2 text-[12px] text-faint">
        {analyse && <span>Analyse data analyst (IA) du {dateAnalyse(analyse.genereLe)}</span>}
        <button
          type="button"
          onClick={() => void generer()}
          disabled={enCours}
          className="ml-auto rounded-lg border border-accent/30 bg-surface px-2.5 py-[5px] text-[11.5px] font-bold text-accent disabled:opacity-60"
        >
          {enCours ? "Analyse…" : analyse ? "↻ Régénérer" : "↻ Réessayer"}
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
