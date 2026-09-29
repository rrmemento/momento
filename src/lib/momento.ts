import type { KpiDonnees } from "./kpis";
import { libelleAjuste, objectifDuMois, type MoisSpecial } from "./mois-special";
import type { NiveauMois } from "./niveau-mois";
import type { Analysis, Insight, OneOnOne, RawRep, Rep, Status, StatusKey, Subject } from "./types";

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// Formate un pourcentage : "27.3 %", "25 %" ou "—" si la donnée manque.
export const pc = (v: number | null) => (v == null ? "—" : v.toFixed(v % 1 ? 1 : 0) + " %");

export const firstName = (rep: Rep) => rep.name.split(" ")[0];

// Délai moyen vente → pose : moins de 7 j = installe vite (bon), 7 à 12 j = à améliorer, au-delà de 12 j = critique.
export const DELAI_CIBLE = 7;
export const DELAI_MAX = 12;
export const niveauDelai = (jours: number): "bon" | "moyen" | "critique" =>
  jours < DELAI_CIBLE ? "bon" : jours <= DELAI_MAX ? "moyen" : "critique";

// Le pace du BI est calculé sur le budget normal : pour un mois particulier, on le ramène à l'objectif ajusté
// (même projection de fin de mois, comparée au nouvel objectif).
export function prepRep(r: RawRep, special: MoisSpecial | null = null): Rep {
  const objectif = objectifDuMois(r.budget, special);
  const ajuste = special && objectif ? r.budget / objectif : 1;
  const vPace = r.vPace != null ? Math.round(r.vPace * ajuste) : null;
  const iPace = r.iPace != null ? Math.round(r.iPace * ajuste) : null;
  const vAtt = objectif ? r.ventes / objectif : 0;
  const iAtt = objectif ? r.install / objectif : 0;
  return {
    ...r,
    vPace,
    iPace,
    hasKpis: true,
    partial: false,
    initials: r.name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
    level: r.budget >= 15 ? "M3+" : r.budget >= 10 ? "M2" : "M1",
    objectif,
    special,
    niveauMois: null,
    fiche: { sen: r.sen, budget: r.budget, demarrage: null },
    vAtt,
    iAtt,
    posInstPct: r.install ? (r.posInst / r.install) * 100 : 0,
    vPaceF: vPace != null ? vPace / 100 : vAtt,
    iPaceF: iPace != null ? iPace / 100 : iAtt,
  };
}

type RepBase = { id: string; name: string; sen: string; budget: number; demarrage?: string | null };

// Le niveau et le budget DU MOIS (calculés depuis le démarrage) remplacent ceux de la fiche quand ils sont connus.
function avecNiveau(rep: Rep, base: RepBase, niveau: NiveauMois | null): Rep {
  return { ...rep, niveauMois: niveau, fiche: { sen: base.sen, budget: base.budget, demarrage: base.demarrage ?? null } };
}
const baseDuMois = (base: RepBase, niveau: NiveauMois | null): RepBase =>
  niveau ? { ...base, sen: niveau.seniorite, budget: niveau.budget } : base;

// Un commercial lu en base dont les KPIs ne sont pas encore renseignés : tout à zéro / vide.
export function repWithoutKpis(
  base: RepBase,
  special: MoisSpecial | null = null,
  niveau: NiveauMois | null = null,
): Rep {
  const { id, name, sen, budget } = baseDuMois(base, niveau);
  const rep = prepRep(
    {
      id, name, sen, budget,
      install: 0, vPace: null, iPace: null, quick: null, avgDays: null, backlog: 0, ventes: 0,
      sendback: null, rate: null, posSales: 0, posInst: 0, posShare: null, posUpfront: null, posRate: null, og: 0,
      ihcr: null, ihQuick: null, ihMtg: null, mtgAc: null, discount: null,
    },
    special,
  );
  return { ...avecNiveau(rep, base, niveau), hasKpis: false };
}

// Un commercial + ses chiffres saisis (kpis_mensuels.donnees) → le commercial analysé par MOMENTO.
// Ventes et installs sont le socle du statut : sans eux, le commercial reste en « Chiffres à venir ».
// Les autres comptes vides valent 0 ; les taux / % / € vides restent « non renseignés » (null).
// `special` : mois particulier (congés…) → l'atteinte se juge sur l'objectif ajusté (prioritaire).
// `niveau` : niveau et budget de CE mois (calculés depuis le démarrage) ; sinon ceux de la fiche.
export function repFromKpis(
  base: RepBase,
  d: KpiDonnees | undefined,
  special: MoisSpecial | null = null,
  niveau: NiveauMois | null = null,
): Rep {
  if (!d || d.ventes == null || d.install == null) {
    const partial = Boolean(d && Object.values(d).some((v) => v != null));
    return { ...repWithoutKpis(base, special, niveau), partial };
  }
  const duMois = baseDuMois(base, niveau);
  const zero = (v: number | null | undefined) => v ?? 0;
  const none = (v: number | null | undefined) => v ?? null;
  return avecNiveau(prepRep({
    ...duMois,
    // Volume
    ventes: d.ventes,
    vPace: none(d.vPace),
    og: zero(d.og),
    rate: none(d.taux), // « taux » dans la saisie = « rate » dans l'analyse
    // Installation
    install: d.install,
    iPace: none(d.iPace),
    backlog: zero(d.backlog),
    avgDays: none(d.avgDays),
    quick: none(d.quick),
    // POS
    posSales: zero(d.posSales),
    posInst: zero(d.posInst),
    posShare: none(d.posShare),
    posUpfront: none(d.posUpfront),
    // Activité
    sendback: none(d.sendback),
    ihcr: none(d.ihcr),
    ihQuick: none(d.ihQuick),
    mtgAc: none(d.mtgAc),
    // Pas dans la saisie manuelle
    ihMtg: null,
    posRate: null,
    discount: null,
  }, special), base, niveau);
}

