"use client";

import { useState, useTransition } from "react";
import { saveKpis, saveKpisGroupe, setBudget } from "@/app/actions/chiffres";
import { ajouterCommerciaux } from "@/app/actions/commerciaux";
import {
  BUDGETS,
  formatKpi,
  KPI_FIELDS,
  KPI_GROUPS,
  type KpiDonnees,
  type KpiField,
  type KpiKey,
  parseKpi,
} from "@/lib/kpis";
import { type ImportBi, profilDetecte, valeursFormulaire } from "@/lib/lecture-bi";
import { firstName } from "@/lib/momento";
import type { Rep } from "@/lib/types";
import { RepPicker } from "@/components/one-on-one/RepPicker";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";
import { ImportPanel } from "./ImportPanel";
import { MoisParticulier } from "./MoisParticulier";

const inputClass =
  "w-full rounded-[11px] border bg-field py-[10px] pl-[12px] text-base text-ink focus:bg-white focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none sm:text-sm";

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

// Les champs invalides d'un formulaire : champ → message.
function erreursDe(values: Record<string, string>) {
  const found: Record<string, string> = {};
  for (const f of KPI_FIELDS) {
    const parsed = parseKpi(f, values[f.key] ?? "");
    if ("error" in parsed) found[f.key] = parsed.error;
  }
  return found;
}

