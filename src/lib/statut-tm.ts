// Vue RM : le statut et l'analyse simple d'un TM, à partir de SA ligne agrégée « tm » du BI importé par le RM.
// Même règle des 3 piliers qu'un sales : pace ventes, pace installs, POS share (OK ≥ 25 %, cata sous 15 %).
// Le send back est affiché comme information : il ne décide pas du statut. Jamais le budget cumulé de l'équipe :
// les objectifs d'équipe (lib/objectifs-equipe.ts) le remplacent. Un TM ne monte pas en séniorité.
import { pc, POS_SHARE_CATA, statutPiliers } from "@/lib/momento";
import { objectifsEquipe } from "@/lib/objectifs-equipe";
import type { Analysis, Insight, Rep, Status } from "@/lib/types";

export const ATTENTE_BI = "En attente de l'import du BI";

export { POS_SHARE_CIBLE } from "@/lib/momento";
export const POS_SHARE_ALERTE = POS_SHARE_CATA; // % : sous 15 % = pilier POS share « cata »

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

  // Même règle des 3 piliers qu'un sales (ventes, installs, POS share) ; le send back reste une information.
  const k = statutPiliers(r).k;
  const t = { acc: "Équipe à accompagner", watch: "Équipe à surveiller", voie: "Équipe en bonne voie", ok: "Équipe en forme" }[k];
  return { k, t, why };
}

// Analyse simple d'un TM (tant que l'analyse IA n'est pas préparée), sur les OBJECTIFS D'ÉQUIPE :
// pace ventes / installs contre 100 %, POS share 25 %, POS vendus = effectif × 4, OG = effectif × 5.
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
    if (pace >= o.pace)
      S.push({
        big,
        tt: `Pace ${quoi} au niveau`,
        dd: `Projection fin de mois ${big} (objectif ${o.pace} %).${pace < 110 ? " À maintenir : continuer sur cette lancée." : ""}`,
      });
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

  // POS vendus et OG : contre les objectifs d'équipe (effectif × 4 et × 5).
  if (nbActifs > 0) {
    const cible = (valeur: number, objectif: number, quoi: string) => {
      const big = `${valeur}/${objectif}`;
      if (valeur >= objectif) S.push({ big, tt: `${quoi} au niveau`, dd: `Objectif d'équipe ${objectif} (${nbActifs} sales dans le BI du mois).` });
      else A.push({ big, tt: `${quoi} sous l'objectif`, dd: `Objectif d'équipe ${objectif} (${nbActifs} sales dans le BI du mois).` });
    };
    cible(r.posSales, o.posVendus, "POS vendus");
    cible(r.og, o.og, "Ventes OG");
  }
  return { S: S.slice(0, 3), A: A.slice(0, 2), N: N.slice(0, 1) };
}
