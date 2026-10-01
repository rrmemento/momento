"use client";

import type { KpiDonnees } from "@/lib/kpis";
import type { MoisSpeciaux } from "@/lib/mois-special";
import type { NiveauxMois } from "@/lib/niveau-mois";
import { firstName } from "@/lib/momento";
import { objectifsEquipe, OG_PAR_SALES, POS_PAR_SALES } from "@/lib/objectifs-equipe";
import { engagementsDuParcours, moisDuParcours, seriesParcours, type SerieParcours } from "@/lib/parcours";
import { pointsFortsDuMois, signauxFaibles } from "@/lib/parcours-analyse";
import { moisAvecChiffres } from "@/lib/parcours-ia";
import type { OneOnOne, Rep } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Notice } from "@/components/ui/Notice";
import { PageTitle } from "@/components/ui/PageTitle";
import { MiniGraphique } from "./MiniGraphique";
import { CoupsDEclat } from "./CoupsDEclat";
import { Historique1on1 } from "./Historique1on1";
import { SesEngagements } from "./SesEngagements";
import { ProfilDiagnostic } from "./ProfilDiagnostic";
import { Repli } from "./Repli";
import { SignauxFaibles } from "./SignauxFaibles";
import { effectifEquipe, useModeRm } from "@/components/ModeRm";

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

