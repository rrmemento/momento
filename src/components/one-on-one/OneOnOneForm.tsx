"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { emptySubject, firstName } from "@/lib/momento";
import { getOneOnOne, updateOneOnOne, useOneOnOnes } from "@/lib/one-on-one-store";
import type { Analysis, OneOnOne, Rep, Subject } from "@/lib/types";
import { Button } from "@/components/ui/Button";

const inputClass =
  "w-full rounded-[11px] border border-line bg-field px-[13px] py-[11px] text-sm text-ink focus:border-accent focus:bg-white focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none";

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line2 py-4">
      <div className="mb-0.5 flex flex-wrap items-center gap-2 text-[15px] font-bold">
        {title}
        {action}
      </div>
      {description && <div className="mb-3 text-xs text-faint">{description}</div>}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="mb-3 last:mb-0">
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-muted">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} min-h-16 resize-y leading-[1.55]`}
        />
      )}
    </Field>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  );
}

type TextKey = Exclude<keyof OneOnOne, "note" | "sujets">;

// La fiche 1:1, à droite des KPIs. Tout est enregistré automatiquement.
export function OneOnOneForm({
  rep,
  month,
  analysis,
  onToast,
}: {
  rep: Rep;
  month: string;
  analysis: Analysis;
  onToast: (message: string) => void;
}) {
  const oo = getOneOnOne(useOneOnOnes(), month, rep.id);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = (change: (o: OneOnOne) => OneOnOne) => updateOneOnOne(month, rep.id, change);

  function flashSaved() {
    setJustSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1100);
  }

  function setField(field: TextKey, value: string) {
    update((o) => ({ ...o, [field]: value }));
    flashSaved();
  }

  function setNote(note: number) {
    update((o) => ({ ...o, note }));
    flashSaved();
  }

  function setSubject(index: number, field: keyof Subject, value: string) {
    update((o) => ({ ...o, sujets: o.sujets.map((s, k) => (k === index ? { ...s, [field]: value } : s)) }));
    flashSaved();
  }

  function addSubject() {
    update((o) => ({ ...o, sujets: [...o.sujets, emptySubject()] }));
  }

  function removeSubject(index: number) {
    update((o) => {
      const sujets = o.sujets.filter((_, k) => k !== index);
      return { ...o, sujets: sujets.length ? sujets : [emptySubject()] };
    });
  }

  // Pré-remplit « Mon retour » à partir de l'analyse, sans écraser ce qui est déjà écrit.
  function prefill() {
    update((o) => {
      const problems = [...analysis.N, ...analysis.A];
      const sujets = o.sujets.map((s, k) =>
        !s.o && problems[k] ? { ...s, o: `${problems[k].tt} : ${problems[k].dd}` } : s,
      );
      return {
        ...o,
        forts: o.forts || analysis.S.map((x) => `• ${x.tt} — ${x.dd}`).join("\n"),
        titre: o.titre || problems[0]?.tt || "",
        sujets,
      };
    });
    onToast("Retour pré-rempli — à toi de l'affiner");
  }

  function sendRecap(channel: "mail" | "slack") {
    const prefix = channel === "mail" ? "Récap envoyé par mail à " : "Récap posté sur Slack pour ";
    onToast(`${prefix}${firstName(rep)} (démo)`);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface px-[18px] pt-1 pb-[18px] shadow-card">
      <Section title="Ouverture" description="Comment il/elle se sent, au-delà des chiffres.">
        <TextArea label="Son ressenti sur le mois" value={oo.ressenti} onChange={(v) => setField("ressenti", v)} />
      </Section>

      <Section title="Son mois" description="On l'écoute d'abord.">
        <TextArea label="Ce qui l'a rendu(e) fier(e)" value={oo.fier} onChange={(v) => setField("fier", v)} />
        <TextArea label="Ce qui l'a bloqué(e)" value={oo.bloque} onChange={(v) => setField("bloque", v)} />
        <div className="mb-3 last:mb-0">
          <div className="mb-1.5 block text-[12.5px] font-semibold text-muted">Son auto-note /10</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Son auto-note sur 10">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNote(n)}
                aria-pressed={oo.note === n}
                className={`size-[38px] rounded-[10px] border font-bold ${
                  oo.note === n ? "border-transparent bg-ink text-white" : "border-line bg-field text-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Mon retour"
        description="Commencer par le positif."
        action={
          <button
            type="button"
            onClick={prefill}
            className="rounded-lg bg-accent-soft px-2.5 py-[5px] text-[11.5px] font-bold text-accent"
          >
            Pré-remplir
          </button>
        }
      >
        <TextInput
          label="Le titre du mois"
          value={oo.titre}
          placeholder="Ex : gros volume, POS à installer"
          onChange={(v) => setField("titre", v)}
        />
        <TextArea label="Points forts retenus" value={oo.forts} onChange={(v) => setField("forts", v)} />
      </Section>

      <Section title="Ce qu'on va chercher ensemble" description="Un sujet suffit. Ajoute-en si besoin.">
        {oo.sujets.map((s, k) => (
          <div key={k} className="mb-2.5 rounded-xl border border-line bg-field p-[13px]">
            <div className="mb-2.5 flex items-center text-xs font-bold text-accent">
              Sujet {k + 1}
              {oo.sujets.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSubject(k)}
                  className="ml-auto text-xs font-bold text-faint"
                >
                  retirer
                </button>
              )}
            </div>
            <TextInput
              label="Le sujet"
              value={s.t}
              placeholder="Ex : aller chercher le volume d'installs"
              onChange={(v) => setSubject(k, "t", v)}
            />
            <TextArea label="Ce que j'observe" value={s.o} onChange={(v) => setSubject(k, "o", v)} />
            <TextArea label="Comment on le règle" value={s.r} onChange={(v) => setSubject(k, "r", v)} />
            <TextArea label="Objectif concret" value={s.g} onChange={(v) => setSubject(k, "g", v)} />
          </div>
        ))}
        <button
          type="button"
          onClick={addSubject}
          className="w-full rounded-[11px] bg-accent-soft p-[11px] text-[13.5px] font-bold text-accent"
        >
          ＋ Ajouter un sujet
        </button>
      </Section>

      <Section title="Pour finir">
        <TextArea label="Ce dont il/elle a besoin de moi" value={oo.besoin} onChange={(v) => setField("besoin", v)} />
        <TextArea label="Son objectif perso du mois" value={oo.objectif} onChange={(v) => setField("objectif", v)} />
      </Section>

      <div className="mt-4 flex flex-col gap-[9px]">
        <Button onClick={() => sendRecap("mail")}>Envoyer le récap par mail</Button>
        <Button variant="ghost" onClick={() => sendRecap("slack")}>
          Envoyer sur Slack
        </Button>
        <div className="text-center text-xs text-faint" aria-live="polite">
          {justSaved ? "Enregistré ✓" : "Enregistré automatiquement"}
        </div>
      </div>
    </div>
  );
}
