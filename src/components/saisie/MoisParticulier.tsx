"use client";

import { useState, useTransition } from "react";
import { saveMoisSpecial } from "@/app/actions/chiffres";
import { OBJECTIF_MAX, RAISONS, type RaisonSpeciale } from "@/lib/mois-special";
import { firstName } from "@/lib/momento";
import type { Rep } from "@/lib/types";

const champ =
  "rounded-[10px] border border-line bg-field px-2.5 py-2 text-sm text-ink focus:border-accent focus:bg-white focus:outline-none";

// « Mois particulier » (optionnel) : congés, arrêt, ramp-up… L'objectif de CE mois remplace le budget,
// pour les ventes ET les installations. Par défaut, un mois n'est pas particulier.
export function MoisParticulier({
  rep,
  month,
  onToast,
}: {
  rep: Rep;
  month: string;
  onToast: (message: string) => void;
}) {
  const special = rep.special;
  const [ouvert, setOuvert] = useState(Boolean(special));
  const [raison, setRaison] = useState<RaisonSpeciale>(special?.raison ?? "conges");
  const [objectif, setObjectif] = useState(special?.objectif ?? Math.max(1, Math.round(rep.budget / 2)));
  const [erreur, setErreur] = useState("");
  const [pending, startTransition] = useTransition();

  const modifie = !special || special.raison !== raison || special.objectif !== objectif;
  const valide = Number.isInteger(objectif) && objectif >= 1 && objectif <= OBJECTIF_MAX;
  const moisCourt = month.split(" ")[0].toLowerCase();

  function enregistrer(valeur: { raison: RaisonSpeciale; objectif: number } | null) {
    setErreur("");
    startTransition(async () => {
      const res = await saveMoisSpecial(rep.id, month, valeur);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      onToast(
        valeur
          ? `${firstName(rep)} : objectif de ${moisCourt} ajusté à ${valeur.objectif}`
          : `${firstName(rep)} : ${moisCourt} redevient un mois normal (objectif ${rep.budget})`,
      );
    });
  }

  function basculer(coche: boolean) {
    setOuvert(coche);
    if (!coche && special) enregistrer(null); // décoché alors qu'il était enregistré : on le retire
  }

  const raccourcis = [...new Set([Math.round(rep.budget / 2), Math.round((rep.budget * 3) / 4)])].filter(
    (n) => n >= 1 && n < rep.budget,
  );

  return (
    <div className={`mb-3 rounded-2xl border bg-surface px-3.5 py-3 shadow-card ${special ? "border-warn-line" : "border-line"}`}>
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={ouvert}
          disabled={pending}
          onChange={(e) => basculer(e.target.checked)}
          className="size-4 accent-[var(--color-accent)]"
        />
        <span className="text-[13.5px] font-semibold">Mois particulier</span>
        <span className="text-[12px] text-faint">congés, arrêt, ramp-up… (optionnel)</span>
      </label>

      {!ouvert ? (
        <div className="mt-1 pl-[26px] text-[12px] text-muted">
          Objectif de {moisCourt} : le budget normal ({rep.budget} ventes et {rep.budget} installs).
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 pl-[26px]">
          {special && !modifie && (
            <div className="text-[12.5px] font-semibold text-warn">
              Enregistré : objectif de {moisCourt} ajusté à {special.objectif} au lieu de {rep.budget} (
              {RAISONS.find((r) => r.value === special.raison)?.label}).
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted">
              Raison
              <select
                value={raison}
                onChange={(e) => setRaison(e.target.value as RaisonSpeciale)}
                disabled={pending}
                className={champ}
              >
                {RAISONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1 text-[12px] font-semibold text-muted">
              <span id={`obj-${rep.id}`}>Objectif ajusté (ventes et installs)</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setObjectif((o) => Math.max(1, o - 1))}
                  disabled={pending || objectif <= 1}
                  aria-label="Diminuer l'objectif"
                  className="size-9 rounded-[10px] border border-line bg-paper text-base font-bold text-ink disabled:opacity-40"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={OBJECTIF_MAX}
                  step={1}
                  value={Number.isNaN(objectif) ? "" : objectif}
                  onChange={(e) => setObjectif(e.target.valueAsNumber)}
                  disabled={pending}
                  aria-labelledby={`obj-${rep.id}`}
                  className={`${champ} w-16 text-center font-bold`}
                />
                <button
                  type="button"
                  onClick={() => setObjectif((o) => Math.min(OBJECTIF_MAX, (Number.isNaN(o) ? 0 : o) + 1))}
                  disabled={pending || objectif >= OBJECTIF_MAX}
                  aria-label="Augmenter l'objectif"
                  className="size-9 rounded-[10px] border border-line bg-paper text-base font-bold text-ink disabled:opacity-40"
                >
                  +
                </button>
                <span className="text-[12px] font-medium text-faint">au lieu de {rep.budget}</span>
              </div>
            </div>
          </div>
          {raccourcis.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
              Raccourcis :
              {raccourcis.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setObjectif(n)}
                  className={`rounded-lg border px-2 py-1 font-semibold ${
                    objectif === n ? "border-accent bg-accent-soft text-accent" : "border-line bg-paper text-ink2"
                  }`}
                >
                  {n === Math.round(rep.budget / 2) ? "½" : "¾"} · {n}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => enregistrer({ raison, objectif })}
              disabled={pending || !valide || !modifie}
              className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {pending ? "Enregistrement…" : special ? "Mettre à jour" : "Enregistrer le mois particulier"}
            </button>
            {special && (
              <button
                type="button"
                onClick={() => basculer(false)}
                disabled={pending}
                className="rounded-[10px] px-3 py-2 text-[13px] font-semibold text-muted hover:text-ink"
              >
                Retirer (mois normal)
              </button>
            )}
          </div>
          {!valide && (
            <div className="text-[12px] font-medium text-bad">Un nombre entier entre 1 et {OBJECTIF_MAX}.</div>
          )}
        </div>
      )}
      {erreur && <div className="mt-2 text-[12px] font-medium text-bad">{erreur}</div>}
    </div>
  );
}