function KpiInput({
  field,
  value,
  error,
  bi,
  savedText,
  onChange,
}: {
  field: KpiField;
  value: string;
  error?: string;
  bi?: "lu" | "non-lu"; // import BI en cours : valeur lue sur les captures, ou non
  savedText?: string; // valeur déjà enregistrée, quand elle diffère de celle du champ
  onChange: (v: string) => void;
}) {
  const id = `kpi-${field.key}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-muted">
        {field.label}
        {bi === "lu" && (
          <span className="rounded bg-accent-soft px-1 text-[10px] font-bold tracking-[0.04em] text-accent">BI</span>
        )}
        {bi === "non-lu" && <span className="text-[10.5px] font-medium text-faint">non lu</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={field.integer ? "numeric" : "decimal"}
          placeholder="—"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`${inputClass} ${field.unit ? "pr-8" : "pr-3"} ${
            error ? "border-bad focus:border-bad" : "border-line focus:border-accent"
          }`}
        />
        {field.unit && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12.5px] font-semibold text-faint">
            {field.unit}
          </span>
        )}
      </div>
      {savedText !== undefined && !error && (
        <div className="mt-1 text-[11px] text-faint">Enregistré : {savedText || "vide"}</div>
      )}
      {error && (
        <div id={`${id}-err`} className="mt-1 text-[11.5px] font-medium text-bad">
          {error}
        </div>
      )}
    </div>
  );
}

// Brouillon issu d'un import BI : valeurs lues + valeurs du formulaire (conservées si on change de commercial).
type Draft = {
  lu: KpiDonnees;
  values: Record<string, string>;
  enregistre: boolean;
  onChange: (values: Record<string, string>) => void;
};

// Le formulaire des chiffres d'un commercial pour un mois (remonté à chaque changement de commercial).
function KpiForm({
  rep,
  month,
  saved,
  draft,
  onDirtyChange,
  onSaved,
  onToast,
}: {
  rep: Rep;
  month: string;
  saved: KpiDonnees | undefined;
  draft?: Draft;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onToast: (message: string) => void;
}) {
  const savedValues = Object.fromEntries(KPI_FIELDS.map((f) => [f.key, formatKpi(saved?.[f.key as KpiKey])]));
  const [values, setValues] = useState<Record<string, string>>(() => draft?.values ?? savedValues);
  // Brouillon d'import : les erreurs s'affichent tout de suite, pour savoir quoi corriger.
  const [errors, setErrors] = useState<Record<string, string>>(() => (draft && !draft.enregistre ? erreursDe(draft.values) : {}));
  const [formError, setFormError] = useState("");
  const [dirty, setDirty] = useState(() => Boolean(draft && !draft.enregistre));
  const [pending, startTransition] = useTransition();

  function change(key: string, v: string) {
    const next = { ...values, [key]: v };
    setValues(next);
    draft?.onChange(next);
    setErrors((prev) => {
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
    setDirty(true);
    onDirtyChange(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = erreursDe(values);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError("Corrige les champs en rouge avant d'enregistrer.");
      return;
    }
    setFormError("");
    startTransition(async () => {
      const result = await saveKpis(rep.id, month, values);
      if (result.ok) {
        setDirty(false);
        onDirtyChange(false);
        onSaved();
        onToast(`Chiffres de ${firstName(rep)} enregistrés`);
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid grid-cols-1 gap-3 min-[761px]:grid-cols-2">
        {KPI_GROUPS.map((group) => (
          <fieldset key={group.titre} className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
            <legend className="float-left mb-3 w-full text-xs font-bold uppercase tracking-[0.04em] text-muted">
              {group.titre}
            </legend>
            <div className="clear-both grid grid-cols-2 gap-x-2.5 gap-y-3">
              {group.champs.map((field) => (
                <KpiInput
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ""}
                  error={errors[field.key]}
                  bi={draft ? (draft.lu[field.key] != null ? "lu" : "non-lu") : undefined}
                  savedText={
                    draft && saved && savedValues[field.key] !== (values[field.key] ?? "").trim()
                      ? savedValues[field.key]
                      : undefined
                  }
                  onChange={(v) => change(field.key, v)}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-line bg-paper/95 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md">
        {formError && (
          <p role="alert" className="mb-2 text-[13px] font-medium text-bad">
            {formError}
          </p>
        )}
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-muted">
            {pending
              ? "Enregistrement…"
              : dirty
                ? draft
                  ? "Chiffres lus sur le BI — vérifie puis enregistre"
                  : "Modifications non enregistrées"
                : saved
                  ? "Chiffres enregistrés"
                  : "Aucun chiffre saisi"}
          </span>
          <Button type="submit" disabled={pending || !dirty} className="ml-auto w-auto! px-6 transition-opacity disabled:opacity-50">
            Enregistrer
          </Button>
        </div>
      </div>
    </form>
  );
}

// Budget = objectif ventes ET installs : il fixe le niveau (M1 / M2 / M3+).
function BudgetPicker({ rep, onToast }: { rep: Rep; onToast: (message: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function choose(budget: number) {
    if (budget === rep.budget) return;
    setError("");
    startTransition(async () => {
      const result = await setBudget(rep.id, budget);
      if (result.ok) onToast(`Budget de ${firstName(rep)} : ${budget}`);
      else setError(result.error);
    });
  }

  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold text-muted">Budget (objectif ventes et installs)</div>
      <div className="flex gap-1 rounded-[11px] border border-line bg-paper p-1" role="radiogroup" aria-label="Budget">
        {BUDGETS.map((b) => {
          const on = rep.budget === b.value;
          return (
            <button
              key={b.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending}
              onClick={() => choose(b.value)}
              className={`flex-1 rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                on ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {b.value} <span className={on ? "text-white/70" : "text-faint"}>· {b.label}</span>
            </button>
          );
        })}
      </div>
      {!BUDGETS.some((b) => b.value === rep.budget) && (
        <div className="mt-1 text-[11.5px] text-muted">Budget actuel en base : {rep.budget}</div>
      )}
      {error && <div className="mt-1 text-[11.5px] font-medium text-bad">{error}</div>}
    </div>
  );
}

