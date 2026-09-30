"use client";

import { useEffect, useRef, useState } from "react";
import { saveEntretien } from "@/app/actions/entretiens";
import type { KpiDonnees } from "@/lib/kpis";
import type { ImportBi } from "@/lib/lecture-bi";
import type { MoisSpeciaux } from "@/lib/mois-special";
import { niveauCalcule, type NiveauxMois } from "@/lib/niveau-mois";
import { previousMonthLabel, rangMois } from "@/lib/mois";
import { emptyOneOnOne, repFromKpis } from "@/lib/momento";
import { engagements, type SuiviManuel } from "@/lib/suivi";
import type { ResumeImportRm, SalesBi } from "@/lib/bi-rm";
import type { DonneesBiRm } from "@/lib/lecture-bi-rm";
import type { ManagerProfile, OneOnOne, Rep, View } from "@/lib/types";
import { Header } from "./Header";
import { ImportView } from "./import/ImportView";
import { OneOnOneView } from "./one-on-one/OneOnOneView";
import { enregistrerFiche } from "./one-on-one/useAutosave";
import { SaisieView } from "./saisie/SaisieView";
import { ParcoursView } from "./parcours/ParcoursView";
import { TeamView } from "./team/TeamView";
import { Toast, useToast } from "./ui/Toast";
import { ModeRmContext, type RosterTm, type TmInfo } from "./ModeRm";
import { ImportRmView } from "./import/ImportRmView";

const ANCRE_CHIFFRES = "chiffres-du-mois";

