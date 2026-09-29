import type { EngagementPasse, EngagementsDuMois } from "@/lib/parcours";
import type { StatutEngagement } from "@/lib/suivi";

// Le résultat de chaque engagement : vert = tenu (à féliciter), rouge = non tenu (à retravailler), neutre sinon.
const RESULTATS: Record<StatutEngagement, { texte: string; badge: string; bord: string }> = {
  tenu: { texte: "✅ Tenu", badge: "bg-good-soft text-good", bord: "border-l-good" },
  non_tenu: { texte: "❌ Non tenu", badge: "bg-bad-soft text-bad", bord: "border-l-bad" },
  en_cours: { texte: "⏳ En cours", badge: "border border-line bg-paper text-muted", bord: "border-l-line" },
  a_juger: { texte: "⏳ À juger", badge: "border border-line bg-paper text-muted", bord: "border-l-line" },
  manquant: { texte: "⏳ Chiffres à venir", badge: "border border-dashed border-line bg-paper text-muted", bord: "border-l-line" },
};

const deMois = (mois: string) => (/^[AEIOUÉ]/.test(mois) ? `d'${mois.toLowerCase()}` : `de ${mois.toLowerCase()}`);

function Ligne({ e }: { e: EngagementPasse }) {
  const r = RESULTATS[e.statut];
  return (
    <li className={`rounded-xl border border-line border-l-[3px] bg-surface px-3.5 py-2.5 ${r.bord}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{e.titre}</div>
          {e.cible ? (
            <div className="mt-0.5 text-[12.5px] text-ink2">
              Objectif : <b className="font-semibold">{e.cible}</b>
              {e.reel != null && (
                <>
                  {" "}
                  → réalisé <b className="font-semibold">{e.reel}</b>
                </>
              )}
              {e.ecart && <span className="text-muted"> ({e.ecart})</span>}
            </div>
          ) : (
            e.objectif && <div className="mt-0.5 text-[12.5px] text-muted">{e.objectif}</div>
          )}
        </div>
        <span className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold ${r.badge}`}>
          {r.texte}
        </span>
      </div>
    </li>
  );
}

// « Ses engagements » : tout ce qui a été promis dans les 1:1 passés, et ce qui en est ressorti.
export function SesEngagements({ prenom, parMois }: { prenom: string; parMois: EngagementsDuMois[] }) {
  const tous = parMois.flatMap((m) => m.liste);
  const tenus = tous.filter((e) => e.statut === "tenu").length;
  const nonTenus = tous.filter((e) => e.statut === "non_tenu").length;
  const enCours = tous.length - tenus - nonTenus; // en cours, à juger, chiffres à venir

  return (
    <section className="mt-7">
      <h2 className="mb-1 text-[20px] font-bold">Ses engagements</h2>
      {tous.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
          Aucun engagement noté dans les 1:1 de {prenom} pour l&apos;instant. Les sujets de « Ce qu&apos;on va chercher
          ensemble » apparaîtront ici.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] font-semibold">
            <span className="text-good">
              {tenus} tenu{tenus > 1 ? "s" : ""}
            </span>
            <span className="text-faint">·</span>
            <span className="text-bad">
              {nonTenus} non tenu{nonTenus > 1 ? "s" : ""}
            </span>
            <span className="text-faint">·</span>
            <span className="text-muted">{enCours} en cours / à juger</span>
          </div>
          <div className="flex flex-col gap-5">
            {parMois.map((m) => (
              <div key={m.mois}>
                <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
                  1:1 {deMois(m.mois)}
                  <span className="font-medium normal-case tracking-normal text-faint">
                    {" "}
                    · jugé sur les chiffres {deMois(m.moisJuge)}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {m.liste.map((e) => (
                    <Ligne key={e.index} e={e} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
