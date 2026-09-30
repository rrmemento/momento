"use client";

import { createContext, useContext } from "react";
import type { ResumeImportRm, SalesBi } from "@/lib/bi-rm";
import type { DonneesBiRm } from "@/lib/lecture-bi-rm";
import { statut } from "@/lib/momento";
import { statutTm } from "@/lib/statut-tm";
import type { Rep, Status } from "@/lib/types";

export { ATTENTE_BI } from "@/lib/statut-tm";

// Vue RM : les « personnes » de l'app sont ses TM au lieu des commerciaux, avec les chiffres de leur ligne
// agrégée dans le BI importé par le RM. Absent (null) pour un TM : les écrans restent exactement comme avant.
export type ModeRm = {
  bi: Record<string, DonneesBiRm>; // TM → tous les chiffres de sa ligne du BI, pour le mois affiché
  sales: Record<string, SalesBi[]>; // TM → ses sales dans le BI du mois affiché (lecture seule)
  resume: ResumeImportRm | null; // ce qui a été importé pour le mois affiché
  tms: TmInfo[];
  roster: Record<string, RosterTm>; // TM → ses vraies fiches commerciaux (actifs et partis)
};

// Un TM vu par son RM : date de début (informative), et s'il a été créé depuis le BI sans login (renommable, retirable).
export type TmInfo = { id: string; nom: string; dateDebut: string | null; creeDepuisBi: boolean };

// L'équipe d'un TM : ses commerciaux actifs (avec niveau, budget, démarrage) et ses partis.
export type RosterTm = {
  actifs: { id: string; nom: string; seniorite: string | null; budget: number; demarrage: string | null }[];
  partis: { id: string; nom: string }[];
};

export const ModeRmContext = createContext<ModeRm | null>(null);

// Le nombre de sales ACTIFS d'un TM (les partis ne comptent pas) : base des objectifs d'équipe POS et OG.
export const nbSalesActifs = (modeRm: ModeRm, tmId: string) => modeRm.roster[tmId]?.actifs.length ?? 0;

export const useModeRm = () => useContext(ModeRmContext);

// Le statut affiché : celui du TM d'après son BI (vue RM), sinon le statut habituel du commercial.
export function useStatutAffiche() {
  const modeRm = useModeRm();
  return (rep: Rep): Status => (modeRm ? statutTm(rep) : statut(rep));
}
