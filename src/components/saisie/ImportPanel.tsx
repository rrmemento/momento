"use client";

import type { ImportBi } from "@/lib/lecture-bi";
import { firstName } from "@/lib/momento";
import type { Rep } from "@/lib/types";

// Le bilan de l'import BI en haut de l'onglet Chiffres : qui est pré-rempli, qui n'est pas reconnu.
export function ImportPanel({
  imp,
  month,
  reps,
  currentId,
  onSelectRep,
  onAssign,
  onIgnore,
  onClose,
}: {
  imp: ImportBi;
  month: string;
  reps: Rep[];
  currentId: string | undefined;
  onSelectRep: (repId: string) => void;
  onAssign: (index: number, repId: string) => void;
  onIgnore: (index: number) => void;
  onClose: () => void;
}) {
  if (imp.mois !== month) {
    return (
      <div className="mb-3 rounded-2xl border border-warn-line bg-warn-soft px-3.5 py-3 text-[13px] text-ink">
        Un import BI de <b>{imp.mois}</b> attend ta vérification. Choisis {imp.mois} en haut à droite pour le voir.
      </div>
    );
  }

  const reconnus = reps.filter((r) => imp.lignes[r.id]);
  const sansDonnees = reps.filter((r) => !imp.lignes[r.id]);
  const restants = reconnus.filter((r) => !imp.enregistres.includes(r.id)).length;

  return (
    <div className="mb-3 rounded-2xl border border-accent/25 bg-accent-soft p-3.5">
      <div className="mb-2.5 flex items-start gap-3">
        <div className="flex-1">
          <div className="text-[14px] font-bold">Import BI · {imp.mois}</div>
          <div className="text-[12.5px] text-muted">
            {restants
              ? `${restants} fiche${restants > 1 ? "s" : ""} à vérifier puis enregistrer. Les champs marqués « BI » viennent des captures.`
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
            const on = r.id === currentId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelectRep(r.id)}
                aria-pressed={on}
                title={`Lu sur le BI : « ${imp.lignes[r.id].nom} »`}
                className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:border-ink"
                }`}
              >
                {fait ? "✓ " : ""}
                {firstName(r)}
                <span className={on ? "text-white/70" : "text-faint"}>{fait ? " · enregistré" : " · à vérifier"}</span>
              </button>
            );
          })}
        </div>
      )}

      {imp.nonReconnus.length > 0 && (
        <div className="mt-3 rounded-xl border border-bad-line bg-surface p-3">
          <div className="mb-2 text-[12.5px] font-bold text-bad">
            {imp.nonReconnus.length} nom{imp.nonReconnus.length > 1 ? "s" : ""} lu{imp.nonReconnus.length > 1 ? "s" : ""}{" "}
            non reconnu{imp.nonReconnus.length > 1 ? "s" : ""} — rattache-les à un commercial ou ignore-les
          </div>
          <ul className="flex flex-col gap-2">
            {imp.nonReconnus.map((n, i) => (
              <li key={`${n.ligne.nom}-${i}`} className="flex flex-wrap items-center gap-2 text-[13px]">
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
                  onClick={() => onIgnore(i)}
                  className="rounded-[9px] px-2 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
                >
                  Ignorer
                </button>
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
