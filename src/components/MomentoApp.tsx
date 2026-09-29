"use client";

import { useRef, useState } from "react";
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
import { SaisieView } from "./saisie/SaisieView";
import { SuiviView } from "./suivi/SuiviView";
import { TeamView } from "./team/TeamView";
import { Toast, useToast } from "./ui/Toast";

export function MomentoApp({
  data,
  months,
  kpis,
  entretiens: entretiensInitiaux,
  manager,
}: {
  data: Record<string, Rep[]>;
  months: string[];
  kpis: Record<string, Record<string, KpiDonnees>>; // mois → commercial → chiffres saisis
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

  // Import BI lu : on ouvre l'onglet Chiffres sur le premier commercial pré-rempli, à vérifier.
  function imported(imp: ImportBi) {
    setImportBi(imp);
    const first = reps.find((r) => imp.lignes[r.id]);
    if (first) setCurrentId(first.id);
    switchView("saisie");
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
              moisPrecedent={moisPrecedent}
              engagementsPrecedents={engagements(entretiens[moisPrecedent]?.[current.id], kpisDuMois[current.id])}
              onJuger={(index, suivi) => juger(moisPrecedent, current.id, index, suivi)}
              onSelectRep={selectRep}
              onToast={toast.show}
            />
          )}
        </section>
        <section {...section("suivi")}>
          <SuiviView
            reps={reps}
            month={month}
            moisPrecedent={moisPrecedent}
            fichesPrecedentes={entretiens[moisPrecedent] ?? {}}
            kpis={kpisDuMois}
            onJuger={(repId, index, suivi) => juger(moisPrecedent, repId, index, suivi)}
            onOpenOneOnOne={openOneOnOne}
          />
        </section>
        <section {...section("saisie")}>
          <SaisieView
            reps={reps}
            rep={current}
            month={month}
            saved={kpis[month] ?? {}}
            imp={importBi}
            onImportChange={(update) => setImportBi((prev) => (prev ? update(prev) : prev))}
            onSelectRep={selectRep}
            onToast={toast.show}
          />
        </section>
        <section {...section("import")}>
          <ImportView
            month={month}
            reps={reps}
            saved={kpis[month] ?? {}}
            importEnCours={importBi}
            onImported={imported}
            onToast={toast.show}
          />
        </section>
      </main>
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