/* ===== Statuts — règle stricte sur le PACE (projection fin de mois = BI) ===== */
export function statut(r: Rep): Status {
  if (!r.hasKpis)
    return {
      k: "none",
      t: "Chiffres à venir",
      why: r.partial ? "ventes ou installs pas encore saisis" : "KPIs du mois non renseignés",
    };
  const vp = r.vPaceF;
  const ip = r.iPaceF;
  if (vp < 0.8 || ip < 0.8) {
    const why =
      ip < 0.8 && vp < 0.8
        ? "ventes & installs sous 80 %"
        : ip < 0.8
          ? "installations sous 80 % (" + Math.round(ip * 100) + "%)"
          : "ventes sous 80 % (" + Math.round(vp * 100) + "%)";
    return { k: "acc", t: "À accompagner", why };
  }
  // signaux graves malgré le volume
  if (r.sendback != null && r.sendback > 18) return { k: "acc", t: "À accompagner", why: "send back trop élevé" };
  if (r.level === "M3+" && r.posSales <= 1) return { k: "acc", t: "À accompagner", why: "POS quasi nul" };
  // 80–100 % => à surveiller ; ≥ 100 % sur les deux => en forme
  if (vp >= 1 && ip >= 1) {
    const w: string[] = [];
    if (r.level === "M3+" && r.posSales < 4) w.push("POS sous 4");
    if (r.sendback != null && r.sendback > 10) w.push("send back " + pc(r.sendback));
    if (w.length) return { k: "watch", t: "À surveiller", why: w[0] };
    return { k: "ok", t: "En forme", why: "objectifs tenus" };
  }
  return {
    k: "watch",
    t: "À surveiller",
    why: ip < 1 ? "installs à finir (" + Math.round(ip * 100) + "%)" : "ventes à finir (" + Math.round(vp * 100) + "%)",
  };
}

const statusRank: Record<StatusKey, number> = { acc: 0, watch: 1, ok: 2, none: 3 };

// Les commerciaux qui ont le plus besoin d'accompagnement en premier.
export function orderReps(reps: Rep[]): Rep[] {
  return [...reps].sort((a, b) => statusRank[statut(a).k] - statusRank[statut(b).k] || a.vAtt - b.vAtt);
}