export function MomentoApp({
  data,
  months,
  moisParDefaut,
  kpis,
  historique,
  speciaux,
  niveaux,
  entretiens: entretiensInitiaux,
  manager,
  rm,
}: {
  data: Record<string, Rep[]>;
  months: string[]; // mois proposés, du plus ancien au plus récent (le dernier = mois courant)
  moisParDefaut: string; // le mois le plus récent qui a des chiffres, sinon le mois courant
  kpis: Record<string, Record<string, KpiDonnees>>; // mois → commercial → chiffres saisis
  historique: Record<string, Record<string, KpiDonnees>>; // tous les mois enregistrés (onglet Parcours)
  speciaux: MoisSpeciaux; // mois particuliers (congés, arrêt, ramp-up…) : objectif ajusté
  niveaux: NiveauxMois; // séniorité et budget de chaque mois
  entretiens: Record<string, Record<string, OneOnOne>>; // mois → commercial → fiche 1:1 lue dans Supabase
  manager: ManagerProfile;
  // Vue RM uniquement : les « personnes » sont ses TM ; leurs chiffres = leur ligne du BI importé par le RM.
  // Absent pour un TM : l'app reste exactement la même.
  rm?: {
    biParTm: Record<string, Record<string, DonneesBiRm>>; // mois → TM → tous les chiffres de sa ligne du BI
    salesParTm: Record<string, Record<string, SalesBi[]>>; // mois → TM → ses sales dans le BI (lecture seule)
    resumes: Record<string, ResumeImportRm>; // mois → ce qui a été importé
    tms: TmInfo[];
    rosterParTm: Record<string, RosterTm>; // TM → ses commerciaux actifs et partis
  };
}) {
  const [view, setView] = useState<View>("equipe");
  const [month, setMonth] = useState(moisParDefaut);
  const [currentId, setCurrentId] = useState(data[moisParDefaut]?.[0]?.id ?? "");
  // Mois plus anciens ajoutés à la main (« + mois précédent ») pour importer l'historique.
  const [moisAjoutes, setMoisAjoutes] = useState<string[]>([]);
  const tousLesMois = [...new Set([...moisAjoutes, ...months])].sort((a, b) => (rangMois(a) ?? 0) - (rangMois(b) ?? 0));

  // Un mois ajouté n'a encore aucun chiffre : son équipe = les mêmes commerciaux, « chiffres à venir »,
  // avec le niveau de ce mois calculé depuis leur mois de démarrage.
  const equipe = data[months[months.length - 1]] ?? [];
  const repsDuMois = (m: string) =>
    data[m] ??
    equipe.map((r) =>
      repFromKpis({ id: r.id, name: r.name, ...r.fiche }, undefined, undefined, niveauCalcule({ demarrage: r.fiche.demarrage, seniorite: r.fiche.sen }, m)),
    );

  function ajouterMoisPrecedent() {
    const m = previousMonthLabel(tousLesMois[0]);
    setMoisAjoutes((prev) => [...prev, m]);
    setMonth(m);
  }
  // Les fiches 1:1 : lues une fois au chargement, puis tenues à jour ici (l'enregistrement se fait en arrière-plan).
  const [entretiens, setEntretiens] = useState(entretiensInitiaux);
  const [importBi, setImportBi] = useState<ImportBi | null>(null); // import en attente de vérification
  const toast = useToast();

  const reps = repsDuMois(month);
  const current = reps.find((r) => r.id === currentId) ?? reps[0];

  function switchView(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function openOneOnOne(repId: string) {
    setCurrentId(repId);
    switchView("oo");
  }

  // Descend jusqu'aux chiffres du mois (sous les captures, dans l'onglet Import & chiffres).
  function voirChiffres() {
    requestAnimationFrame(() =>
      document.getElementById(ANCRE_CHIFFRES)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  // Import BI lu : on descend aux chiffres, sur le premier commercial pré-rempli, à vérifier.
  function imported(imp: ImportBi) {
    setImportBi(imp);
    const first = reps.find((r) => imp.lignes[r.id]);
    if (first) setCurrentId(first.id);
    voirChiffres();
  }

  // Bilan d'un engagement en texte libre (Tenu / Non tenu / En cours), noté dans la fiche du mois où il a été pris.
  // Affiché tout de suite ; les enregistrements partent l'un après l'autre pour ne jamais s'écraser.
  const fileEnregistrement = useRef(Promise.resolve());
  function juger(mois: string, repId: string, index: number, suivi: SuiviManuel | null) {
    const avant = entretiens[mois]?.[repId];
    if (!avant) return;
    const avecSuivi = (fiche: OneOnOne, s: SuiviManuel | null) => ({
      ...fiche,
      sujets: fiche.sujets.map((x, k) => (k === index ? { ...x, suivi: s } : x)),
    });
    const fiche = avecSuivi(avant, suivi);
    setEntretiens((prev) => ({ ...prev, [mois]: { ...prev[mois], [repId]: fiche } }));
    fileEnregistrement.current = fileEnregistrement.current.then(async () => {
      const res = await saveEntretien(repId, mois, fiche).catch(() => ({
        ok: false as const,
        error: "Connexion impossible, le bilan n'a pas été enregistré.",
      }));
      if (res.ok) return;
      toast.show(res.error);
      const annule = avant.sujets[index]?.suivi ?? null;
      setEntretiens((prev) => {
        const actuelle = prev[mois]?.[repId];
        return actuelle ? { ...prev, [mois]: { ...prev[mois], [repId]: avecSuivi(actuelle, annule) } } : prev;
      });
    });
  }

  // Modification venue du brief IA (plusieurs secondes après le clic) : appliquée à la version LA PLUS RÉCENTE
  // de la fiche, pour ne pas perdre ce qui a été tapé pendant la préparation, puis enregistrée.
  const entretiensRef = useRef(entretiens);
  useEffect(() => {
    entretiensRef.current = entretiens;
  }, [entretiens]);
  function modifierFiche(mois: string, repId: string, change: (fiche: OneOnOne) => OneOnOne) {
    const fiche = change(entretiensRef.current[mois]?.[repId] ?? emptyOneOnOne());
    entretiensRef.current = { ...entretiensRef.current, [mois]: { ...entretiensRef.current[mois], [repId]: fiche } };
    setEntretiens((prev) => ({ ...prev, [mois]: { ...prev[mois], [repId]: fiche } }));
    enregistrerFiche(repId, mois, fiche);
  }

  const moisPrecedent = previousMonthLabel(month);
  const kpisDuMois = kpis[month] ?? {};

  function selectRep(repId: string) {
    setCurrentId(repId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Les onglets restent montés (masqués) pour garder leur état, comme dans la maquette.
  const section = (id: View) => ({ hidden: view !== id, className: "animate-fade" });
  const modeRm = rm
    ? {
        bi: rm.biParTm[month] ?? {},
        sales: rm.salesParTm[month] ?? {},
        resume: rm.resumes[month] ?? null,
        tms: rm.tms,
        roster: rm.rosterParTm,
      }
    : null;

  return (
    <ModeRmContext.Provider value={modeRm}>
      <Header
        manager={manager}
        view={view}
        onViewChange={switchView}
        month={month}
        months={tousLesMois}
        onMonthChange={setMonth}
        onAjouterMois={ajouterMoisPrecedent}
      />
      <main className="mx-auto max-w-[1000px] px-5 pt-[22px] pb-[90px]">
        <section {...section("equipe")}>
          <TeamView
            equipe={manager.equipe}
            reps={reps}
            month={month}
            entretiens={entretiens[month] ?? {}}
            onOpenOneOnOne={openOneOnOne}
            onToast={toast.show}
          />
        </section>
        <section {...section("oo")}>
          {current && (
            <OneOnOneView
              reps={reps}
              rep={current}
              month={month}
              fiche={entretiens[month]?.[current.id] ?? emptyOneOnOne()}
              onFicheChange={(fiche) =>
                setEntretiens((prev) => ({ ...prev, [month]: { ...prev[month], [current.id]: fiche } }))
              }
              onModifierFiche={(change) => modifierFiche(month, current.id, change)}
              moisPrecedent={moisPrecedent}
              engagementsPrecedents={engagements(entretiens[moisPrecedent]?.[current.id], kpisDuMois[current.id])}
              onJuger={(index, suivi) => juger(moisPrecedent, current.id, index, suivi)}
              onSelectRep={selectRep}
              onToast={toast.show}
            />
          )}
        </section>
        <section {...section("parcours")}>
          <ParcoursView
            reps={reps}
            rep={current}
            months={months}
            historique={historique}
            speciaux={speciaux}
            niveaux={niveaux}
            entretiens={entretiens}
            onSelectRep={setCurrentId}
            onModifierFiche={modifierFiche}
            onOuvrir1on1={(mois, repId) => {
              setMonth(mois);
              openOneOnOne(repId);
            }}
          />
        </section>
        {/* Import & chiffres : 1. les captures BI (moyen principal), 2. vérifier, corriger ou saisir à la main. */}
        <section {...section("import")}>
          {modeRm ? (
            // Vue RM : l'import des 2 captures du BI RM (TM + leurs sales), sur le mois choisi dans l'en-tête.
            <ImportRmView month={month} onToast={toast.show} />
          ) : (
            <>
              <ImportView
                month={month}
                reps={reps}
                saved={kpis[month] ?? {}}
                importEnCours={importBi}
                onImported={imported}
                onToast={toast.show}
              />
              <div id={ANCRE_CHIFFRES} className="mt-10 scroll-mt-[120px] border-t border-line pt-8">
                <SaisieView
                  reps={reps}
                  rep={current}
                  month={month}
                  saved={kpis[month] ?? {}}
                  imp={importBi}
                  onImportChange={(update) => setImportBi((prev) => (prev ? update(prev) : prev))}
                  onSelectRep={(repId) => {
                    setCurrentId(repId);
                    voirChiffres();
                  }}
                  onToast={toast.show}
                />
              </div>
            </>
          )}
        </section>
      </main>
      <Toast message={toast.message} visible={toast.visible} />
    </ModeRmContext.Provider>
  );
}
