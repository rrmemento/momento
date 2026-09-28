"use client";

import { useState, useTransition } from "react";
import { ajouterCommercial } from "@/app/actions/commerciaux";
import { BUDGETS } from "@/lib/kpis";
import { BUDGET_PAR_SENIORITE, SENIORITES } from "@/lib/seniorite";
import { Button } from "@/components/ui/Button";

function Choix<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold text-muted">{label}</div>
      <div className="flex gap-1 rounded-[11px] border border-line bg-paper p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`flex-1 rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors ${
                on ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Nouveau commercial : nom, séniorité, budget. Le budget suit la séniorité tant qu'on ne le change pas à la main.
export function CommercialForm({
  nomInitial = "",
  profilInitial,
  onCreated,
  onCancel,
}: {
  nomInitial?: string;
  profilInitial?: { seniorite: string; budget: number }; // ex. détecté sur les captures BI
  onCreated: (id: string, nom: string) => void;
  onCancel: () => void;
}) {
  const [nom, setNom] = useState(nomInitial);
  const [seniorite, setSeniorite] = useState(profilInitial?.seniorite ?? "M1");
  const [budget, setBudget] = useState(profilInitial?.budget ?? BUDGET_PAR_SENIORITE.M1);
  const [budgetManuel, setBudgetManuel] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await ajouterCommercial({ nom, seniorite, budget });
      if (result.ok) onCreated(result.id, nom.trim().replace(/\s+/g, " "));
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-[15px] border border-line bg-surface p-3.5 shadow-card">
      <div>
        <label htmlFor="nouveau-nom" className="mb-1.5 block text-[12px] font-semibold text-muted">
          Nom du commercial
        </label>
        <input
          id="nouveau-nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Prénom Nom"
          autoComplete="off"
          autoFocus
          maxLength={60}
          className="w-full rounded-[11px] border border-line bg-field px-3 py-[10px] text-base focus:border-accent focus:bg-white focus:outline-none sm:text-sm"
        />
      </div>
      <Choix
        label="Séniorité"
        options={SENIORITES.map((s) => ({ value: s, label: s }))}
        value={seniorite}
        onChange={(s) => {
          setSeniorite(s);
          if (!budgetManuel) setBudget(BUDGET_PAR_SENIORITE[s]);
        }}
      />
      <Choix
        label="Budget (objectif ventes et installs)"
        options={BUDGETS.map((b) => ({ value: b.value as number, label: String(b.value) }))}
        value={budget}
        onChange={(b) => {
          setBudget(b);
          setBudgetManuel(true);
        }}
      />
      {error && (
        <p role="alert" className="text-[13px] font-medium text-bad">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1 p-3! transition-opacity disabled:opacity-60">
          {pending ? "Création…" : "Ajouter à l'équipe"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending} className="w-auto flex-none p-3! px-4!">
          Annuler
        </Button>
      </div>
    </form>
  );
}
