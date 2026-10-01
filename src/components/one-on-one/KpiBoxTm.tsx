import { COLONNES_BI_RM, type DonneesBiRm, formatBiRm } from "@/lib/lecture-bi-rm";
import { type ObjectifsEquipe, OG_PAR_SALES, POS_PAR_SALES } from "@/lib/objectifs-equipe";
import { POS_SHARE_ALERTE, POS_SHARE_CIBLE } from "@/lib/statut-tm";
import { Tile, type Tone } from "./KpiBox";

// Libellés en français pour les colonnes les plus parlantes ; sinon l'intitulé du BI.
const LIBELLES: Record<string, string> = {
  objectif: "Objectif (Sales Budget)",
  ventes: "Ventes signées",
  vPace: "Pace ventes",
  install: "Installations",
  iPace: "Pace installs",
  backlog: "Installs en attente de validation",
  posSales: "POS vendus",
  posShare: "POS share",
  posUpfront: "Upfront moyen",
  upfrontTotal: "Prix total des caisses",
  og: "Ventes OG",
  taux: "Taux moyen",
  sendback: "Send back",
  ihcr: "Conversion IH",
};

// Couleur de sens seulement là où MOMENTO a un repère pour une équipe : le pace (80 / 100 %) et le POS share (20 / 25 %).
function ton(cle: string, v: number | null | undefined): Tone {
  if (v == null) return null;
  if (cle === "vPace" || cle === "iPace") return v >= 100 ? "good" : v < 80 ? "bad" : "warn";
  if (cle === "posShare") return v >= POS_SHARE_CIBLE ? "good" : v < POS_SHARE_ALERTE ? "bad" : "warn";
  return null;
}

// Le budget cumulé d'une équipe (et les « % Budget reached » qui en dépendent) n'est jamais un objectif : masqué pour un TM.
const BUDGET_CUMULE = new Set(["objectif", "budgetReachedInstall", "budgetReachedSigned"]);

// Tous les chiffres d'une ligne du BI importé par le RM (à gauche de la fiche 1:1, comme « Tous les KPIs »).
// `equipe` (fiche d'un TM) : jugée sur les objectifs d'équipe — POS vendus / effectif × 4, OG / effectif × 5.
export function KpiBoxTm({
  donnees,
  month,
  titre = "BI du TM",
  equipe,
}: {
  donnees: DonneesBiRm;
  month: string;
  titre?: string;
  equipe?: ObjectifsEquipe;
}) {
  const colonnes = COLONNES_BI_RM.filter((c) => donnees[c.cle] != null && !(equipe && BUDGET_CUMULE.has(c.cle)));
  // POS vendus et OG d'une équipe : « valeur / objectif », vert si atteint, orange sinon.
  const objectifDe = (cle: string) =>
    equipe && equipe.nbActifs > 0 ? (cle === "posSales" ? equipe.posVendus : cle === "og" ? equipe.og : null) : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-muted">{titre} — {month}</h4>
      <div className="grid grid-cols-2 gap-2">
        {colonnes.map((c) => {
          const v = donnees[c.cle];
          const objectif = objectifDe(c.cle);
          return (
            <Tile
              key={c.cle}
              label={LIBELLES[c.cle] ?? c.libelle}
              value={objectif != null ? `${formatBiRm(c.cle, v)} / ${objectif}` : formatBiRm(c.cle, v)}
              caption={
                objectif != null
                  ? `objectif : ${equipe!.nbActifs} sales du BI × ${c.cle === "posSales" ? POS_PAR_SALES : OG_PAR_SALES}`
                  : c.cle === "posShare"
                    ? `cible ${POS_SHARE_CIBLE} % min`
                    : equipe && (c.cle === "vPace" || c.cle === "iPace")
                      ? "objectif 100 %"
                      : c.libelle
              }
              tone={objectif != null && v != null ? (v >= objectif ? "good" : "warn") : ton(c.cle, v)}
            />
          );
        })}
      </div>
    </div>
  );
}
