// Vue RM : le brief et l'analyse « data analyst » d'un TM, préparés par Gemini à partir du BI importé par le RM
// (la ligne agrégée du TM ET le détail de tous ses sales). Même format de réponse que le brief d'un sales
// (brief + sujets), avec en plus l'analyse du TM rangée dans le brief (brief.analyse).
import { lignesEngagements, lireSujet, normaliserAnalyse, normaliserBrief } from "./brief";
import type { LigneBiAnalyse } from "./bi-rm";
import { COLONNES_BI_RM, type DonneesBiRm, formatBiRm } from "./lecture-bi-rm";
import type { Engagement } from "./suivi";
import type { BriefIa, Insight, Subject } from "./types";

// La consigne de l'analyste, EXACTEMENT telle que validée par le RM.
const CONSIGNE = `Tu es un analyste data commercial chez Flatpay qui prépare le 1:1 d'un RM avec l'un de ses TM
(manager d'une équipe de commerciaux). Tu reçois les chiffres agrégés de l'équipe du TM et le
détail de chacun de ses sales. Analyse comme un vrai data analyst.

**RÈGLE ABSOLUE — LES LEADS (IH)** (prioritaire sur toutes les autres règles) : le nombre d'IH / leads reçus est décidé par la boîte. Ni le
sales ni le TM ne le contrôlent, et personne ne peut redistribuer les leads. N'en fais JAMAIS
un axe, un point de vigilance, un reproche, une QUESTION, ni une action. Ne demande jamais de
'justifier' un nombre de leads ni de les redistribuer. Le nombre de leads sert UNIQUEMENT de
contexte pour expliquer un volume (ex : 'volume plus bas, cohérent avec moins de leads reçus,
non imputable'). Un sales ou un TM qui convertit bien mais a peu de leads = EXCELLENT, à
signaler comme 'à alimenter en leads (côté boîte)', jamais comme un problème.
Les SEULS leviers à travailler (sales comme TM) : la conversion (IH CR, cible ~20%), le mix
quick/follow-up, le POS (share 25%), l'OG, l'upfront, le send back, le nombre de follow-ups
réalisés. Ce qu'un TM peut piloter : faire monter la conversion et le follow-up de ses sales,
pousser le POS share de l'équipe vers 25%, réduire le send back, accompagner les sales faibles
en conversion/mix. PAS la distribution des leads.

**CIBLES DE RÉFÉRENCE** (à utiliser pour TOUT objectif chiffré proposé, toujours alignées) :
- Conversion IH : cible 20 % (ne propose jamais un objectif de conversion en dessous de 20 %).
- POS share : cible 25 % minimum.
- Send back : cible ≤ 10 % (et rappel : au-delà de 18 % c'est grave).
Quand tu proposes un objectif chiffré dans un sujet, il s'appuie sur ces cibles.

Règles :
1) Jamais un ratio seul : croise toujours un taux avec le volume et les autres lignes.
2) Décompose le tunnel : ventes ≈ nombre d'IH (leads reçus) × taux de conversion (IH CR).
   Trouve le maillon qui bloque.
3) Sépare les leviers du sales des inputs de la boîte : les IH/leads sont ENVOYÉS par la boîte,
   en manquer n'est PAS un reproche au sales. Leviers du sales = conversion (IH CR, cible ~20%),
   mix quick/follow-up, POS (share cible 25%), OG, upfront, send back. Si les ratios d'un sales
   sont bons mais son volume bas → 'excellent, à alimenter en leads', jamais un axe contre lui.
4) Mix quick/follow-up : 100% quick + volume faible sur la durée = ne sait pas signer en
   follow-up (axe de développement) ; gros volume avec beaucoup de quick = excellent ;
   part de quick modérée avec bon volume = bien géré.
Au niveau du TM (manager), regarde : la perf globale de l'équipe (volume vs budget, POS share
25%), la répartition (l'équipe est-elle portée par 1-2 sales ou équilibrée ?), qui décroche et
POURQUOI (leads ? conversion ? mix ?), et ce que le TM peut piloter (montée en POS,
développement du follow-up et de la conversion).
Rends : 3 succès max, 2 axes max, 1 point de vigilance max (réservé au vraiment critique), au
niveau équipe/TM ; un brief de posture pour le RM (2-3 phrases) ; chaque point est une phrase
d'analyste qui RELIE les chiffres. N'invente aucun chiffre, n'utilise que les valeurs fournies.
Distingue explicitement 'levier du sales/TM' et 'input boîte (leads)'. Ton constructif.`;

// « Signed Sales 12 · Sales Budget 15 · … » : toutes les colonnes renseignées d'une ligne, avec l'intitulé du BI.
function valeurs(d: DonneesBiRm) {
  return COLONNES_BI_RM.filter((c) => d[c.cle] != null)
    .map((c) => `${c.libelle} ${formatBiRm(c.cle, d[c.cle])}`)
    .join(" · ");
}

