import { SUIVI_MANUEL, type Engagement, type StatutEngagement, type SuiviManuel } from "@/lib/suivi";

const BADGES: Record<StatutEngagement, { texte: string; ton: string }> = {
  tenu: { texte: "Tenu ✅", ton: "bg-good-soft text-good" },
  non_tenu: { texte: "Non tenu ✗", ton: "bg-bad-soft text-bad" },
  en_cours: { texte: "En cours", ton: "bg-warn-soft text-warn" },
  manquant: { texte: "Chiffres du mois manquants", ton: "border border-dashed border-line bg-paper text-muted" },
  a_juger: { texte: "À juger", ton: "border border-line bg-paper text-ink2" },
};

const BOUTONS: Record<SuiviManuel, string> = {
  tenu: "border-transparent bg-good text-white",
  non_tenu: "border-transparent bg-bad text-white",
  en_cours: "border-transparent bg-warn text-white",
};

function Badge({ statut }: { statut: StatutEngagement }) {
  const b = BADGES[statut];
  return (
    <span className={`flex-none whitespace-nowrap rounded-[20px] px-[10px] py-[4px] text-[11.5px] font-bold ${b.ton}`}>
      {b.texte}
    </span>
  );
}

// Tenu / Non tenu / En cours : un clic choisit, un second clic sur le même bouton annule.
function Jugement({
  titre,
  statut,
  onJuger,
}: {
  titre: string;
  statut: StatutEngagement;
  onJuger: (suivi: SuiviManuel | null) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Bilan de « ${titre} »`}>
      {SUIVI_MANUEL.map((s) => {
        const on = statut === s.value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onJuger(on ? null : s.value)}
            aria-pressed={on}
            className={`rounded-[9px] border px-3 py-1.5 text-[12.5px] font-semibold ${
              on ? BOUTONS[s.value] : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// Les engagements d'un commercial : résultat automatique si objectif chiffré, boutons sinon.
export function Engagements({
  liste,
  onJuger,
}: {
  liste: Engagement[];
  onJuger: (index: number, suivi: SuiviManuel | null) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {liste.map((e) => (
        <li key={e.index} className="rounded-xl border border-line bg-field px-3.5 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">{e.titre}</div>
              {e.objectif && <div className="mt-0.5 text-[12.5px] text-muted">{e.objectif}</div>}
            </div>
            <Badge statut={e.statut} />
          </div>
          {e.cible ? (
            <div className="mt-2 text-[12.5px] text-ink2">
              Objectif : <b className="font-semibold">{e.cible}</b>
              {e.reel != null && (
                <>
                  {" "}
                  · Réalisé : <b className="font-semibold">{e.reel}</b>
                </>
              )}
            </div>
          ) : (
            <Jugement titre={e.titre} statut={e.statut} onJuger={(suivi) => onJuger(e.index, suivi)} />
          )}
        </li>
      ))}
    </ul>
  );
}
