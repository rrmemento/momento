// Les chiffres montrés au commercial en mode présentation, avec leur couleur de sens.
// Mêmes seuils que MOMENTO (statut() pour le pace, analyse() pour le reste) :
// vert = objectif atteint / bon · orange = à améliorer · rouge = critique. Jamais l'étiquette de statut.
import { formatKpi } from "@/lib/kpis";
import { libelleAjuste } from "@/lib/mois-special";
import { ciblesVolume, niveauDelai } from "@/lib/momento";
import { POS_SHARE_ALERTE, POS_SHARE_CIBLE } from "@/lib/statut-tm";
import type { Rep } from "@/lib/types";

export type Ton = "bon" | "moyen" | "critique" | null; // null = neutre (pas de repère MOMENTO)

export type Jauge = {
  label: string;
  valeur: number;
  objectif: number;
  ratio: number;
  pace: number | null;
  ton: Ton;
  note: string | null; // « objectif ajusté (congés) » pour un mois particulier
};
export type ChiffreCle = { cle: string; label: string; valeur: string; ton: Ton };

const pourcent = (v: number) => `${formatKpi(Math.round(v * 10) / 10)} %`;

// Ventes et installations : jugées sur le pace (projection fin de mois), comme le statut MOMENTO.
// Sous 80 % = critique, 80 à 100 % = à améliorer, 100 % et plus = atteint.
const tonPace = (paceF: number): Ton => (paceF >= 1 ? "bon" : paceF >= 0.8 ? "moyen" : "critique");

export function jauges(r: Rep): Jauge[] {
  const note = r.special ? libelleAjuste(r.special) : null;
  return [
    { label: "Ventes signées", valeur: r.ventes, objectif: r.objectif, ratio: r.vAtt, pace: r.vPace, ton: tonPace(r.vPaceF), note },
    { label: "Installations", valeur: r.install, objectif: r.objectif, ratio: r.iAtt, pace: r.iPace, ton: tonPace(r.iPaceF), note },
  ];
}

// Les autres chiffres saisis (les vides ne sont pas montrés).
export function autresChiffres(r: Rep): ChiffreCle[] {
  const m3 = r.level === "M3+";
  const c = ciblesVolume(r); // POS et OG au prorata de l'objectif du mois (mois particulier)
  const liste: (ChiffreCle | false)[] = [
    // Délai vente → pose : indicateur clé, en tête. < 7 j = bon, 7 à 12 j = à améliorer, au-delà = critique.
    r.avgDays != null && {
      cle: "avgDays",
      label: "Délai moyen de pose",
      valeur: `${formatKpi(r.avgDays)} j`,
      ton: niveauDelai(r.avgDays),
    },
    // POS : l'exigence (4 par mois minimum) ne concerne que les M3+ ; neutre pour les M1 et M2.
    {
      cle: "posSales",
      label: "POS vendus",
      valeur: String(r.posSales),
      ton: !m3 ? null : r.posSales >= c.posMin ? "bon" : r.posSales <= c.posQuasiNul ? "critique" : "moyen",
    },
    {
      cle: "posInst",
      label: "POS installés",
      valeur: r.install ? `${r.posInst} · ${pourcent(r.posInstPct)}` : String(r.posInst),
      ton: !r.install ? null : r.posInstPct >= 20 ? "bon" : "moyen",
    },
    r.posShare != null && {
      cle: "posShare",
      label: "POS share",
      valeur: pourcent(r.posShare),
      ton: r.posShare >= 25 ? "bon" : m3 && r.posSales >= c.posPourShare ? "moyen" : null,
    },
    {
      cle: "og",
      label: "Ventes OG",
      valeur: String(r.og),
      ton: r.og >= c.ogCible ? "bon" : r.og < c.ogFaible && r.level !== "M1" ? "moyen" : null,
    },
    r.quick != null && { cle: "quick", label: "Quick install", valeur: pourcent(r.quick), ton: r.quick >= 60 ? "bon" : null },
    // Send back : au-dessus de 18 % = critique (dossiers en erreur), au-dessus de 10 % = à améliorer.
    r.sendback != null && {
      cle: "sendback",
      label: "Send back",
      valeur: pourcent(r.sendback),
      ton: r.sendback <= 10 ? "bon" : r.sendback > 18 ? "critique" : "moyen",
    },
    r.ihcr != null && {
      cle: "ihcr",
      label: "Conversion IH",
      valeur: pourcent(r.ihcr),
      ton: r.ihcr >= 20 ? "bon" : r.ihcr < 12 ? "moyen" : null,
    },
    r.mtgAc != null && {
      cle: "mtgAc",
      label: "Meeting avec AC",
      valeur: pourcent(r.mtgAc),
      ton: r.mtgAc >= 40 ? "bon" : r.mtgAc < 30 ? "moyen" : null,
    },
  ];
  return liste.filter((c): c is ChiffreCle => Boolean(c));
}

// Le bandeau des écrans « sujet » : l'essentiel, en compact.
export function chiffresBandeau(r: Rep): ChiffreCle[] {
  const [v, i] = jauges(r);
  const autres = autresChiffres(r).filter((c) => ["avgDays", "posSales", "posShare", "sendback"].includes(c.cle));
  return [
    { cle: "ventes", label: "Ventes", valeur: `${v.valeur}/${v.objectif}`, ton: v.ton },
    { cle: "install", label: "Installs", valeur: `${i.valeur}/${i.objectif}`, ton: i.ton },
    ...autres.map((c) => (c.cle === "posSales" ? { ...c, label: "POS" } : c.cle === "avgDays" ? { ...c, label: "Délai" } : c)),
  ];
}

// Classes Tailwind par couleur de sens.
export const TONS: Record<"bon" | "moyen" | "critique" | "neutre", { carte: string; texte: string; barre: string; point: string }> = {
  bon: { carte: "border-good-line bg-good-soft", texte: "text-good", barre: "bg-good", point: "bg-good" },
  moyen: { carte: "border-warn-line bg-warn-soft", texte: "text-warn", barre: "bg-warn", point: "bg-warn" },
  critique: { carte: "border-bad-line bg-bad-soft", texte: "text-bad", barre: "bg-bad", point: "bg-bad" },
  neutre: { carte: "border-line bg-surface", texte: "text-ink", barre: "bg-accent", point: "bg-faint" },
};

export const ton = (t: Ton) => TONS[t ?? "neutre"];

// Vue RM (présentation à un TM) : les repères d'un commercial seul (POS min 4, OG cible 5…) ne valent pas pour une équipe.
// On ne garde la couleur que pour le volume (déjà jugé sur le pace) et le POS share (cible 25 %, alerte sous 20 %).
export function pourUnTm(liste: ChiffreCle[], r: Rep): ChiffreCle[] {
  return liste.map((c) => {
    if (c.cle === "ventes" || c.cle === "install") return c;
    if (c.cle === "posShare" && r.posShare != null) {
      return { ...c, ton: r.posShare >= POS_SHARE_CIBLE ? "bon" : r.posShare < POS_SHARE_ALERTE ? "critique" : "moyen" };
    }
    return { ...c, ton: null };
  });
}