export function promptBriefTm({
  nomTm,
  mois,
  moisPrecedent,
  tm,
  sales,
  engagements,
}: {
  nomTm: string;
  mois: string;
  moisPrecedent: string;
  tm: LigneBiAnalyse;
  sales: LigneBiAnalyse[];
  engagements: Engagement[];
}) {
  const prenom = nomTm.split(" ")[0];
  return `${CONSIGNE}

——— LES DONNÉES (BI de ${mois.toLowerCase()}, valeurs brutes telles qu'importées ; « — » ou absent = non renseigné) ———
Repères de lecture : "IH Performed" = IH réalisés (leads reçus, envoyés par la boîte) · "CRM IH CR%" = taux de conversion des IH · "Quick Sale %" = part des ventes signées en quick (le reste en follow-up) · "POS Signed %" = POS share · "Signed OG Sales #" = ventes OG · "Sales Budget" = budget de ventes · "Sales Budget Pace" et "Budget Pace" = projection fin de mois des ventes et des installs vs budget · "Sent Back Rate" = send back · "Avg Upfront" = upfront moyen · "Total Upfront" = prix total des caisses.

TM : ${nomTm} — ligne agrégée de son équipe :
${valeurs(tm.donnees) || "(aucune valeur lisible)"}

Ses sales (${sales.length}), un par ligne :
${sales.length ? sales.map((s) => `- ${s.nom} : ${valeurs(s.donnees) || "(aucune valeur lisible)"}`).join("\n") : "- (aucun sales sous ce TM dans le BI)"}

Engagements pris par ${prenom} au 1:1 de ${moisPrecedent.toLowerCase()} :
${lignesEngagements(engagements).join("\n")}

——— CE QUE TU RENDS ———
Tout est écrit pour le RM, qui mènera le 1:1 avec ${prenom} (tutoiement quand tu t'adresses à ${prenom}).
- "analyse" : l'analyse au niveau équipe/TM, en 3 listes. "S" = succès (3 max), "A" = axes (2 max), "N" = point de vigilance (1 max, SEULEMENT si vraiment critique, sinon liste vide). Chaque point est un objet :
  {"big": "le chiffre clé, recopié des données (ex: \\"21,9 %\\")", "tt": "titre court", "dd": "UNE phrase d'analyste qui relie les chiffres", "nature": "levier TM" | "levier sales" | "input boîte (leads)"}
  Les axes ("A") et le point de vigilance ("N") ne portent JAMAIS sur le volume de leads / d'IH : uniquement sur les leviers listés dans la RÈGLE ABSOLUE. La nature "input boîte (leads)" ne sert qu'à donner du CONTEXTE (par exemple dans un succès : « à alimenter en leads, côté boîte »), jamais pour un axe ni une vigilance.
- "aborder" : le brief de posture pour le RM, 2 à 3 phrases.
- "celebrer" : 1 à 3 réussites de l'équipe à reconnaître devant ${prenom}.
- "engagements" : 1 à 2 phrases sur les engagements du mois dernier ("" s'il n'y en avait pas).
- "sujet" : le sujet principal à ouvrir avec ${prenom} (ce que le TM peut piloter : conversion, follow-up, POS, send back, accompagnement des sales ; jamais les leads).
- "question" : UNE question ouverte adressée à ${prenom}, liée au sujet. Elle ne porte JAMAIS sur le volume de leads / d'IH, leur répartition ou leur justification.
- "ouverture" : 2 à 3 questions pour ouvrir l'entretien sur la personne (motivation, charge, ambiance d'équipe), bienveillantes, jamais intrusives.
- "sujets" : 1 à 2 sujets de travail pour la fiche du 1:1, du plus important au moins important : {"titre", "constat" (factuel, avec les chiffres fournis), "questions": [{"q": "…", "type": "performance" | "developpement" | "humain"}] (1 à 3, adressées à ${prenom}, jamais sur les leads), "objectif": {"kpi": "ventes" | "install" | "posShare" | "ihcr" | "og" | "sendback", "sens": ">=" | "<=", "valeur": nombre} ou null — un objectif chiffré s'appuie TOUJOURS sur les CIBLES DE RÉFÉRENCE (ihcr ≥ 20, posShare ≥ 25, sendback ≤ 10)}.
Aucune question sur une évolution de poste, une promotion, un salaire ou une prime.
Chaque texte fait au plus 300 caractères. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"analyse": {"S": [ … ], "A": [ … ], "N": [ … ]}, "aborder": "…", "celebrer": ["…"], "engagements": "…", "sujet": "…", "question": "…", "ouverture": ["…", "…"], "sujets": [ … ]}`;
}

// La nature d'un point, affichée devant la phrase : levier du sales / du TM, ou input de la boîte (leads).
const NATURES: Record<string, string> = {
  "levier tm": "Levier TM",
  "levier sales": "Levier sales",
  "input boîte (leads)": "Input boîte (leads)",
  "input boite (leads)": "Input boîte (leads)",
};

// Réponse texte de Gemini → brief (avec l'analyse du TM) + sujets, ou null si inexploitable (modèle suivant).
export function lireReponseBriefTm(reponse: string, genereLe: string): { brief: BriefIa; sujets: Subject[] } | null {
  try {
    const o = JSON.parse(reponse.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const brut = o?.analyse && typeof o.analyse === "object" ? (o.analyse as Record<string, unknown>) : {};
    // La nature est mise en tête de la phrase : « Input boîte (leads) · … ».
    const avecNature = (liste: unknown) =>
      Array.isArray(liste)
        ? liste.map((x): Partial<Insight> => {
            const i = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
            const nature = typeof i.nature === "string" ? NATURES[i.nature.trim().toLowerCase()] : undefined;
            const dd = typeof i.dd === "string" ? i.dd.trim() : "";
            return { big: i.big as string, tt: i.tt as string, dd: nature && dd ? `${nature} · ${dd}` : dd };
          })
        : [];
    const analyse = normaliserAnalyse({ S: avecNature(brut.S), A: avecNature(brut.A), N: avecNature(brut.N) });
    const brief = normaliserBrief({ ...o, analyse, genereLe });
    const sujets = Array.isArray(o.sujets) ? o.sujets.flatMap((s: unknown) => lireSujet(s) ?? []).slice(0, 2) : [];
    // Sans analyse ni brief complet, la réponse ne sert à rien : on passe au modèle suivant.
    return brief?.analyse && sujets.length ? { brief, sujets } : null;
  } catch {
    return null;
  }
}
