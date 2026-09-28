"use client";

import { useState } from "react";
import type { KpiDonnees } from "@/lib/kpis";
import type { ImportBi } from "@/lib/lecture-bi";
import type { ManagerProfile, Rep, View } from "@/lib/types";
import { Header } from "./Header";
import { ImportView } from "./import/ImportView";
import { OneOnOneView } from "./one-on-one/OneOnOneView";
import { SaisieView } from "./saisie/SaisieView";
import { TeamView } from "./team/TeamView";
import { Toast, useToast } from "./ui/Toast";

export function MomentoApp({
  data,
  months,
  kpis,
  manager,
}: {
  data: Record<string, Rep[]>;
  months: string[];
  kpis: Record<string, Record<string, KpiDonnees>>; // mois → commercial → chiffres saisis
  manager: ManagerProfile;
}) {
  const [view, setView] = useState<View>("equipe");
  const [month, setMonth] = useState(months[months.length - 1]);
  const [currentId, setCurrentId] = useState(data[months[months.length - 1]]?.[0]?.id ?? "");
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
          <TeamView equipe={manager.equipe} reps={reps} month={month} onOpenOneOnOne={openOneOnOne} onToast={toast.show} />
        </section>
        <section {...section("oo")}>
          {current && (
            <OneOnOneView reps={reps} rep={current} month={month} onSelectRep={selectRep} onToast={toast.show} />
          )}
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
