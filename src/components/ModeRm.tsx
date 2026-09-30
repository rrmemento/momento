"use client";

import { createContext, useContext } from "react";
import type { ResumeImportRm } from "@/lib/bi-rm";
import type { DonneesBiRm } from "@/lib/lecture-bi-rm";
import { statut } from "@/lib/momento";
import { statutTm } from "@/lib/statut-tm";
import type { Rep, Status } from "@/lib/types";

export { ATTENTE_BI } from "@/lib/statut-tm";

// Vue RM : les « personnes » de l'app sont ses TM au lieu des commerciaux, avec les chiffres de leur ligne
// agrégée dans le BI importé par le RM. Absent (null) pour un TM : les écrans restent exactement comme avant.
export type ModeRm = {
  bi: Record<string, DonneesBiRm>; // TM → tous les chiffres de sa ligne du BI, pour le mois affiché
  resume: ResumeImportRm | null; // ce qui a été importé pour le mois affiché
  tms: { id: string; nom: string }[];
};

export const ModeRmContext = createContext<ModeRm | null>(null);

export const useModeRm = () => useContext(ModeRmContext);

// Le statut affiché : celui du TM d'après son BI (vue RM), sinon le statut habituel du commercial.
export function useStatutAffiche() {
  const modeRm = useModeRm();
  return (rep: Rep): Status => (modeRm ? statutTm(rep) : statut(rep));
}
