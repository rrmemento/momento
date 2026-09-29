// Le récap d'un One-on-One, en texte clair, à envoyer au commercial par mail.
import { libelleObjectifChiffre } from "./kpis";
import { formatJour } from "./mois";
import type { Analysis, Insight, OneOnOne, Rep } from "./types";

const nombre = (n: number, decimales = 1) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: decimales });

const puces = (items: string[]) => items.map((t) => `• ${t}`);

// Un bloc « TITRE » suivi de ses lignes ; rien du tout s'il n'y a aucune ligne.
function bloc(titre: string, lignes: string[]) {
  return lignes.length ? [titre, ...lignes] : [];
}

function chiffres(r: Rep) {
  if (!r.hasKpis) return [];
  return puces(
    [
      `Ventes : ${r.ventes} / ${r.budget}`,
      `Installations : ${r.install} / ${r.budget}`,
      `POS vendus : ${r.posSales}`,
      r.posShare != null && `POS share : ${nombre(r.posShare)} %`,
      r.sendback != null && `Send back : ${nombre(r.sendback)} %`,
      r.rate != null && `Taux moyen : ${nombre(r.rate, 2)} %`,
    ].filter((l): l is string => Boolean(l)),
  );
}

function analyse(r: Rep, a: Analysis) {
  if (!r.hasKpis) return [];
  const partie = (titre: string, items: Insight[]) =>
    items.length ? [titre, ...puces(items.map((i) => `${i.tt} — ${i.dd}`))] : [];
  return [
    ...partie("Points forts", a.S),
    ...partie("Axes de progression", a.A),
    ...partie("Points de vigilance", a.N),
  ];
}

function sujets(oo: OneOnOne) {
  return oo.sujets
    .map((s) => ({ t: s.t.trim(), o: s.o.trim(), g: s.g.trim(), cible: libelleObjectifChiffre(s.cible) }))
    .filter((s) => s.t || s.o || s.g || s.cible)
    .flatMap((s, k) => [
      `${k + 1}. ${s.t || `Sujet ${k + 1}`}`,
      ...(s.o ? [`   Constat : ${s.o}`] : []),
      ...(s.g ? [`   Objectif : ${s.g}`] : []),
      ...(s.cible ? [`   Objectif chiffré : ${s.cible}`] : []),
    ]);
}

function besoins(oo: OneOnOne) {
  return [
    ...(oo.besoin.trim() ? [`Ce dont tu as besoin de moi : ${oo.besoin.trim()}`] : []),
    ...(oo.objectif.trim() ? [`Ton objectif perso du mois : ${oo.objectif.trim()}`] : []),
  ];
}

// Le mail prêt à envoyer, ou null s'il n'y a rien à mettre dedans.
export function recapOneOnOne(rep: Rep, month: string, analysis: Analysis, oo: OneOnOne) {
  const sections = [
    bloc("LES CHIFFRES CLÉS", chiffres(rep)),
    bloc("CE QUE MOMENTO A VU", analyse(rep, analysis)),
    bloc("CE QU'ON A TRAVAILLÉ ENSEMBLE", sujets(oo)),
    bloc("TES BESOINS & TON OBJECTIF PERSO", besoins(oo)),
  ].filter((s) => s.length);
  if (!sections.length) return null;

  // Clôturé : « One-on-One du lundi 28 septembre 2026 — Kelly Hochet ».
  const titre = oo.clotureLe
    ? `One-on-One du ${formatJour(oo.clotureLe, true)} — ${rep.name}`
    : `One-on-One ${rep.name} — ${month}`;
  const corps = [
    titre,
    "=".repeat(titre.length),
    ...sections.flatMap((s) => ["", ...s]),
    "",
    "Merci pour cet échange. On fait le point au prochain One-on-One — bon mois !",
  ].join("\n");
  return { objet: `Ton One-on-One — ${month}`, corps };
}

// Lien qui ouvre le logiciel mail avec l'objet et le texte pré-remplis (destinataire à compléter).
export function lienMailto({ objet, corps }: { objet: string; corps: string }) {
  const encode = (t: string) => encodeURIComponent(t.replace(/\n/g, "\r\n"));
  return `mailto:?subject=${encode(objet)}&body=${encode(corps)}`;
}