export function SaisieView({
  reps,
  rep,
  month,
  saved,
  imp,
  onImportChange,
  onSelectRep,
  onToast,
}: {
  reps: Rep[];
  rep: Rep | undefined;
  month: string;
  saved: Record<string, KpiDonnees>;
  imp: ImportBi | null;
  onImportChange: (update: (imp: ImportBi) => ImportBi | null) => void;
  onSelectRep: (repId: string) => void;
  onToast: (message: string) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [lot, setLot] = useState(0); // change après « Tout enregistrer » : remonte le formulaire affiché
  const [savingAll, startSaveAll] = useTransition();
  const [saveAllError, setSaveAllError] = useState("");
  const [creatingAll, startCreateAll] = useTransition();
  const [createAllError, setCreateAllError] = useState("");
  const actif = imp && imp.mois === month ? imp : null; // un import ne s'applique qu'à son mois
  const ligne = rep ? actif?.lignes[rep.id] : undefined;

  function select(repId: string) {
    if (repId === rep?.id) return;
    // Un brouillon d'import est conservé quand on change de commercial : pas besoin de confirmer.
    if (dirty && !ligne && !window.confirm("Tu as des chiffres non enregistrés. Changer de commercial quand même ?")) return;
    setDirty(false);
    onSelectRep(repId);
  }

  function assign(index: number, repId: string) {
    if (!imp) return;
    const nom = imp.nonReconnus[index].ligne.nom;
    const cible = reps.find((r) => r.id === repId);
    if (imp.lignes[repId] && !window.confirm(`${cible?.name} est déjà pré-rempli. Remplacer par les chiffres de « ${nom} » ?`)) {
      return;
    }
    onImportChange((i) => {
      const n = i.nonReconnus[index];
      return {
        ...i,
        lignes: { ...i.lignes, [repId]: n.ligne },
        valeurs: { ...i.valeurs, [repId]: valeursFormulaire(n.ligne.valeurs, saved[repId]) },
        nonReconnus: i.nonReconnus.filter((_, k) => k !== index),
        enregistres: i.enregistres.filter((id) => id !== repId),
      };
    });
    select(repId);
  }

  // Nouveau commercial créé depuis un nom non reconnu : on lui rattache la ligne lue.
  function create(index: number, repId: string, nom: string) {
    onImportChange((i) => {
      const n = i.nonReconnus[index];
      return {
        ...i,
        lignes: { ...i.lignes, [repId]: n.ligne },
        valeurs: { ...i.valeurs, [repId]: valeursFormulaire(n.ligne.valeurs, undefined) },
        nonReconnus: i.nonReconnus.filter((_, k) => k !== index),
      };
    });
    onToast(`Nouveau dans l'équipe : ${nom} — ses chiffres lus sont pré-remplis`);
    select(repId);
  }

  // « Créer tous les commerciaux détectés » : les noms inconnus de l'import deviennent des commerciaux
  // de l'équipe, et leurs chiffres lus sont pré-remplis (à valider ensuite avec « Tout enregistrer »).
  function createAll() {
    if (!imp) return;
    const cibles = imp.nonReconnus.filter((n) => n.inconnu);
    if (!cibles.length) return;
    const liste = cibles.map((n) => `• ${n.ligne.nom}`).join("\n");
    if (
      !window.confirm(
        `Ajouter ${cibles.length > 1 ? `ces ${cibles.length} commerciaux` : "ce commercial"} à ton équipe ?\n\n${liste}`,
      )
    ) {
      return;
    }
    setCreateAllError("");
    startCreateAll(async () => {
      const result = await ajouterCommerciaux(cibles.map((n) => ({ nom: n.ligne.nom, ...profilDetecte(n.ligne) })));
      if (!result.ok) {
        setCreateAllError(result.error);
        return;
      }
      const idParNom = new Map(result.crees.map((c) => [c.nom, c.id]));
      onImportChange((i) => {
        const lignes = { ...i.lignes };
        const valeurs = { ...i.valeurs };
        const nonReconnus = i.nonReconnus.filter((n) => {
          const id = n.inconnu ? idParNom.get(n.ligne.nom) : undefined;
          if (!id) return true;
          lignes[id] = n.ligne;
          valeurs[id] = valeursFormulaire(n.ligne.valeurs, undefined);
          return false;
        });
        return { ...i, lignes, valeurs, nonReconnus };
      });
      if (result.refuses.length) {
        setCreateAllError(`Non créés : ${result.refuses.map((r) => `« ${r.nom} » (${r.raison})`).join(", ")}`);
      }
      const n = result.crees.length;
      if (n) {
        onToast(`${n > 1 ? `${n} commerciaux ajoutés` : "1 commercial ajouté"} — vérifie puis « Tout enregistrer »`);
        select(result.crees[0].id);
      }
    });
  }

  // « Tout enregistrer » : une seule écriture pour toutes les fiches prêtes.
  function saveAll(repIds: string[]) {
    if (!actif || !repIds.length) return;
    setSaveAllError("");
    startSaveAll(async () => {
      const result = await saveKpisGroupe(
        actif.mois,
        repIds.map((id) => ({ commercialId: id, values: actif.valeurs[id] })),
      );
      if (!result.ok) {
        setSaveAllError(result.error);
        return;
      }
      onImportChange((i) => ({ ...i, enregistres: [...new Set([...i.enregistres, ...result.enregistres])] }));
      if (rep && result.enregistres.includes(rep.id)) setDirty(false);
      setLot((n) => n + 1);
      const refuses = Object.keys(result.refuses).length;
      if (refuses) setSaveAllError(`${pluriel(refuses, "fiche")} non enregistrée(s) : vérifie les champs en rouge.`);
      onToast(`${pluriel(result.enregistres.length, "fiche")} enregistrée${result.enregistres.length > 1 ? "s" : ""}`);
    });
  }

  function closeImport() {
    if (!imp) return;
    const restants = Object.keys(imp.valeurs).filter((id) => !imp.enregistres.includes(id)).length;
    if (restants && !window.confirm(`${pluriel(restants, "fiche")} pré-remplie(s) non enregistrée(s). Abandonner ces chiffres ?`)) {
      return;
    }
    setDirty(false);
    setSaveAllError("");
    setCreateAllError("");
    onImportChange(() => null);
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <PageTitle kicker={actif ? "Import BI à vérifier" : "Saisie manuelle"} title="Chiffres du mois" month={month} />
      {/* Affiché même sans commercial : on peut créer l'équipe depuis les noms lus sur le BI. */}
      {imp && (
        <ImportPanel
          imp={imp}
          month={month}
          reps={reps}
          currentId={rep?.id}
          savingAll={savingAll}
          saveAllError={saveAllError}
          creatingAll={creatingAll}
          createAllError={createAllError}
          onSelectRep={select}
          onSaveAll={saveAll}
          onAssign={assign}
          onCreate={create}
          onCreateAll={createAll}
          onIgnore={(index) => onImportChange((i) => ({ ...i, nonReconnus: i.nonReconnus.filter((_, k) => k !== index) }))}
          onClose={closeImport}
        />
      )}
      {!rep ? (
        <div className="rounded-[14px] border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
          Aucun commercial actif n&apos;est encore rattaché à ton compte. Ajoute-les dans l&apos;onglet Équipe.
        </div>
      ) : (
        <>
          <RepPicker reps={reps} currentId={rep.id} onSelect={select} />
          <div className="mb-3 flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-3.5 shadow-card sm:flex-row sm:items-end">
            <div className="flex flex-1 items-center gap-3">
              <Avatar initials={rep.initials} />
              <div>
                <h2 className="text-lg font-bold">{rep.name}</h2>
                <div className="text-[12.5px] text-muted">
                  {rep.sen ? `Séniorité ${rep.sen} · ` : ""}
                  {ligne
                    ? `lu sur le BI : « ${ligne.nom} »`
                    : saved[rep.id]
                      ? "chiffres déjà saisis"
                      : "aucun chiffre ce mois-ci"}
                </div>
              </div>
            </div>
            <div className="sm:w-[300px]">
              <BudgetPicker rep={rep} onToast={onToast} />
            </div>
          </div>
          <MoisParticulier
            // Remonté à chaque changement de mois ou de commercial, et après enregistrement.
            key={`${month}|${rep.id}|${rep.special?.raison ?? ""}|${rep.special?.objectif ?? ""}`}
            rep={rep}
            month={month}
            onToast={onToast}
          />
          <KpiForm
            // Remonté à chaque changement de mois, de commercial, d'import, de ligne rattachée ou après « Tout enregistrer ».
            key={`${month}|${rep.id}|${actif?.id ?? ""}|${ligne?.nom ?? ""}|${ligne ? lot : ""}`}
            rep={rep}
            month={month}
            saved={saved[rep.id]}
            draft={
              ligne && actif
                ? {
                    lu: ligne.valeurs,
                    values: actif.valeurs[rep.id],
                    enregistre: actif.enregistres.includes(rep.id),
                    onChange: (values) =>
                      onImportChange((i) => ({
                        ...i,
                        valeurs: { ...i.valeurs, [rep.id]: values },
                        enregistres: i.enregistres.filter((id) => id !== rep.id),
                      })),
                  }
                : undefined
            }
            onDirtyChange={setDirty}
            onSaved={() => {
              if (ligne) onImportChange((i) => ({ ...i, enregistres: [...new Set([...i.enregistres, rep.id])] }));
            }}
            onToast={onToast}
          />
        </>
      )}
    </div>
  );
}
