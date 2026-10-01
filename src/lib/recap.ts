// Le récap d'un One-on-One, en texte clair, à envoyer au commercial par mail.
import { libelleObjectifChiffre } from "./kpis";
import { formatJour } from "./mois";
import { libelleAjuste } from "./mois-special";
import type { Analysis, Insight, OneOnOne, Rep } from "./types";

const nombre = (n: number, decimales = 1) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: decimales });

const puces = (items: string[]) => items.map((t) => `• ${t}`);

// Une section : son titre (un seul emoji, sobre), une ligne vide, puis ses lignes ; rien s'il n'y a aucune ligne.
function section(titre: string, lignes: string[]) {
  return lignes.length ? [titre, "", ...lignes] : [];
}

// Le récap de ses KPI, en tête du mail. Un TM (vue RM) n'a pas de budget : on donne son pace.
function chiffres(r: Rep) {
  if (!r.hasKpis) return [];
  const volume = (quoi: string, valeur: number, pace: number | null) =>
    r.objectif > 0 ? `${quoi} : ${valeur} / ${r.objectif}` : `${quoi} : ${valeur}${pace != null ? ` (pace ${pace} %)` : ""}`;
  return puces(
    [
      volume("Ventes", r.ventes, r.vPace),
      volume("Installations", r.install, r.iPace),
      r.special && `${libelleAjuste(r.special)} pour ce mois`,
      `POS vendus : ${r.posSales}`,
      r.posShare != null && `POS share : ${nombre(r.posShare)} %`,
      r.sendback != null && `Send back : ${nombre(r.sendback)} %`,
      r.rate != null && `Taux moyen : ${nombre(r.rate, 2)} %`,
    ].filter((l): l is string => Boolean(l)),
  );
}

// Une liste de points, séparés par une ligne vide pour respirer.
const aere = (items: Insight[]) => items.flatMap((i, k) => [...(k ? [""] : []), `• ${i.tt} — ${i.dd}`]);

function sujets(oo: OneOnOne) {
  return oo.sujets
    .map((s) => ({
      t: s.t.trim(),
      o: s.o.trim(),
      reponse: s.reponse.trim(),
      r: s.r.trim(),
      g: s.g.trim(),
      cible: libelleObjectifChiffre(s.cible),
    }))
    .filter((s) => s.t || s.o || s.reponse || s.r || s.g || s.cible)
    .flatMap((s, k) => [
      ...(k ? [""] : []),
      `${k + 1}. ${s.t || `Sujet ${k + 1}`}`,
      ...(s.o ? [`Constat : ${s.o}`] : []),
      ...(s.reponse ? [`Ta réponse : ${s.reponse}`] : []),
      ...(s.r ? [`Comment on règle le problème : ${s.r}`] : []),
      ...(s.g ? [`Objectif : ${s.g}`] : []),
      ...(s.cible ? [`Objectif chiffré : ${s.cible}`] : []),
    ]);
}

// Perf review (cochée par le manager) : les engagements pris pendant ce 1:1.
function engagements(oo: OneOnOne) {
  if (!oo.perfReview) return [];
  return puces(
    oo.sujets.flatMap((s) => {
      const cible = libelleObjectifChiffre(s.cible);
      const detail = [cible, s.g.trim()].filter(Boolean).join(" — ");
      return s.t.trim() || detail ? [`${s.t.trim() || "Engagement"}${detail ? ` : ${detail}` : ""}`] : [];
    }),
  );
}

// Le mail prêt à envoyer, ou null s'il n'y a rien à mettre dedans. Mise en page aérée, ton pro, emojis sobres.
export function recapOneOnOne(rep: Rep, month: string, analysis: Analysis, oo: OneOnOne) {
  const sections = [
    section(`📊 TES CHIFFRES — ${month.toUpperCase()}`, chiffres(rep)),
    section("✅ TES POINTS FORTS", rep.hasKpis ? aere(analysis.S) : []),
    section("📈 TES AXES DE PROGRÈS", rep.hasKpis ? aere(analysis.A) : []),
    section("POINTS D'ATTENTION", rep.hasKpis ? aere(analysis.N) : []),
    section("🎯 CE QU'ON A TRAVAILLÉ ENSEMBLE", sujets(oo)),
    section("🤝 CE DONT TU AS BESOIN", oo.besoin.trim() ? [oo.besoin.trim()] : []),
    section("⭐ TON OBJECTIF PERSO DU MOIS", oo.objectif.trim() ? [oo.objectif.trim()] : []),
    section("📌 PERF REVIEW — TES ENGAGEMENTS", engagements(oo)),
  ].filter((s) => s.length);
  if (!sections.length) return null;

  const prenom = rep.name.split(" ")[0];
  const quand = oo.clotureLe ? `du ${formatJour(oo.clotureLe, true)}` : `de ${month.toLowerCase()}`;
  const corps = [
    `Bonjour ${prenom},`,
    "",
    `Merci pour notre One-on-One ${quand}. Voici le récap de ce que nous nous sommes dit.`,
    ...sections.flatMap((s) => ["", "", ...s]),
    "",
    "",
    "On fait le point au prochain One-on-One. Bon mois !",
  ].join("\n");
  return { objet: `Récap de ton One-on-One — ${month}`, corps };
}

// Lien qui ouvre le logiciel mail avec l'objet et le texte pré-remplis (destinataire à compléter).
export function lienMailto({ objet, corps }: { objet: string; corps: string }) {
  const encode = (t: string) => encodeURIComponent(t.replace(/\n/g, "\r\n"));
  return `mailto:?subject=${encode(objet)}&body=${encode(corps)}`;
}