/* ===== Analyse — points de vigilance = situations vraiment critiques seulement ===== */
export function analyse(r: Rep): Analysis {
  const S: Insight[] = [];
  const A: Insight[] = [];
  const N: Insight[] = [];
  if (!r.hasKpis) return { S, A, N }; // pas de chiffres, rien à analyser
  const eu = (n: number) => "€ " + Math.round(n);
  const aj = r.special ? ` (${libelleAjuste(r.special)})` : ""; // mois particulier : on le signale discrètement

  // ventes
  if (r.vAtt >= 1)
    S.push({ big: Math.round(r.vAtt * 100) + " %", tt: "Budget ventes atteint", dd: `${r.ventes} ventes pour un objectif de ${r.objectif}.${aj}` });
  else if (r.vAtt < 0.5)
    N.push({ big: Math.round(r.vAtt * 100) + " %", tt: "Ventes effondrées", dd: `${r.ventes}/${r.objectif} sur le mois — le socle n'y est pas.${aj}` });
  else
    A.push({ big: Math.round(r.vAtt * 100) + " %", tt: "Ventes sous l'objectif", dd: `${r.ventes}/${r.objectif}, ${r.objectif - r.ventes} à aller chercher.${aj}` });

  // installations
  if (r.iAtt >= 1)
    S.push({ big: Math.round(r.iAtt * 100) + " %", tt: "Budget installations dépassé", dd: `${r.install} installations sur un budget de ${r.objectif}.${aj}` });
  else if (r.iAtt < 0.4)
    N.push({ big: r.install + "", tt: r.install === 0 ? "Aucune installation" : "Installations effondrées", dd: `${r.install}/${r.objectif} — priorité n°1 du 1:1.${aj}` });
  else
    A.push({ big: Math.round(r.iAtt * 100) + " %", tt: "Installations à remonter", dd: `${r.install}/${r.objectif}, ${r.objectif - r.install} manquantes.${aj}` });

  // POS vendus (critique si 0-1 en M3+)
  if (r.level === "M3+" && r.posSales <= 1)
    N.push({ big: r.posSales + "", tt: "POS quasi absent", dd: `${r.posSales} POS sur ${r.ventes} ventes — manque à gagner direct (min 4/mois).` });
  else if (r.level === "M3+" && r.posSales >= 4 && r.posShare != null && r.posShare >= 22)
    S.push({ big: r.posSales + "", tt: "POS solide", dd: `${r.posSales} POS et ${pc(r.posShare)} de share.` });
  else if (r.level === "M3+" && r.posSales < 4)
    A.push({ big: r.posSales + "", tt: "POS sous l'objectif", dd: `viser 4 POS/mois minimum.` });

  // POS share
  if (r.posShare != null && r.posShare >= 25) S.push({ big: pc(r.posShare), tt: "POS Share au niveau", dd: `au-dessus de la cible 25 %.` });
  else if (r.posShare != null && r.level === "M3+" && r.posSales >= 3)
    A.push({ big: pc(r.posShare), tt: "POS Share sous la cible", dd: `${pc(r.posShare)} de POS Share (cible 25 %).` });

  // POS installés %
  if (r.install && r.posInstPct >= 20)
    S.push({ big: pc(r.posInstPct), tt: "POS bien installés", dd: `${r.posInst} POS installés (cible ≥20 %).` });
  else if (r.install && r.posInstPct < 20)
    A.push({ big: pc(r.posInstPct), tt: "POS installés sous 20 %", dd: `${r.posInst}/${r.install} — viser 20 % d'installs POS.` });

  // send back
  if (r.sendback != null && r.sendback <= 10)
    S.push({ big: pc(r.sendback), tt: "Send back maîtrisé", dd: `dossiers propres, peu de retours.` });
  else if (r.sendback != null && r.sendback > 18)
    N.push({ big: pc(r.sendback), tt: "Send back (erreurs) élevé", dd: `${pc(r.sendback)} de send back (cible <10 %). Fiabiliser les deals.` });
  else if (r.sendback != null && r.sendback > 10)
    A.push({ big: pc(r.sendback), tt: "Send back au-dessus de la cible", dd: `${pc(r.sendback)} (cible <10 %).` });

  // OG
  if (r.og >= 8) S.push({ big: r.og + "", tt: "Bon moteur OG", dd: `${r.og} ventes OG, au-dessus de la cible 5.` });
  else if (r.og < 3 && r.level !== "M1")
    A.push({ big: r.og + "", tt: "Prospection OG juste", dd: `relancer la création de RDV en propre.` });

  // délai
  if (r.avgDays != null) {
    const j = r.avgDays + " j";
    const niveau = niveauDelai(r.avgDays);
    if (niveau === "bon") S.push({ big: j, tt: "Pose rapide", dd: `délai vente → pose court (cible < ${DELAI_CIBLE} j).` });
    else if (niveau === "moyen")
      A.push({ big: j, tt: "Délai d'installation à réduire", dd: `${j} entre la vente et la pose (cible < ${DELAI_CIBLE} j).` });
    else
      N.push({
        big: j,
        tt: "Délai d'installation trop long",
        dd: `${j} entre la vente et la pose (cible < ${DELAI_CIBLE} j, alerte au-delà de ${DELAI_MAX} j).`,
      });
  }

  // conversion IH
  if (r.ihcr != null && r.ihcr >= 20) S.push({ big: pc(r.ihcr), tt: "Conversion IH forte", dd: `transforme bien ses RDV entrants.` });
  else if (r.ihcr != null && r.ihcr < 12)
    A.push({
      big: pc(r.ihcr),
      tt: "Conversion IH basse",
      dd: r.ihMtg != null ? `${r.ihMtg} RDV IH pour peu de closing.` : `peu de closing sur ses RDV IH.`,
    });

  // meeting AC
  if (r.mtgAc != null && r.mtgAc >= 40) S.push({ big: pc(r.mtgAc), tt: "Beaucoup de meetings avec AC", dd: `méthode bien appliquée.` });
  else if (r.mtgAc != null && r.mtgAc < 30)
    A.push({ big: pc(r.mtgAc), tt: "% Meeting avec AC sous la cible", dd: `${pc(r.mtgAc)} de meetings avec AC (cible 50 %).` });

  // upfront
  if (r.posUpfront != null && r.posUpfront >= 1200 && r.posSales >= 2)
    S.push({ big: eu(r.posUpfront), tt: "Beaux POS upfront", dd: `au-dessus de la moyenne 1200 €.` });

  return { S: S.slice(0, 4), A: A.slice(0, 4), N: N.slice(0, 3) };
}

/* ===== Fiche 1:1 vide ===== */
export const emptySubject = (): Subject => ({ t: "", o: "", r: "", g: "", questions: "", reponse: "", ia: false, cible: null, suivi: null });

export const emptyOneOnOne = (): OneOnOne => ({
  ressenti: "",
  fier: "",
  bloque: "",
  note: 0,
  titre: "",
  forts: "",
  sujets: [emptySubject()],
  besoin: "",
  objectif: "",
  clotureLe: null,
  brief: null,
  diagnosticIa: null,
});
