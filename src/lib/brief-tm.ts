// Vue RM : le brief et l'analyse « data analyst » d'un TM, préparés par Gemini à partir du BI importé par le RM
// (la ligne agrégée du TM ET le détail de tous ses sales). Même format de réponse que le brief d'un sales
// (brief + sujets), avec en plus l'analyse du TM rangée dans le brief (brief.analyse).
import { lignesEngagements, lireSujet, normaliserAnalyse, normaliserBrief, normaliserSujetPrevu } from "./brief";
import type { LigneBiAnalyse } from "./bi-rm";
import { COLONNES_BI_RM, type DonneesBiRm, formatBiRm } from "./lecture-bi-rm";
import { consigneObjectifsEquipe } from "./objectifs-equipe";
import type { Engagement } from "./suivi";
import { REGLE_SUCCES_EQUIPE, VOCABULAIRE_ET_LECTURE } from "./consignes-communes";
import { filtrerReallocation } from "./garde-fou";
import { normaliserDiagnostic } from "./parcours-ia";
import type { AnalyseIa, Analysis, BriefIa, DiagnosticIa, Insight, Subject, SujetPrevu } from "./types";

// La consigne de l'analyste, EXACTEMENT telle que validée par le RM : ses règles (règle absolue leads, cibles,
// lecture du tunnel), partagées par le brief, le Parcours et l'analyse d'un sales dans la vue RM…
export const CONSIGNE_ANALYSTE = `Tu es un analyste data commercial chez Flatpay qui prépare le 1:1 d'un RM avec l'un de ses TM
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
INTERDIT de proposer de réallouer/redistribuer/déplacer des leads entre des personnes, jamais, sous aucune forme.

${VOCABULAIRE_ET_LECTURE}

**PRIORITÉ — LE RM JUGE L'ÉQUIPE, PAS CHAQUE SALES** :
- L'objectif est d'OPTIMISER L'ÉQUIPE dans son ensemble.
- Le détail par sales sert UNIQUEMENT de diagnostic/contexte pour comprendre le résultat de l'équipe.
- Les succès, axes, vigilance, sujets, questions, OBJECTIFS et ENGAGEMENTS portent sur l'ÉQUIPE et les leviers
  de management du TM, jamais sur un sales isolé.
- Les engagements proposés sont des ENGAGEMENTS D'ÉQUIPE pris par le TM.
- Cibles équipe à utiliser pour les objectifs : POS share 25 %, conversion 20 %, send back ≤ 10 %, développer le
  follow-up de l'équipe. La question engage le PLAN D'ACTION du TM en tant que manager.
${REGLE_SUCCES_EQUIPE}

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
développement du follow-up et de la conversion).`;

// … puis ce que rend le brief du 1:1.
const RENDU_BRIEF = `Rends : 3 succès max, 2 axes max, 1 point de vigilance max (réservé au vraiment critique), au
niveau équipe/TM ; un brief de posture pour le RM (2-3 phrases) ; chaque point est une phrase
d'analyste qui RELIE les chiffres. N'invente aucun chiffre, n'utilise que les valeurs fournies.
Distingue explicitement 'levier du sales/TM' et 'input boîte (leads)'. Ton constructif.`;

// La consigne complète du brief (texte inchangé) : les règles de l'analyste, puis ce qu'il rend.
const CONSIGNE = `${CONSIGNE_ANALYSTE}\n${RENDU_BRIEF}`;

