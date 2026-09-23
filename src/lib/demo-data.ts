// Données de démonstration, en attendant Supabase et l'import Power BI.
import { prepRep } from "./momento";
import type { RawRep, Rep } from "./types";

const JUILLET: RawRep[] = [
  { id: "bastien", name: "Bastien Geiger", sen: "M6", budget: 15, install: 11, vPace: 174, iPace: 95, quick: 27.3, avgDays: 14.2, backlog: 9, ventes: 19, sendback: null, rate: 0.92, posSales: 6, posInst: 2, posShare: 31.6, posUpfront: 1958, posRate: 1.06, og: 11, ihcr: 21, ihQuick: 100, ihMtg: 39, mtgAc: 25, discount: -5 },
  { id: "kelly", name: "Kelly Hochet", sen: "M6", budget: 15, install: 10, vPace: 147, iPace: 86, quick: 60.0, avgDays: 10.6, backlog: 4, ventes: 16, sendback: 10.0, rate: 0.89, posSales: 4, posInst: 0, posShare: 25.0, posUpfront: 1300, posRate: 1.05, og: 6, ihcr: 35, ihQuick: 45, ihMtg: 31, mtgAc: 22, discount: 1 },
  { id: "hugo", name: "Hugo Laugier", sen: "M8", budget: 15, install: 9, vPace: 119, iPace: 78, quick: 66.7, avgDays: 7.9, backlog: 7, ventes: 13, sendback: 7.1, rate: 0.81, posSales: 1, posInst: 2, posShare: 7.7, posUpfront: 1001, posRate: 0.99, og: 6, ihcr: 22, ihQuick: 88, ihMtg: 37, mtgAc: 20, discount: -1 },
  { id: "lea", name: "Léa Recordier", sen: "M6", budget: 15, install: 9, vPace: 92, iPace: 78, quick: 22.2, avgDays: 23.9, backlog: 8, ventes: 10, sendback: null, rate: 0.86, posSales: 2, posInst: 4, posShare: 20.0, posUpfront: 1548, posRate: 0.89, og: 4, ihcr: 9, ihQuick: 75, ihMtg: 43, mtgAc: 15, discount: 16 },
  { id: "raphael", name: "Raphael Bouteille", sen: "M3", budget: 15, install: 3, vPace: 138, iPace: 26, quick: null, avgDays: 19.0, backlog: 5, ventes: 15, sendback: 22.7, rate: 1.2, posSales: 3, posInst: 1, posShare: 20.0, posUpfront: 1251, posRate: 1.61, og: 9, ihcr: 23, ihQuick: 86, ihMtg: 30, mtgAc: 38, discount: 3 },
  { id: "linda", name: "Linda Mebarek-Coutas", sen: "M1", budget: 5, install: 0, vPace: 193, iPace: 0, quick: null, avgDays: null, backlog: 2, ventes: 7, sendback: 20.0, rate: 1.0, posSales: 3, posInst: 0, posShare: 42.9, posUpfront: 1933, posRate: 1.09, og: 4, ihcr: 9, ihQuick: 100, ihMtg: 33, mtgAc: 22, discount: 2 },
];

// Un mois = une liste de commerciaux. Chaque mois est archivé.
const RAW_BY_MONTH: Record<string, RawRep[]> = {
  "Juillet 2026": JUILLET,
};

export const DATA: Record<string, Rep[]> = Object.fromEntries(
  Object.entries(RAW_BY_MONTH).map(([month, reps]) => [month, reps.map(prepRep)]),
);

export const MONTHS = Object.keys(DATA);
