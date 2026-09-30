"use client";

import { createContext, useContext } from "react";
import { statut } from "@/lib/momento";
import type { Rep, Status } from "@/lib/types";

// Vue RM : les « personnes » de l'app sont ses TM au lieu des commerciaux.
// Absent (null) pour un TM : les écrans restent exactement comme avant.
export type ModeRm = {
  statutsEquipe: Record<string, Status>; // TM → statut de son équipe, pour le mois affiché
};

export const ModeRmContext = createContext<ModeRm | null>(null);

export const useModeRm = () => useContext(ModeRmContext);

// Le message tant qu'un TM n'a pas ses propres chiffres (import de son BI : étape suivante).
export const ATTENTE_BI = "En attente de l'import du BI";

// Le statut affiché dans l'onglet Équipe : celui de son équipe pour un TM vu par son RM, sinon le statut habituel.
export function useStatutAffiche() {
  const modeRm = useModeRm();
  return (rep: Rep): Status => modeRm?.statutsEquipe[rep.id] ?? statut(rep);
}
