"use client";

import { useState } from "react";
import type { Rep, View } from "@/lib/types";
import { Header } from "./Header";
import { ImportView } from "./import/ImportView";
import { OneOnOneView } from "./one-on-one/OneOnOneView";
import { TeamView } from "./team/TeamView";
import { Toast, useToast } from "./ui/Toast";

export function MomentoApp({ data, months }: { data: Record<string, Rep[]>; months: string[] }) {
  const [view, setView] = useState<View>("equipe");
  const [month, setMonth] = useState(months[months.length - 1]);
  const [currentId, setCurrentId] = useState("raphael");
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

  function selectRep(repId: string) {
    setCurrentId(repId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Les 3 onglets restent montés (masqués) pour garder leur état, comme dans la maquette.
  const section = (id: View) => ({ hidden: view !== id, className: "animate-fade" });

  return (
    <>
      <Header view={view} onViewChange={switchView} month={month} months={months} onMonthChange={setMonth} />
      <main className="mx-auto max-w-[1000px] px-5 pt-[22px] pb-[90px]">
        <section {...section("equipe")}>
          <TeamView reps={reps} month={month} onOpenOneOnOne={openOneOnOne} />
        </section>
        <section {...section("oo")}>
          {current && (
            <OneOnOneView reps={reps} rep={current} month={month} onSelectRep={selectRep} onToast={toast.show} />
          )}
        </section>
        <section {...section("import")}>
          <ImportView onToast={toast.show} />
        </section>
      </main>
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
