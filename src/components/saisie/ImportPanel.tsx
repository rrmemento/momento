"use client";

import { useState } from "react";
import { KPI_FIELDS, parseKpi } from "@/lib/kpis";
import type { ImportBi } from "@/lib/lecture-bi";
import { firstName } from "@/lib/momento";
import type { Rep } from "@/lib/types";
import { CommercialForm } from "@/components/team/CommercialForm";
import { Button } from "@/components/ui/Button";

// Une fiche est prête si tous ses champs sont des nombres valides (ou vides).
export const ficheValide = (values: Record<string, string> | undefined) =>
  KPI_FIELDS.every((f) => !("error" in parseKpi(f, values?.[f.key] ?? "")));

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

// Le bilan de l'import BI en haut de l'onglet Chiffres : qui est pré-rempli, qui n'est pas reconnu.
export function ImportPanel({
  imp,
  month,
  reps,
  currentId,
  savingAll,
  saveAllError,
  onSelectRep,
  onSaveAll,
  onAssign,
  onCreate,
  onIgnore,
  onClose,
}: {
  imp: ImportBi;
  month: string;
  reps: Rep[];
  currentId: string | undefined;
  savingAll: boolean;
  saveAllError: string;
  onSelectRep: (repId: string) => void;
  onSaveAll: (repIds: string[]) => void;
  onAssign: (index: number, repId: string) => void;
  onCreate: (index: number, repId: string, nom: string) => void;
  onIgnore: (index: number) => void;
  onClose: () => void;
}) {
  const [creation, setCreation] = useState<number | null>(null); // ligne non reconnue en cours de création

  if (imp.mois !== month) {
    return (
      <div className="mb-3 rounded-2xl border border-warn-line bg-warn-soft px-3.5 py-3 text-[13px] text-ink">
        Un import BI de <b>{imp.mois}</b> attend ta vérification. Choisis {imp.mois} en haut à droite pour le voir.
      </div>
    );
  }

  const reconnus = reps.filter((r) => imp.lignes[r.id]);
  const sansDonnees = reps.filter((r) => !imp.lignes[r.id]);
  const restants = reconnus.filter((r) => !imp.enregistres.includes(r.id));
  const prets = restants.filter((r) => ficheValide(imp.valeurs[r.id]));
  const aCorriger = restants.filter((r) => !ficheValide(imp.valeurs[r.id]));

  return (
    <div className="mb-3 rounded-2xl border border-accent/25 bg-accent-soft p-3.5">
      <div className="mb-2.5 flex items-start gap-3">
        <div className="flex-1">
          <div className="text-[14px] font-bold">Import BI · {imp.mois}</div>
          <div className="text-[12.5px] text-muted">
            {restants.length
              ? "Vérifie les fiches (clique sur un nom), corrige si besoin, puis enregistre tout d'un coup. Les champs marqués « BI » viennent des captures."
              : "Toutes les fiches reconnues sont enregistrées."}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
        >
          Terminer l&apos;import
        </button>
      </div>

      {reconnus.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reconnus.map((r) => {
            const fait = imp.enregistres.includes(r.id);
            const invalide = !fait && !ficheValide(imp.valeurs[r.id]);
            const on = r.id === currentId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelectRep(r.id)}
                aria-pressed={on}
                title={`Lu sur le BI : « ${imp.lignes[r.id].nom} »`}
                className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  on
                    ? "border-ink bg-ink text-white"
                    : invalide
                      ? "border-bad-line bg-surface text-bad hover:border-bad"
                      : "border-line bg-surface text-ink hover:border-ink"
                }`}
              >
                {fait ? "✓ " : invalide ? "⚠ " : ""}
                {firstName(r)}
                <span className={on ? "text-white/70" : "text-faint"}>
                  {fait ? " · enregistré" : invalide ? " · à corriger" : " · prêt"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Toujours affiché pendant un import : le bouton est grisé tant qu'aucune fiche n'est prête. */}
      <div className="mt-3 rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[13px]">
          {!reconnus.length ? (
            <span className="text-muted">Aucune fiche pré-remplie : rattache ou crée les noms non reconnus ci-dessous.</span>
          ) : !restants.length ? (
            <span className="font-semibold text-good">✓ Toutes les fiches sont enregistrées.</span>
          ) : (
            <>
              <b>
                {pluriel(prets.length, "fiche")} prête{prets.length > 1 ? "s" : ""}
              </b>
              {aCorriger.length > 0 && (
                <span className="text-[12px] font-semibold text-bad">
                  · {pluriel(aCorriger.length, "fiche")} à corriger d&apos;abord ({aCorriger.map(firstName).join(", ")})
                </span>
              )}
            </>
          )}
        </div>
        <Button
          onClick={() => onSaveAll(prets.map((r) => r.id))}
          disabled={savingAll || !prets.length}
          className="p-3! transition-opacity disabled:opacity-50"
        >
          {savingAll ? "Enregistrement…" : `Tout enregistrer (${pluriel(prets.length, "fiche")})`}
        </Button>
        {saveAllError && (
          <p role="alert" className="mt-2 text-[12.5px] font-medium text-bad">
            {saveAllError}
          </p>
        )}
      </div>

      {imp.nonReconnus.length > 0 && (
        <div className="mt-3 rounded-xl border border-bad-line bg-surface p-3">
          <div className="mb-2 text-[12.5px] font-bold text-bad">
            {imp.nonReconnus.length} nom{imp.nonReconnus.length > 1 ? "s" : ""} lu{imp.nonReconnus.length > 1 ? "s" : ""}{" "}
            non reconnu{imp.nonReconnus.length > 1 ? "s" : ""} — rattache-les, crée le commercial ou ignore-les
          </div>
          <ul className="flex flex-col gap-2">
            {imp.nonReconnus.map((n, i) => (
              <li key={`${n.ligne.nom}-${i}`} className="text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[160px] flex-1">
                    <div className="font-semibold">« {n.ligne.nom} »</div>
                    <div className="text-[11.5px] text-muted">{n.raison}</div>
                  </div>
                  <select
                    aria-label={`Rattacher « ${n.ligne.nom} » à`}
                    value=""
                    onChange={(e) => e.target.value && onAssign(i, e.target.value)}
                    className="rounded-[9px] border border-line bg-surface px-2 py-1.5 text-[12.5px] font-semibold"
                  >
                    <option value="">Rattacher à…</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {imp.lignes[r.id] ? " (déjà pré-rempli)" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setCreation(creation === i ? null : i)}
                    aria-expanded={creation === i}
                    className="rounded-[9px] border border-line px-2 py-1.5 text-[12px] font-semibold text-accent hover:border-accent"
                  >
                    + Créer ce commercial
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreation(null);
                      onIgnore(i);
                    }}
                    className="rounded-[9px] px-2 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
                  >
                    Ignorer
                  </button>
                </div>
                {creation === i && (
                  <div className="mt-2">
                    <CommercialForm
                      nomInitial={n.ligne.nom}
                      onCreated={(id, nom) => {
                        setCreation(null);
                        onCreate(i, id, nom);
                      }}
                      onCancel={() => setCreation(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sansDonnees.length > 0 && (
        <div className="mt-2.5 text-[12px] text-muted">
          Absents des captures : {sansDonnees.map((r) => r.name).join(", ")}.
        </div>
      )}
    </div>
  );
}
