"use client";

import { useState } from "react";
import type { KpiDonnees } from "@/lib/kpis";
import { orderReps } from "@/lib/momento";
import { compter, engagements, type SuiviManuel } from "@/lib/suivi";
import type { OneOnOne, Rep } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Notice } from "@/components/ui/Notice";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatCard } from "@/components/ui/StatCard";
import { Engagements } from "./Engagements";

// L'onglet Suivi : les engagements pris au 1:1 du mois précédent, confrontés aux chiffres du mois affiché.
export function SuiviView({
  reps,
  month,
  moisPrecedent,
  fichesPrecedentes,
  kpis,
  onJuger,
  onOpenOneOnOne,
}: {
  reps: Rep[];
  month: string;
  moisPrecedent: string;
  fichesPrecedentes: Record<string, OneOnOne>; // commercial → fiche 1:1 du mois précédent
  kpis: Record<string, KpiDonnees>; // commercial → chiffres du mois affiché
  onJuger: (repId: string, index: number, suivi: SuiviManuel | null) => void;
  onOpenOneOnOne: (repId: string) => void;
}) {
  const [filtre, setFiltre] = useState(""); // "" = tous les commerciaux

  const parRep = orderReps(reps).map((rep) => ({ rep, liste: engagements(fichesPrecedentes[rep.id], kpis[rep.id]) }));
  const affiches = parRep.filter((x) => !filtre || x.rep.id === filtre);
  const avec = affiches.filter((x) => x.liste.length);
  const sans = affiches.filter((x) => !x.liste.length);
  const c = compter(avec.flatMap((x) => x.liste));

  return (
    <div className="mx-auto max-w-[600px]">
      <PageTitle kicker={`Engagements du 1:1 de ${moisPrecedent.toLowerCase()}`} title="Suivi" month={month} />

      <div className="mb-4 flex gap-2.5">
        <StatCard value={c.total} label={c.total > 1 ? "Engagements" : "Engagement"} />
        <StatCard value={c.tenus} label={c.tenus > 1 ? "Tenus" : "Tenu"} valueClass="text-good" />
        <StatCard value={c.nonTenus} label={c.nonTenus > 1 ? "Non tenus" : "Non tenu"} valueClass="text-bad" />
        <StatCard value={c.aJuger} label="À juger" />
      </div>
      {(c.enCours > 0 || c.manquants > 0) && (
        <div className="-mt-2 mb-4 text-[12.5px] text-muted">
          {[
            c.enCours > 0 && `${c.enCours} en cours`,
            c.manquants > 0 &&
              `${c.manquants} en attente des chiffres de ${month.toLowerCase()} (onglet Chiffres ou Import)`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}

      {reps.length > 0 && (
        <label className="mb-4 flex items-center gap-2 text-[12.5px] font-semibold text-muted">
          Commercial
          <select
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            className="rounded-[9px] border border-line bg-surface px-2.5 py-[7px] text-[13px] font-bold text-ink"
          >
            <option value="">Tous les commerciaux</option>
            {parRep.map(({ rep, liste }) => (
              <option key={rep.id} value={rep.id}>
                {rep.name} ({liste.length})
              </option>
            ))}
          </select>
        </label>
      )}

      {avec.length === 0 && (
        <Notice>
          {filtre ? "Aucun engagement" : "Aucun engagement n'a été noté"} au 1:1 de {moisPrecedent.toLowerCase()}.
          Les sujets remplis dans « Ce qu&apos;on va chercher ensemble » apparaîtront ici le mois suivant.
        </Notice>
      )}

      <div className="flex flex-col gap-3">
        {avec.map(({ rep, liste }) => (
          <section key={rep.id} className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
            <div className="mb-3 flex items-center gap-2.5">
              <Avatar initials={rep.initials} />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{rep.name}</div>
                <div className="text-[12px] text-muted">
                  {liste.length} engagement{liste.length > 1 ? "s" : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenOneOnOne(rep.id)}
                className="rounded-lg bg-accent-soft px-2.5 py-[5px] text-[11.5px] font-bold text-accent"
              >
                Ouvrir le 1:1
              </button>
            </div>
            <Engagements liste={liste} onJuger={(index, suivi) => onJuger(rep.id, index, suivi)} />
          </section>
        ))}
      </div>

      {avec.length > 0 && sans.length > 0 && (
        <div className="mt-4 text-[12.5px] text-faint">
          Sans engagement en {moisPrecedent.toLowerCase()} : {sans.map((x) => x.rep.name).join(", ")}
        </div>
      )}
    </div>
  );
}
