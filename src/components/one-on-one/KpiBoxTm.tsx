import { COLONNES_BI_RM, type DonneesBiRm } from "@/lib/lecture-bi-rm";
import { POS_SHARE_ALERTE, POS_SHARE_CIBLE } from "@/lib/statut-tm";
import { Tile, type Tone } from "./KpiBox";

// Unités d'affichage des colonnes du BI RM (les autres sont des nombres).
const POURCENTS = new Set([
  "iPace", "vPace", "ippPace", "sppPace", "budgetReachedInstall", "budgetReachedSigned", "sendback", "ihcr",
  "quickSale", "ogPct", "posShare",
]);
const EUROS = new Set(["upfrontTotal", "posUpfront"]);

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

const afficher = (cle: string, v: number | null | undefined) => {
  if (v == null) return "—";
  const n = String(v).replace(".", ",");
  return POURCENTS.has(cle) ? `${n} %` : EUROS.has(cle) ? `€${n}` : n;
};

// Couleur de sens seulement là où MOMENTO a un repère pour une équipe : le pace (80 / 100 %) et le POS share (20 / 25 %).
function ton(cle: string, v: number | null | undefined): Tone {
  if (v == null) return null;
  if (cle === "vPace" || cle === "iPace") return v >= 100 ? "good" : v < 80 ? "bad" : "warn";
  if (cle === "posShare") return v >= POS_SHARE_CIBLE ? "good" : v < POS_SHARE_ALERTE ? "bad" : "warn";
  return null;
}

// Tous les chiffres de la ligne du TM dans le BI importé par son RM (à gauche de la fiche 1:1, comme « Tous les KPIs »).
export function KpiBoxTm({ donnees, month }: { donnees: DonneesBiRm; month: string }) {
  const colonnes = COLONNES_BI_RM.filter((c) => donnees[c.cle] != null);
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-muted">BI du TM — {month}</h4>
      <div className="grid grid-cols-2 gap-2">
        {colonnes.map((c) => (
          <Tile
            key={c.cle}
            label={LIBELLES[c.cle] ?? c.libelle}
            value={afficher(c.cle, donnees[c.cle])}
            caption={c.cle === "posShare" ? `cible ${POS_SHARE_CIBLE} % min` : c.libelle}
            tone={ton(c.cle, donnees[c.cle])}
          />
        ))}
      </div>
    </div>
  );
}