// L'onglet Parcours, un DIAGNOSTIC du commercial dans le temps, de haut en bas :
// Profil → Diagnostic (IA) → À valoriser ce mois-ci → Signaux faibles (repliés) → Courbes (repliées) → Engagements (repliés) → Historique des 1:1.
export function ParcoursView({
  reps,
  rep,
  months,
  historique,
  speciaux,
  niveaux,
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
  niveaux: NiveauxMois; // séniorité et budget de chaque mois
  entretiens: Record<string, Record<string, OneOnOne>>; // mois → commercial → fiche 1:1
  onSelectRep: (repId: string) => void;
  onModifierFiche: (mois: string, repId: string, change: (fiche: OneOnOne) => OneOnOne) => void;
  onOuvrir1on1: (mois: string, repId: string) => void;
}) {
  const modeRm = useModeRm();
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
  const base = { repId: rep.id, historique, entretiens, speciaux, niveaux };
  const series = seriesParcours({ ...base, budget: rep.fiche.budget, m3: rep.level === "M3+" });
  // Vue RM (équipe d'un TM) : les OBJECTIFS D'ÉQUIPE remplacent le budget cumulé et les repères d'un commercial seul.
  // Ventes et installs = le PACE du TM (en %) contre 100 % ; POS vendus contre effectif × 4 ; OG contre sales
  // actifs × 5 ; POS share 25 %. Les courbes absentes du BI (délai d'installation) sont masquées.
  const objEquipe = modeRm ? objectifsEquipe(effectifEquipe(modeRm, rep.id)) : null;
  const seriesAffichees = objEquipe
    ? series
        .filter((s) => s.points.some((p) => p.valeur != null))
        .map((s): SerieParcours => {
          const pace = { unite: " %" as const, decimales: 0, repere: { valeur: objEquipe.pace, libelle: `objectif ${objEquipe.pace} %` } };
          if (s.cle === "ventes") return { ...s, ...pace, titre: "Ventes signées · pace" };
          if (s.cle === "install") return { ...s, ...pace, titre: "Installations · pace" };
          const parSales = (valeur: number, n: number) =>
            objEquipe.nbActifs ? { valeur, libelle: `objectif ${valeur} (${objEquipe.nbActifs} sales × ${n})` } : null;
          if (s.cle === "posSales") return { ...s, repere: parSales(objEquipe.posVendus, POS_PAR_SALES) };
          if (s.cle === "og") return { ...s, repere: parSales(objEquipe.og, OG_PAR_SALES) };
          return s;
        })
    : series;
  const signaux = signauxFaibles({ ...base, m3: rep.level === "M3+", moisEnCours });
  const engagementsParMois = engagementsDuParcours(rep.id, historique, entretiens);
  const nbEngagements = engagementsParMois.reduce((n, m) => n + m.liste.length, 0);
  const fiches = Object.keys(entretiens).flatMap((m) => {
    const fiche = entretiens[m][rep.id];
    return fiche ? [{ mois: m, fiche }] : [];
  });
  // Le nombre de 1:1 où le manager a coché « Perf review », sur tous les mois de la personne.
  const nbPerfReviews = fiches.filter((f) => f.fiche.perfReview).length;

  return (
    <div className="mx-auto max-w-[860px]">
      <PageTitle kicker="Diagnostic dans le temps" title="Parcours" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Avatar initials={rep.initials} />
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] font-semibold text-muted">
          {modeRm ? "TM" : "Commercial"}
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

      {/* Compteur : combien de perf reviews (case cochée au 1:1), tous mois confondus. */}
      <div
        className={`mb-5 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-card ${
          nbPerfReviews ? "border-warn-line bg-warn-soft" : "border-line bg-surface"
        }`}
      >
        <span className={`font-display text-[30px] font-bold leading-none ${nbPerfReviews ? "text-warn" : "text-ink"}`}>
          {nbPerfReviews}
        </span>
        <div className="leading-tight">
          <div className="text-[14px] font-bold">Perf reviews : {nbPerfReviews}</div>
          <div className="text-[12px] text-muted">1:1 où la case « Perf review » a été cochée, tous mois confondus</div>
        </div>
      </div>

      {/* 1 et 2. Le verdict : profil + diagnostic (IA) */}
      <ProfilDiagnostic
        key={rep.id}
        repId={rep.id}
        prenom={prenom}
        recul={moisAvecChiffres(historique, rep.id).length}
        diagnostic={entretiens[moisEnCours]?.[rep.id]?.diagnosticIa ?? null}
        onDiagnostic={(d) => onModifierFiche(moisEnCours, rep.id, (f) => ({ ...f, diagnosticIa: d }))}
      />

      {/* 3. À valoriser ce mois-ci : 1 à 2 réussites du dernier mois (rien si rien de marquant) */}
      <CoupsDEclat {...pointsFortsDuMois({ ...base, budget: rep.fiche.budget })} />

      {/* 4, 5. Le détail, replié : l'IA l'intègre déjà dans le diagnostic */}
      <Repli
        titre="Signaux faibles (règles)"
        resume={signaux.length ? `${signaux.length} repéré${signaux.length > 1 ? "s" : ""}` : "aucun"}
        lien="Voir le détail des règles"
      >
        <SignauxFaibles signaux={signaux} prenom={prenom} />
      </Repli>

      <Repli titre="Courbes" resume={mois.length ? `${mois.length} mois` : "pas encore de chiffres"} lien="Voir les courbes détaillées">
        {mois.length === 0 ? (
          <p className="text-[13px] text-muted">
            Pas encore de chiffres enregistrés pour {rep.name}. Son parcours se dessinera dès le premier mois saisi
            (onglet Import &amp; chiffres).
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {seriesAffichees.map((s) => (
                <CarteSerie key={s.cle} serie={s} />
              ))}
            </div>
            {modeRm ? (
              <p className="mt-3 text-[11.5px] text-faint">
                Pointillés : objectifs d&apos;équipe. Ventes et installations : le PACE de l&apos;équipe contre 100 % ;
                POS vendus : effectif × 4 ; ventes OG : effectif × 5 ; POS share 25 % ; conversion IH 20 %.
                Jamais le budget cumulé (il bouge quand un sales arrive ou part).
                Engagements tenus : part des engagements tranchés du 1:1 du mois précédent.
              </p>
            ) : (
              <p className="mt-3 text-[11.5px] text-faint">
                Pointillés : objectif ou cible MOMENTO. Ventes et installations : l&apos;objectif DE CHAQUE MOIS, selon sa
                séniorité ce mois-là (M1 → 5, M2 → 10, M3+ → 15), sinon le budget de la fiche ({rep.fiche.budget}) ; point
                creux = mois particulier (congés, arrêt…), avec son objectif ajusté au survol. Engagements tenus : part des
                engagements tranchés (tenus ou non tenus) du 1:1 du mois précédent.
              </p>
            )}
          </>
        )}
      </Repli>

      <Repli
        titre="Ses engagements"
        resume={`${nbEngagements} engagement${nbEngagements > 1 ? "s" : ""}`}
        lien="Voir le détail"
      >
        <SesEngagements prenom={prenom} parMois={engagementsParMois} />
      </Repli>

      {/* 6. L'historique des 1:1, en bas */}
      <Historique1on1
        prenom={prenom}
        fiches={fiches}
        moisModifiables={months}
        onOuvrir={(m) => onOuvrir1on1(m, rep.id)}
      />
    </div>
  );
}
