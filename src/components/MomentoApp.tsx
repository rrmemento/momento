"use client";

import { useEffect, useRef, useState } from "react";
import { saveEntretien } from "@/app/actions/entretiens";
import type { KpiDonnees } from "@/lib/kpis";
import type { ImportBi } from "@/lib/lecture-bi";
import { previousMonthLabel } from "@/lib/mois";
import { emptyOneOnOne } from "@/lib/momento";
import { engagements, type SuiviManuel } from "@/lib/suivi";
import type { ManagerProfile, OneOnOne, Rep, View } from "@/lib/types";
import { Header } from "./Header";
import { ImportView } from "./import/ImportView";
import { OneOnOneView } from "./one-on-one/OneOnOneView";
import { enregistrerFiche } from "./one-on-one/useAutosave";
import { SaisieView } from "./saisie/SaisieView";
import { ParcoursView } from "./parcours/ParcoursView";
import { TeamView } from "./team/TeamView";
import { Toast, useToast } from "./ui/Toast";

const ANCRE_CHIFFRES = "chiffres-du-mois";

export function MomentoApp({
  data,
  months,
  kpis,
  historique,
  entretiens: entretiensInitiaux,
  manager,
}: {
  data: Record<string, Rep[]>;
  months: string[];
  kpis: Record<string, Record<string, KpiDonnees>>; // mois → commercial → chiffres saisis
  historique: Record<string, Record<string, KpiDonnees>>; // tous les mois enregistrés (onglet Parcours)
  entretiens: Record<string, Record<string, OneOnOne>>; // mois → commercial → fiche 1:1 lue dans Supabase
  manager: ManagerProfile;
}) {
  const [view, setView] = useState<View>("equipe");
  const [month, setMonth] = useState(months[months.length - 1]);
  const [currentId, setCurrentId] = useState(data[months[months.length - 1]]?.[0]?.id ?? "");
  // Les fiches 1:1 : lues une fois au chargement, puis tenues à jour ici (l'enregistrement se fait en arrière-plan).
  const [entretiens, setEntretiens] = useState(entretiensInitiaux);
  const [importBi, setImportBi] = useState<ImportBi | null>(null); // import en attente de vérification
  const toast = useToast();

  const reps = data[month] ?? [];
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

  return (
    <>
      <Header manager={manager} view={view} onViewChange={switchView} month={month} months={months} onMonthChange={setMonth} />
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
            historique={historique}
            entretiens={entretiens}
            onSelectRep={setCurrentId}
          />
        </section>
        {/* Import & chiffres : 1. les captures BI (moyen principal), 2. vérifier, corriger ou saisir à la main. */}
        <section {...section("import")}>
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
        </section>
      </main>
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
