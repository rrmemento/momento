// Le contenu d'un entretien 1:1 (colonne entretiens.contenu, jsonb).
// Utilisé à la fois par le navigateur (fiche) et par le serveur (lecture et enregistrement).
import { normaliserAnalyseIa, normaliserBrief } from "./brief";
import { normaliserObjectifChiffre } from "./kpis";
import { isDateJour } from "./mois";
import { normaliserDiagnostic } from "./parcours-ia";
import { isSuiviManuel } from "./suivi";
import { emptyOneOnOne, emptySubject } from "./momento";
import type { OneOnOne, Subject } from "./types";

const TEXTES = ["ressenti", "fier", "bloque", "titre", "forts", "besoin", "objectif"] as const;
const TAILLE_MAX_TEXTE = 10_000; // caractères par champ
export const SUJETS_MAX = 20;

const texte = (v: unknown) => (typeof v === "string" ? v.slice(0, TAILLE_MAX_TEXTE) : "");

// N'importe quel jsonb (ou brouillon envoyé par le navigateur) → une fiche complète et propre.
export function normaliserEntretien(raw: unknown): OneOnOne {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fiche = emptyOneOnOne();
  for (const k of TEXTES) fiche[k] = texte(o[k]);
  fiche.note = typeof o.note === "number" && Number.isInteger(o.note) && o.note >= 0 && o.note <= 10 ? o.note : 0;
  const sujets = Array.isArray(o.sujets)
    ? o.sujets.slice(0, SUJETS_MAX).map((s): Subject => {
        const x = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
        return {
          t: texte(x.t),
          o: texte(x.o),
          r: texte(x.r),
          g: texte(x.g),
          questions: texte(x.questions), // absent des anciens sujets → vide
          reponse: texte(x.reponse),
          ia: x.ia === true,
          cible: normaliserObjectifChiffre(x.cible),
          suivi: isSuiviManuel(x.suivi) ? x.suivi : null,
        };
      })
    : [];
  fiche.sujets = sujets.length ? sujets : [emptySubject()];
  fiche.clotureLe = typeof o.clotureLe === "string" && isDateJour(o.clotureLe) ? o.clotureLe : null;
  fiche.perfReview = o.perfReview === true; // absent des anciennes fiches → non cochée
  fiche.brief = normaliserBrief(o.brief);
  fiche.diagnosticIa = normaliserDiagnostic(o.diagnosticIa);
  fiche.analyseIa = normaliserAnalyseIa(o.analyseIa);
  // Vue RM : les analyses des sales d'un TM (au plus 40, une par sales).
  const parSales = o.analysesSales && typeof o.analysesSales === "object" ? (o.analysesSales as Record<string, unknown>) : {};
  fiche.analysesSales = Object.fromEntries(
    Object.entries(parSales)
      .slice(0, 40)
      .flatMap(([cle, v]) => {
        const a = normaliserAnalyseIa(v);
        return a ? [[cle.slice(0, 120), a]] : [];
      }),
  );
  return fiche;
}
