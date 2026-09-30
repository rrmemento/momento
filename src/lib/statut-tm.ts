// Vue RM : le statut et l'analyse simple d'un TM, à partir de SA ligne agrégée « tm » du BI importé par le RM.
// Volume (pace ventes / installs) avec les seuils habituels, et surtout le POS share (cible 25 % minimum).
// Le send back est affiché comme information : il ne décide pas du statut. Jamais le budget cumulé de l'équipe :
// les objectifs d'équipe (lib/objectifs-equipe.ts) le remplacent. Un TM ne monte pas en séniorité.
import { pc } from "@/lib/momento";
import { objectifsEquipe } from "@/lib/objectifs-equipe";
import type { Analysis, Insight, Rep, Status } from "@/lib/types";

export const ATTENTE_BI = "En attente de l'import du BI";

export const POS_SHARE_CIBLE = 25; // %
export const POS_SHARE_ALERTE = 20; // % : « nettement en dessous » = moins de 80 % de la cible (comme le pace)

const pct = (f: number) => Math.round(f * 100) + " %";

export function statutTm(r: Rep): Status {
  if (!r.hasKpis) return { k: "none", t: ATTENTE_BI, why: "BI du TM pas encore importé ce mois-ci" };
  // Le volume d'un TM se juge UNIQUEMENT sur son pace (objectif 100 %) : sans pace lu, on ne le juge pas.
  if (r.vPace == null || r.iPace == null) return { k: "none", t: "Pace non lu", why: "pace ventes / installs absent du BI" };
  const vp = r.vPaceF;
  const ip = r.iPaceF;
  const ps = r.posShare;
  const why = [
    `ventes ${pct(vp)}`,
    `installs ${pct(ip)}`,
    `POS share ${ps == null ? "non lu" : pc(ps)}`,
    r.sendback != null && `send back ${pc(r.sendback)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // Volume sous 80 %, ou POS share nettement sous la cible → à accompagner.
  if (vp < 0.8 || ip < 0.8 || (ps != null && ps < POS_SHARE_ALERTE)) return { k: "acc", t: "Équipe à accompagner", why };
  // Volume sous 100 %, ou POS share sous 25 % → au mieux à surveiller.
  if (vp < 1 || ip < 1 || (ps != null && ps < POS_SHARE_CIBLE)) return { k: "watch", t: "Équipe à surveiller", why };
  return { k: "ok", t: "Équipe en forme", why };
}

// Analyse simple d'un TM (tant que l'analyse IA n'est pas préparée), sur les OBJECTIFS D'ÉQUIPE :
// pace ventes / installs contre 100 %, POS share 25 %, POS vendus = sales actifs × 4, OG = sales actifs × 5.
// Vigilance réservée au vraiment critique (pace sous 50 %), comme pour les commerciaux. 3 succès, 2 axes, 1 vigilance.
export function analyseTm(r: Rep, nbActifs: number): Analysis {
  const S: Insight[] = [];
  const A: Insight[] = [];
  const N: Insight[] = [];
  if (!r.hasKpis) return { S, A, N };
  const o = objectifsEquipe(nbActifs);

  // Volume d'abord (dans cet ordre de priorité), sur le pace uniquement.
  const volume = (pace: number | null, quoi: string) => {
    if (pace == null) return;
    const big = `${pace} %`;
    if (pace >= o.pace) S.push({ big, tt: `Pace ${quoi} au niveau`, dd: `Projection fin de mois ${big} (objectif ${o.pace} %).` });
    else if (pace < 50) N.push({ big, tt: `Pace ${quoi} très en dessous`, dd: `Projection fin de mois ${big}, loin de l'objectif ${o.pace} %.` });
    else A.push({ big, tt: `Pace ${quoi} sous l'objectif`, dd: `Projection fin de mois ${big} (objectif ${o.pace} %).` });
  };
  volume(r.vPace, "ventes");
  volume(r.iPace, "installs");

  if (r.posShare != null) {
    const big = pc(r.posShare);
    if (r.posShare >= o.posShare) S.push({ big, tt: "POS share au niveau", dd: `Objectif ${o.posShare} % atteint.` });
    else A.push({ big, tt: "POS share sous l'objectif", dd: `Objectif ${o.posShare} % minimum.` });
  }

  // POS vendus et OG : contre les objectifs d'équipe (sales actifs × 4 et × 5).
  if (nbActifs > 0) {
    const cible = (valeur: number, objectif: number, quoi: string) => {
      const big = `${valeur}/${objectif}`;
      if (valeur >= objectif) S.push({ big, tt: `${quoi} au niveau`, dd: `Objectif d'équipe ${objectif} (${nbActifs} sales actifs).` });
      else A.push({ big, tt: `${quoi} sous l'objectif`, dd: `Objectif d'équipe ${objectif} (${nbActifs} sales actifs).` });
    };
    cible(r.posSales, o.posVendus, "POS vendus");
    cible(r.og, o.og, "Ventes OG");
  }
  return { S: S.slice(0, 3), A: A.slice(0, 2), N: N.slice(0, 1) };
}
