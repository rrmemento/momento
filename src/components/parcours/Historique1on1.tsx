"use client";

import { useState, type ReactNode } from "react";
import { sujetRempli } from "@/lib/brief";
import { libelleObjectifChiffre } from "@/lib/kpis";
import { formatJour, rangMois } from "@/lib/mois";
import type { OneOnOne } from "@/lib/types";

const TEXTES = ["ressenti", "fier", "bloque", "titre", "forts", "besoin", "objectif"] as const;

// Un 1:1 dans lequel quelque chose a été noté (les fiches vides ne sont pas listées).
const ficheRemplie = (f: OneOnOne) =>
  TEXTES.some((k) => f[k].trim()) || f.note > 0 || f.sujets.some(sujetRempli) || Boolean(f.clotureLe);

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[11.5px] font-bold uppercase tracking-[0.03em] text-muted">{titre}</div>
      <div className="whitespace-pre-line text-[13px] leading-[1.55] text-ink2">{children}</div>
    </div>
  );
}

// Le détail d'un 1:1, en lecture seule.
function Detail({ fiche }: { fiche: OneOnOne }) {
  const sujets = fiche.sujets.filter(sujetRempli);
  return (
    <div className="flex flex-col gap-3 border-t border-line2 px-3.5 pt-3 pb-3.5">
      {fiche.ressenti.trim() && <Bloc titre="Son ressenti">{fiche.ressenti}</Bloc>}
      {fiche.fier.trim() && <Bloc titre="Ce qui l'a rendu(e) fier(e)">{fiche.fier}</Bloc>}
      {fiche.bloque.trim() && <Bloc titre="Ce qui l'a bloqué(e)">{fiche.bloque}</Bloc>}
      {fiche.forts.trim() && <Bloc titre="Points forts retenus">{fiche.forts}</Bloc>}
      {sujets.map((s, k) => (
        <div key={k} className="rounded-xl border border-line bg-field px-3 py-2.5">
          <div className="text-[13.5px] font-bold text-ink">
            Sujet {k + 1} · {s.t || "sans titre"}
          </div>
          <div className="mt-1.5 flex flex-col gap-2">
            {s.o.trim() && <Bloc titre="Constat">{s.o}</Bloc>}
            {s.questions.trim() && <Bloc titre="Questions">{s.questions}</Bloc>}
            {s.reponse.trim() && <Bloc titre="Sa réponse">{s.reponse}</Bloc>}
            {s.r.trim() && <Bloc titre="Comment on le règle">{s.r}</Bloc>}
            {(s.g.trim() || s.cible) && (
              <Bloc titre="Objectif">
                {[libelleObjectifChiffre(s.cible), s.g.trim()].filter(Boolean).join(" — ")}
              </Bloc>
            )}
          </div>
        </div>
      ))}
      {fiche.besoin.trim() && <Bloc titre="Ce dont il/elle avait besoin">{fiche.besoin}</Bloc>}
      {fiche.objectif.trim() && <Bloc titre="Son objectif perso">{fiche.objectif}</Bloc>}
    </div>
  );
}

// « Historique des 1:1 » : tous ses entretiens, du plus récent au plus ancien.
export function Historique1on1({
  prenom,
  fiches,
  moisModifiables,
  onOuvrir,
}: {
  prenom: string;
  fiches: { mois: string; fiche: OneOnOne }[]; // tous les 1:1 du commercial
  moisModifiables: string[]; // les 1:1 qu'on peut rouvrir dans l'onglet One-on-One
  onOuvrir: (mois: string) => void;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const liste = fiches
    .filter((x) => ficheRemplie(x.fiche))
    .sort((a, b) => (rangMois(b.mois) ?? 0) - (rangMois(a.mois) ?? 0));

  return (
    <section className="mt-8">
      <h2 className="mb-2.5 text-[20px] font-bold">Historique des 1:1</h2>
      {liste.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
          Aucun 1:1 enregistré pour {prenom} pour l&apos;instant.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {liste.map(({ mois, fiche }) => {
            const deplie = ouvert === mois;
            const titres = fiche.sujets.filter(sujetRempli).map((s) => s.t || "sans titre");
            return (
              <li key={mois} className="rounded-2xl border border-line bg-surface shadow-card">
                <button
                  type="button"
                  onClick={() => setOuvert(deplie ? null : mois)}
                  aria-expanded={deplie}
                  className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[14.5px] font-bold">{mois}</span>
                      <span className={`text-[12px] font-semibold ${fiche.clotureLe ? "text-good" : "text-faint"}`}>
                        {fiche.clotureLe ? `✓ fait le ${formatJour(fiche.clotureLe)}` : "non clôturé"}
                      </span>
                      {fiche.note > 0 && (
                        <span className="rounded-md bg-paper px-1.5 py-0.5 text-[11.5px] font-bold text-ink2">
                          auto-note {fiche.note}/10
                        </span>
                      )}
                    </div>
                    {fiche.titre.trim() && <div className="mt-0.5 text-[13px] text-ink2">« {fiche.titre.trim()} »</div>}
                    {titres.length > 0 && (
                      <div className="mt-0.5 truncate text-[12px] text-muted">Sujets : {titres.join(" · ")}</div>
                    )}
                  </div>
                  <span className="mt-0.5 text-[13px] text-faint" aria-hidden="true">
                    {deplie ? "▲" : "▼"}
                  </span>
                </button>
                {deplie && (
                  <>
                    <Detail fiche={fiche} />
                    <div className="px-3.5 pb-3.5">
                      {moisModifiables.includes(mois) ? (
                        <button
                          type="button"
                          onClick={() => onOuvrir(mois)}
                          className="rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent"
                        >
                          Ouvrir ce 1:1
                        </button>
                      ) : (
                        <span className="text-[12px] text-faint">Lecture seule (1:1 ancien)</span>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