// « Signed Sales 12 · Sales Budget 15 · … » : toutes les colonnes renseignées d'une ligne, avec l'intitulé du BI.
// Les colonnes « Slack » ne sont jamais envoyées à l'IA (à ne pas utiliser, comme le TPV qui n'est même pas lu).
function valeurs(d: DonneesBiRm) {
  return COLONNES_BI_RM.filter((c) => d[c.cle] != null && !c.cle.startsWith("slack"))
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
  nbActifs,
}: {
  nomTm: string;
  mois: string;
  moisPrecedent: string;
  tm: LigneBiAnalyse;
  sales: LigneBiAnalyse[];
  engagements: Engagement[];
  nbActifs: number; // sales ACTIFS du TM (roster) : base des objectifs d'équipe POS et OG
}) {
  const prenom = nomTm.split(" ")[0];
  return `${CONSIGNE}

${consigneObjectifsEquipe(nbActifs)}

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
- "celebrer" : « Points forts », 1 à 3 points forts RÉELS de l'équipe (100 % ou plus, pas portés par 1 ou 2 sales ; juste au-dessus de l'objectif = « à maintenir, continuer sur cette lancée »).
- "engagements" : 1 à 2 phrases sur les engagements D'ÉQUIPE pris par ${prenom} le mois dernier ("" s'il n'y en avait pas).
- "sujet" : le sujet principal à ouvrir avec ${prenom}, au niveau de l'ÉQUIPE (ce que le TM peut piloter : conversion, follow-up, POS, send back, accompagnement des sales ; jamais les leads, jamais un sales isolé).
- "question" : UNE question ouverte adressée à ${prenom}, qui engage SON PLAN D'ACTION de manager sur ce sujet d'équipe. Elle ne porte JAMAIS sur le volume de leads / d'IH, leur répartition ou leur justification, ni sur un sales isolé.
- "ouverture" : 2 à 3 questions pour ouvrir l'entretien sur la personne (motivation, charge, ambiance d'équipe), bienveillantes, jamais intrusives.
- "sujets" : 1 à 3 sujets D'ÉQUIPE (un par vrai problème, jamais deux sur le même thème) pour la fiche du 1:1 (ce seront les ENGAGEMENTS D'ÉQUIPE pris par ${prenom}), du plus important au moins important : {"titre", "constat" (factuel, au niveau de l'équipe, avec les chiffres fournis), "questions": [{"q": "…", "type": "performance" | "developpement" | "humain"}] (1 à 3, adressées à ${prenom} sur son plan d'action de manager, jamais sur les leads ni sur un sales isolé), "objectif": {"kpi": "posShare" | "ihcr" | "sendback" | "ventes" | "install" | "og", "sens": ">=" | "<=", "valeur": nombre} ou null — un objectif chiffré est un objectif D'ÉQUIPE qui s'appuie TOUJOURS sur les cibles équipe (posShare ≥ 25, ihcr ≥ 20, sendback ≤ 10)}.
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

// L'analyse renvoyée par Gemini ({ S, A, N } de points avec leur nature) → Analysis (3 / 2 / 1 au plus), ou null.
// La nature est mise en tête de la phrase : « Input boîte (leads) · … ».
export function lireAnalyse(raw: unknown): Analysis | null {
  const brut = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const avecNature = (liste: unknown) =>
    Array.isArray(liste)
      ? liste.map((x): Partial<Insight> => {
          const i = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
          const nature = typeof i.nature === "string" ? NATURES[i.nature.trim().toLowerCase()] : undefined;
          const dd = typeof i.dd === "string" ? i.dd.trim() : "";
          return { big: i.big as string, tt: i.tt as string, dd: nature && dd ? `${nature} · ${dd}` : dd };
        })
      : [];
  return normaliserAnalyse({ S: avecNature(brut.S), A: avecNature(brut.A), N: avecNature(brut.N) });
}

// Réponse texte de Gemini → brief (avec l'analyse du TM) + sujets, ou null si inexploitable (modèle suivant).
export function lireReponseBriefTm(reponse: string, genereLe: string): { brief: BriefIa; sujets: Subject[] } | null {
  try {
    // Filtre en dur : toute phrase qui propose de réallouer des leads est retirée avant la lecture.
    const o = filtrerReallocation(JSON.parse(lireJson(reponse)));
    const analyse = lireAnalyse(o?.analyse);
    const brief = normaliserBrief({ ...o, analyse, genereLe });
    const sujets = Array.isArray(o.sujets) ? o.sujets.flatMap((s: unknown) => lireSujet(s) ?? []).slice(0, 2) : [];
    // Sans analyse ni brief complet, la réponse ne sert à rien : on passe au modèle suivant.
    return brief?.analyse && sujets.length ? { brief, sujets } : null;
  } catch {
    return null;
  }
}

// ——— Le Parcours d'un TM dans le temps (même consigne d'analyste, rendu = diagnostic de parcours) ———

export function promptParcoursTm({
  nomTm,
  parMois,
  dernierMois,
  salesDernierMois,
  unUn,
  nbActifs,
}: {
  nomTm: string;
  parMois: [string, DonneesBiRm][]; // du plus ancien au plus récent
  dernierMois: string;
  salesDernierMois: LigneBiAnalyse[];
  unUn: string[]; // ce que disent les 1:1 passés (ressenti, blocages, besoins), une ligne par 1:1
  nbActifs: number; // sales ACTIFS du TM (roster) : base des objectifs d'équipe POS et OG
}) {
  const prenom = nomTm.split(" ")[0];
  return `${CONSIGNE_ANALYSTE}
${consigneObjectifsEquipe(nbActifs)}
Distingue explicitement 'levier du sales/TM' et 'input boîte (leads)'. Ton constructif.

——— CETTE FOIS : LE DIAGNOSTIC DE PARCOURS DE ${nomTm.toUpperCase()} DANS LE TEMPS ———
Tu établis un VERDICT sur l'équipe de ${prenom} mois après mois, pour que le RM sache s'il doit s'inquiéter, la pousser ou la valoriser. Pas une répétition des chiffres : relie les mois entre eux (tendance, régularité, ce qui monte, ce qui coince), toujours avec la RÈGLE ABSOLUE sur les leads (contexte seulement) et les CIBLES DE RÉFÉRENCE. Tu écris AU RM (tutoiement), en français, court et concret.

LIGNE AGRÉGÉE DE L'ÉQUIPE, MOIS PAR MOIS (valeurs brutes du BI ; absent = non renseigné) :
${parMois.map(([m, d]) => `- ${m} : ${valeurs(d) || "(aucune valeur lisible)"}`).join("\n")}

DÉTAIL DES SALES EN ${dernierMois.toUpperCase()} (${salesDernierMois.length}) :
${salesDernierMois.length ? salesDernierMois.map((s) => `- ${s.nom} : ${valeurs(s.donnees) || "(aucune valeur lisible)"}`).join("\n") : "- (aucun)"}

LES 1:1 PASSÉS AVEC ${prenom.toUpperCase()} :
${unUn.join("\n") || "- (aucun 1:1 renseigné)"}

PROFILS (choisis-en UN, le plus juste, pour l'équipe) :
- "valeur_sure" : régulière et fiable, au budget la plupart des mois.
- "progression" : tendance nette à l'amélioration sur ce qui compte (volume, conversion, POS share).
- "risque" : décroche de façon durable sur les leviers, ou plusieurs signaux graves qui s'accumulent.
- "irregulier" : alterne bons et mauvais mois sans tendance claire.
- "rampup" : équipe en construction (plusieurs sales en démarrage), à juger sur sa courbe.
- "repli" : était bonne, baisse depuis quelques mois sans être encore critique.

CE QUE TU RENDS (JSON) :
- "profil" : une des clés ci-dessus.
- "phrase" : le profil en UNE phrase d'analyste, avec un fait à l'appui (valeurs fournies uniquement).
- "trajectoire" : {"sens": "progresse" | "stagne" | "decroche", "texte": 1 phrase qui relie les mois}.
- "monte" et "coince" : 2 à 3 points AU TOTAL entre les deux listes ; jamais le volume de leads dans "coince".
- "priorite" : {"texte": ce qui mérite l'attention du RM en premier, "action": une action concrète d'ÉQUIPE que ${prenom} peut piloter en manager (conversion, follow-up, POS, send back, accompagnement des sales ; jamais les leads, jamais un sales isolé)}.
- "reussites" : 1 à 3 réussites marquantes de l'équipe dans le temps.
Chaque texte fait au plus 250 caractères. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"profil": "…", "phrase": "…", "trajectoire": {"sens": "…", "texte": "…"}, "monte": ["…"], "coince": ["…"], "priorite": {"texte": "…", "action": "…"}, "reussites": ["…"]}`;
}

// ——— L'analyse d'UN sales, vue par le RM (même consigne d'analyste, au niveau du sales) ———

export function promptAnalyseSales({
  nomSales,
  nomTm,
  mois,
  sales,
  equipe,
  nbSales,
  nbActifs,
}: {
  nomSales: string;
  nomTm: string;
  mois: string;
  sales: DonneesBiRm;
  equipe: DonneesBiRm | null; // la ligne agrégée de son TM, pour situer le sales dans son équipe
  nbSales: number;
  nbActifs: number; // sales ACTIFS du TM (roster) : base des objectifs d'équipe POS et OG
}) {
  return `${CONSIGNE_ANALYSTE}
${consigneObjectifsEquipe(nbActifs)}
Distingue explicitement 'levier du sales/TM' et 'input boîte (leads)'. Ton constructif.

——— CETTE FOIS : L'ANALYSE D'UN SEUL SALES ———
Le RM zoome sur ${nomSales}, sales de l'équipe de ${nomTm} (${nbSales} sales), en ${mois.toLowerCase()}. Rappel : le RM juge l'ÉQUIPE ; ce zoom sert de DIAGNOSTIC pour comprendre le résultat de l'équipe. Lis CE sales comme un data analyst : décompose son tunnel (IH reçus × conversion), son mix quick/follow-up, son POS, son OG, son upfront, son send back, en le situant par rapport à la ligne de son équipe, et dis ce que cela révèle pour l'équipe et pour le management du TM. RÈGLE ABSOLUE : ses leads sont un input de la boîte, jamais un axe ni un reproche ; s'il convertit bien avec peu de leads, c'est un succès « à alimenter en leads (côté boîte) ».

${nomSales} (valeurs brutes du BI) :
${valeurs(sales) || "(aucune valeur lisible)"}

Son équipe (ligne agrégée de ${nomTm}) :
${equipe ? valeurs(equipe) || "(aucune valeur lisible)" : "(non disponible)"}

Les axes sont formulés comme des leviers de management du TM pour l'équipe, jamais comme un reproche au sales.
${renduAnalyse(`de ${nomSales} avec son TM`)}`;
}

// Ce que renvoient les routes d'analyse (/api/analyse-commercial, /api/analyse-tm, /api/analyse-sales-rm) au navigateur.
export type AnalyseIaReponse = { ok: true; analyseIa: AnalyseIa } | { ok: false; error: string; reessayable?: boolean };

// Le JSON renvoyé par Gemini, sans l'éventuel bloc ```json … ``` autour.
const lireJson = (reponse: string) => reponse.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");

// Parcours d'un TM : réponse texte de Gemini → diagnostic (même format que pour un commercial), après le filtre en dur
// anti-réallocation de leads ; null si inexploitable (modèle suivant).
export function lireReponseDiagnosticTm(reponse: string, genereLe: string): DiagnosticIa | null {
  try {
    return normaliserDiagnostic({ ...filtrerReallocation(JSON.parse(lireJson(reponse))), genereLe });
  } catch {
    return null;
  }
}

// ——— L'analyse unique « data analyst » (sales en accès TM, TM en accès RM, sales en zoom RM) ———

// Un morceau de la consigne validée, repris mot pour mot.
const morceauConsigne = (debut: string, fin: string) =>
  CONSIGNE_ANALYSTE.slice(CONSIGNE_ANALYSTE.indexOf(debut), CONSIGNE_ANALYSTE.indexOf(fin)).trim();

// La même consigne d'analyste, au niveau d'UN sales dans le 1:1 de son TM : mêmes règles (leads, cibles, tunnel, mix).
export const CONSIGNE_COMMERCIAL = `Tu es un analyste data commercial chez Flatpay qui prépare le 1:1 d'un TM (manager) avec l'un de ses
commerciaux (sales). Tu reçois les chiffres du mois de ce sales. Analyse comme un vrai data analyst.

${morceauConsigne("**RÈGLE ABSOLUE", "**PRIORITÉ")}

${morceauConsigne("**CIBLES DE RÉFÉRENCE", "Au niveau du TM")}
Au niveau du sales, regarde : son volume (ventes et installations contre SON objectif du mois), son tunnel (IH reçus ×
conversion), son mix quick/follow-up, son POS (share 25 %), son OG, son upfront, son send back, et ce qu'il peut travailler.`;

// Ce que rend l'analyse (+ les sujets prévus du 1:1 si demandés).
function renduAnalyse(sujetsPour: string | null) {
  return `CE QUE TU RENDS (JSON) : "analyse" en 3 listes — "S" = succès (3 max), "A" = axes (2 max, uniquement sur des leviers), "N" = point de vigilance (1 max, SEULEMENT si vraiment critique, sinon vide). Chaque point :
{"big": "le chiffre clé, recopié des données", "tt": "titre court", "dd": "UNE phrase d'analyste qui relie les chiffres", "nature": "levier TM" | "levier sales" | "input boîte (leads)"}${
    sujetsPour
      ? `
"sujets" : 1 à 3 SUJETS PRÉVUS (un par vrai problème, jamais deux sur le même thème) pour le 1:1 ${sujetsPour} (de quoi il va parler), tirés de ton analyse, du plus important au moins important : {"titre": "court", "constat": "1 à 2 phrases factuelles avec les chiffres fournis", "questions": ["1 à 3 questions ouvertes, jamais sur les leads"]}.`
      : ""
  }
N'invente aucun chiffre : n'utilise que les valeurs fournies. Chaque texte fait au plus 250 caractères. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"analyse": {"S": [ … ], "A": [ … ], "N": [ … ]}${sujetsPour ? `, "sujets": [ … ]` : ""}}`;
}

// Sales en accès TM : ses KPIs du mois (MOMENTO), son niveau et son objectif du mois.
export function promptAnalyseCommercial({
  nom,
  mois,
  niveau,
  objectif,
  moisParticulier,
  lignes,
}: {
  nom: string;
  mois: string;
  niveau: string;
  objectif: number;
  moisParticulier: string | null;
  lignes: string[]; // ses chiffres du mois, une ligne par KPI renseigné
}) {
  return `${CONSIGNE_COMMERCIAL}

——— LES DONNÉES (${mois.toLowerCase()}) ———
${nom} : niveau ${niveau}, objectif du mois ${objectif} ventes et ${objectif} installations${moisParticulier ? ` (${moisParticulier})` : ""}.
${lignes.join("\n") || "- (aucun chiffre)"}

${renduAnalyse(null)}`;
}

// TM en accès RM : sa ligne d'équipe et le détail de ses sales (même consigne et objectifs d'équipe que le brief).
export function promptAnalyseTm({
  nomTm,
  mois,
  tm,
  sales,
  nbActifs,
}: {
  nomTm: string;
  mois: string;
  tm: LigneBiAnalyse;
  sales: LigneBiAnalyse[];
  nbActifs: number;
}) {
  return `${CONSIGNE_ANALYSTE}
Distingue explicitement 'levier du sales/TM' et 'input boîte (leads)'. Ton constructif.

${consigneObjectifsEquipe(nbActifs)}

——— LES DONNÉES (BI de ${mois.toLowerCase()}, valeurs brutes) ———
TM : ${nomTm} — ligne agrégée de son équipe :
${valeurs(tm.donnees) || "(aucune valeur lisible)"}

Ses sales (${sales.length}) :
${sales.length ? sales.map((s) => `- ${s.nom} : ${valeurs(s.donnees) || "(aucune valeur lisible)"}`).join("\n") : "- (aucun)"}

${renduAnalyse(null)}`;
}

// Réponse texte de Gemini → analyse (+ sujets prévus), après le filtre anti-réallocation de leads ; null si inexploitable.
export function lireReponseAnalyseIa(reponse: string): { analyse: Analysis; sujets: SujetPrevu[] } | null {
  try {
    const o = filtrerReallocation(JSON.parse(lireJson(reponse)));
    const analyse = lireAnalyse(o?.analyse);
    if (!analyse) return null;
    const sujets = Array.isArray(o?.sujets) ? o.sujets.flatMap((s: unknown) => normaliserSujetPrevu(s) ?? []).slice(0, 2) : [];
    return { analyse, sujets };
  } catch {
    return null;
  }
}
