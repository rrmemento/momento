// Vue RM : le statut et l'analyse simple d'un TM, à partir de SA ligne agrégée « tm » du BI importé par le RM.
// Volume (pace ventes / installs) avec les seuils habituels, et surtout le POS share (cible 25 % minimum).
// Le send back est affiché comme information : il ne décide pas du statut. L'analyse fine viendra à la brique 3.
import { pc } from "@/lib/momento";
import type { Analysis, Insight, Rep, Status } from "@/lib/types";

export const ATTENTE_BI = "En attente de l'import du BI";

export const POS_SHARE_CIBLE = 25; // %
export const POS_SHARE_ALERTE = 20; // % : « nettement en dessous » = moins de 80 % de la cible (comme le pace)

const pct = (f: number) => Math.round(f * 100) + " %";

export function statutTm(r: Rep): Status {
  if (!r.hasKpis) return { k: "none", t: ATTENTE_BI, why: "BI du TM pas encore importé ce mois-ci" };
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

// Analyse simple d'un TM (en attendant la brique 3) : volume et POS share, rien d'autre.
// Vigilance réservée au vraiment critique (pace sous 50 %), comme pour les commerciaux.
export function analyseTm(r: Rep): Analysis {
  const S: Insight[] = [];
  const A: Insight[] = [];
  const N: Insight[] = [];
  if (!r.hasKpis) return { S, A, N };
  const obj = r.objectif ? ` sur un objectif de ${r.objectif}` : "";

  const volume = (f: number, nb: number, quoi: string) => {
    const big = pct(f);
    if (f >= 1) S.push({ big, tt: `Pace ${quoi} au niveau`, dd: `${nb} ${quoi}${obj}, projection fin de mois ${big}.` });
    else if (f < 0.5) N.push({ big, tt: `Pace ${quoi} très en dessous`, dd: `${nb} ${quoi}${obj} : l'équipe est loin du budget.` });
    else A.push({ big, tt: `Pace ${quoi} sous le budget`, dd: `${nb} ${quoi}${obj}, projection fin de mois ${big}.` });
  };
  volume(r.vPaceF, r.ventes, "ventes");
  volume(r.iPaceF, r.install, "installs");

  if (r.posShare != null) {
    const big = pc(r.posShare);
    if (r.posShare >= POS_SHARE_CIBLE) S.push({ big, tt: "POS share au niveau", dd: `${r.posSales} POS signés, cible ${POS_SHARE_CIBLE} % atteinte.` });
    else A.push({ big, tt: "POS share sous la cible", dd: `${r.posSales} POS signés, cible ${POS_SHARE_CIBLE} % minimum.` });
  }
  return { S, A, N };
}
