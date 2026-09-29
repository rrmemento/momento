"use client";

import type { KpiDonnees } from "@/lib/kpis";
import type { MoisSpeciaux } from "@/lib/mois-special";
import { firstName } from "@/lib/momento";
import { engagementsDuParcours, moisDuParcours, seriesParcours, type SerieParcours } from "@/lib/parcours";
import { coupsDEclat, signauxFaibles } from "@/lib/parcours-analyse";
import type { OneOnOne, Rep } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Notice } from "@/components/ui/Notice";
import { PageTitle } from "@/components/ui/PageTitle";
import { MiniGraphique } from "./MiniGraphique";
import { CoupsDEclat } from "./CoupsDEclat";
import { Historique1on1 } from "./Historique1on1";
import { SesEngagements } from "./SesEngagements";
import { SignauxFaibles } from "./SignauxFaibles";

// Une carte = le titre (centré) + la courbe. La valeur d'un mois se lit en survolant ou touchant la courbe.
function CarteSerie({ serie }: { serie: SerieParcours }) {
  const avecValeur = serie.points.filter((p) => p.valeur != null).length;
  return (
    <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <h3 className="mb-2 text-center text-[14px] font-bold">{serie.titre}</h3>
      {avecValeur === 0 ? (
        <div className="grid h-[110px] place-items-center rounded-xl border border-dashed border-line text-center text-[12.5px] text-faint">
          {serie.cle === "tenue" ? "Pas encore d'engagement jugé" : "Pas encore de donnée"}
        </div>
      ) : (
        <>
          <MiniGraphique serie={serie} />
          {avecValeur === 1 && (
            <p className="mt-1 text-center text-[11.5px] text-faint">
              Un seul mois pour l&apos;instant : la courbe se dessinera dès le mois suivant.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// L'onglet Parcours, de haut en bas : Coups d'éclat → Signaux faibles → Courbes → Ses engagements → Historique des 1:1.
export function ParcoursView({
  reps,
  rep,
  months,
  historique,
  speciaux,
  entretiens,
  onSelectRep,
  onModifierFiche,
  onOuvrir1on1,
}: {
  reps: Rep[];
  rep: Rep | undefined;
  months: string[]; // les mois modifiables (sélecteur du haut) ; le dernier est le mois en cours
  historique: Record<string, Record<string, KpiDonnees>>; // mois → commercial → chiffres
  speciaux: MoisSpeciaux; // mois particuliers : objectif ajusté
  entretiens: Record<string, Record<string, OneOnOne>>; // mois → commercial → fiche 1:1
  onSelectRep: (repId: string) => void;
  onModifierFiche: (mois: string, repId: string, change: (fiche: OneOnOne) => OneOnOne) => void;
  onOuvrir1on1: (mois: string, repId: string) => void;
}) {
  if (!rep) {
    return (
      <div className="mx-auto max-w-[600px]">
        <PageTitle kicker="Progression mois par mois" title="Parcours" />
        <Notice>Aucun commercial actif n&apos;est encore rattaché à ton compte.</Notice>
      </div>
    );
  }

  const prenom = firstName(rep);
  const moisEnCours = months[months.length - 1];
  const mois = moisDuParcours(historique, rep.id);
  const base = { repId: rep.id, historique, entretiens, speciaux };
  const series = seriesParcours({ ...base, budget: rep.budget, m3: rep.level === "M3+" });
  const fiches = Object.keys(entretiens).flatMap((m) => {
    const fiche = entretiens[m][rep.id];
    return fiche ? [{ mois: m, fiche }] : [];
  });

  return (
    <div className="mx-auto max-w-[860px]">
      <PageTitle kicker="Progression mois par mois" title="Parcours" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Avatar initials={rep.initials} />
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] font-semibold text-muted">
          Commercial
          <select
            value={rep.id}
            onChange={(e) => onSelectRep(e.target.value)}
            className="min-w-0 flex-1 rounded-[9px] border border-line bg-surface px-2.5 py-[7px] text-[14px] font-bold text-ink sm:flex-none"
          >
            {[...reps]
              .sort((a, b) => a.name.localeCompare(b.name, "fr"))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </label>
        {mois.length > 0 && (
          <div className="text-[12.5px] text-muted">
            {mois.length === 1 ? mois[0] : `${mois[0]} → ${mois.at(-1)}`} · {mois.length} mois
          </div>
        )}
      </div>

      <CoupsDEclat prenom={prenom} eclats={coupsDEclat({ ...base, budget: rep.budget })} />

      <SignauxFaibles
        repId={rep.id}
        prenom={prenom}
        regles={signauxFaibles({ ...base, m3: rep.level === "M3+", moisEnCours })}
        analyseIa={entretiens[moisEnCours]?.[rep.id]?.signauxIa ?? null}
        onAnalyseIa={(analyse) => onModifierFiche(moisEnCours, rep.id, (f) => ({ ...f, signauxIa: analyse }))}
      />

      <h2 className="mb-2.5 text-[20px] font-bold">Courbes</h2>
      {mois.length === 0 ? (
        <Notice>
          Pas encore de chiffres enregistrés pour {rep.name}. Son parcours se dessinera dès le premier mois saisi
          (onglet Import &amp; chiffres).
        </Notice>
      ) : (
        <>
          {mois.length < 3 && (
            <Notice>
              {mois.length === 1 ? "Un seul mois" : "Deux mois"} enregistré{mois.length > 1 ? "s" : ""} pour
              l&apos;instant : les tendances deviendront parlantes au fil des mois.
            </Notice>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {series.map((s) => (
              <CarteSerie key={s.cle} serie={s} />
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-faint">
            Pointillés : objectif ou cible MOMENTO. L&apos;objectif ventes et installations est le budget actuel du
            commercial ({rep.budget}) ; point creux = mois particulier (congés, arrêt…), avec son objectif ajusté au
            survol. Engagements tenus : part des engagements tranchés (tenus ou non tenus) du 1:1 du
            mois précédent.
          </p>
        </>
      )}

      <SesEngagements prenom={prenom} parMois={engagementsDuParcours(rep.id, historique, entretiens)} />

      <Historique1on1
        prenom={prenom}
        fiches={fiches}
        moisModifiables={months}
        onOuvrir={(m) => onOuvrir1on1(m, rep.id)}
      />
    </div>
  );
}
