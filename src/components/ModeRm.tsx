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
  effectif: Record<string, number>; // TM → nombre de sales dans SON BI du mois affiché (partis compris)
};

// Un TM vu par son RM : date de début (informative), et s'il a été créé depuis le BI sans login (renommable, retirable).
export type TmInfo = { id: string; nom: string; dateDebut: string | null; creeDepuisBi: boolean };

// L'équipe d'un TM : ses commerciaux actifs (avec niveau, budget, démarrage) et ses partis.
export type RosterTm = {
  actifs: { id: string; nom: string; seniorite: string | null; budget: number; demarrage: string | null }[];
  partis: { id: string; nom: string }[];
};

export const ModeRmContext = createContext<ModeRm | null>(null);

// L'EFFECTIF d'une équipe pour ses objectifs (POS = effectif × 4, OG = effectif × 5) : le nombre de sales de ce TM dans
// le BI du mois (partis compris : Léa, partie, compte dans l'effectif du mois). Sans BI : son roster actif.
export const effectifEquipe = (modeRm: ModeRm, tmId: string) =>
  modeRm.effectif[tmId] ?? modeRm.roster[tmId]?.actifs.length ?? 0;

export const useModeRm = () => useContext(ModeRmContext);

// Le statut affiché : celui du TM d'après son BI (vue RM), sinon le statut habituel du commercial.
export function useStatutAffiche() {
  const modeRm = useModeRm();
  return (rep: Rep): Status => (modeRm ? statutTm(rep) : statut(rep));
}
