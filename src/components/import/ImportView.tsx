"use client";

import { useEffect, useRef, useState } from "react";
import type { KpiDonnees } from "@/lib/kpis";
import {
  associerLignes,
  CAPTURES_BI,
  type ImportBi,
  type LectureBiReponse,
  TAILLE_MAX_IMAGE,
  TYPES_IMAGE,
  valeursFormulaire,
} from "@/lib/lecture-bi";
import type { Rep } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";

export type Capture = { file: File; preview: string };

const DELAI_RELANCE_S = 30; // attente avant la relance automatique quand Google est surchargé

export function DropZone({
  code,
  title,
  hint,
  capture,
  disabled,
  onFile,
}: {
  code: string;
  title: string;
  hint: string;
  capture: Capture | null;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  const border = over || capture ? "border-accent" : "border-[#C7C4B8]";

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !disabled) onFile(file);
      }}
      className={`block cursor-pointer rounded-[15px] border-[1.5px] p-[18px] shadow-card transition duration-150 ${border} ${
        capture ? "border-solid" : "border-dashed"
      } ${over ? "bg-[#FAFCFA]" : "bg-surface"} ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <input
        type="file"
        accept={TYPES_IMAGE.join(",")}
        hidden
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = ""; // permet de rechoisir la même image
        }}
      />
      <div className="flex items-center gap-3.5">
        <div
          className={`grid size-11 flex-none place-items-center overflow-hidden rounded-xl text-xl text-accent ${
            capture ? "bg-paper" : "bg-accent-soft"
          }`}
        >
          {capture ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local d'une image choisie
            <img src={capture.preview} alt="" className="size-full object-cover" />
          ) : (
            "＋"
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[14.5px] font-bold">
            <span className="text-faint">{code} · </span>
            {title}
          </div>
          <div className={`mt-0.5 truncate text-xs ${capture ? "font-semibold text-ink" : "text-faint"}`}>
            {capture ? capture.file.name : `${hint} — appuie ou dépose l'image`}
          </div>
        </div>
      </div>
    </label>
  );
}

export function ImportView({
  month,
  reps,
  saved,
  importEnCours,
  onImported,
  onToast,
}: {
  month: string;
  reps: Rep[];
  saved: Record<string, KpiDonnees>;
  importEnCours: ImportBi | null;
  onImported: (imp: ImportBi) => void;
  onToast: (message: string) => void;
}) {
  const [captures, setCaptures] = useState<(Capture | null)[]>(CAPTURES_BI.map(() => null));
  const [error, setError] = useState("");
  const [reessayable, setReessayable] = useState(false);
  const [pending, setPending] = useState(false);
  const [relanceDans, setRelanceDans] = useState<number | null>(null); // secondes avant la relance automatique
  const minuterie = useRef<ReturnType<typeof setInterval> | null>(null);

  function annulerRelance() {
    if (minuterie.current) clearInterval(minuterie.current);
    minuterie.current = null;
    setRelanceDans(null);
  }

  // Google surchargé (503) : on relance une seule fois, tout seul, après un délai.
  function programmerRelance() {
    let reste = DELAI_RELANCE_S;
    setRelanceDans(reste);
    minuterie.current = setInterval(() => {
      reste -= 1;
      if (reste > 0) {
        setRelanceDans(reste);
        return;
      }
      annulerRelance();
      void analyser({ auto: true });
    }, 1000);
  }

  // Pas de relance fantôme si l'utilisateur quitte l'écran pendant le compte à rebours.
  useEffect(
    () => () => {
      if (minuterie.current) clearInterval(minuterie.current);
    },
    [],
  );

  function setCapture(index: number, file: File) {
    annulerRelance();
    setReessayable(false);
    if (!TYPES_IMAGE.includes(file.type)) {
      setError(`« ${file.name} » n'est pas une image PNG, JPEG ou WebP.`);
      return;
    }
    if (file.size > TAILLE_MAX_IMAGE) {
      setError(`« ${file.name} » dépasse 5 Mo. Recadre la capture sur le tableau.`);
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const capture = { file, preview: reader.result as string };
      setCaptures((prev) => prev.map((c, i) => (i === index ? capture : c)));
    };
    reader.readAsDataURL(file);
  }

  async function analyser({ auto = false } = {}) {
    annulerRelance();
    const manquantes = CAPTURES_BI.filter((_, i) => !captures[i]).map((c) => c.code);
    if (manquantes.length) {
      setError(`Il manque ${manquantes.length > 1 ? "les captures" : "la capture"} ${manquantes.join(", ")}.`);
      return;
    }
    const brouillons = importEnCours
      ? importEnCours.mois !== month ||
        Object.keys(importEnCours.valeurs).some((id) => !importEnCours.enregistres.includes(id))
      : false;
    // Relance automatique : l'utilisateur a déjà confirmé au premier essai.
    if (!auto && brouillons && !window.confirm("Un import précédent n'est pas entièrement enregistré. Le remplacer ?")) return;

    setError("");
    setReessayable(false);
    setPending(true);
    const body = new FormData();
    for (const c of captures) if (c) body.append("images", c.file);

    let reponse: LectureBiReponse;
    try {
      const res = await fetch("/api/lecture-bi", { method: "POST", body });
      reponse = await res.json().catch(() => ({
        ok: false,
        error: `Le serveur a répondu de façon inattendue (erreur ${res.status}).`,
        reessayable: res.status >= 500,
      }));
    } catch {
      reponse = { ok: false, error: "Impossible de joindre le serveur. Vérifie ta connexion.", reessayable: true };
    }
    setPending(false);

    if (!reponse.ok) {
      setError(reponse.error);
      setReessayable(!!reponse.reessayable);
      if (reponse.reessayable && !auto) programmerRelance();
      return;
    }

    const { reconnus, nonReconnus } = associerLignes(reponse.commerciaux, reps);
    onImported({
      id: (importEnCours?.id ?? 0) + 1,
      mois: month,
      lignes: Object.fromEntries(reconnus.map((r) => [r.repId, r.ligne])),
      valeurs: Object.fromEntries(reconnus.map((r) => [r.repId, valeursFormulaire(r.ligne.valeurs, saved[r.repId])])),
      nonReconnus,
      enregistres: [],
    });
    onToast(
      `${reconnus.length} commercia${reconnus.length > 1 ? "ux" : "l"} pré-rempli${reconnus.length > 1 ? "s" : ""}` +
        (nonReconnus.length ? ` · ${nonReconnus.length} non reconnu${nonReconnus.length > 1 ? "s" : ""}` : "") +
        " — vérifie avant d'enregistrer",
    );
  }

  const count = captures.filter(Boolean).length;

  return (
    <div className="mx-auto max-w-[600px]">
      <PageTitle kicker="Remplir les chiffres" title="Importer le BI" />
      <p className="mb-2.5 text-sm leading-[1.6] text-muted">
        Ajoute tes 3 captures Power BI. MOMENTO les lit et pré-remplit les chiffres de chaque commercial, plus bas dans
        « Chiffres du mois » : tu vérifies, tu corriges, puis tu enregistres. Rien n&apos;est enregistré sans toi.
      </p>
      <a href="#chiffres-du-mois" className="mb-[18px] inline-block text-[13px] font-semibold text-accent underline">
        Pas de captures ? Saisir ou corriger les chiffres à la main ↓
      </a>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[13px] border border-line bg-surface px-3.5 py-3 shadow-card">
        <span className="text-[13px] font-semibold text-muted">Ces données concernent</span>
        <span className="rounded-[9px] border border-line px-[11px] py-2 text-[13.5px] font-semibold">{month}</span>
        <span className="text-xs text-faint">change le mois en haut à droite</span>
      </div>

      <div className="mb-4 flex flex-col gap-[11px]">
        {CAPTURES_BI.map((c, i) => (
          <DropZone
            key={c.code}
            code={c.code}
            title={c.titre}
            hint={c.hint}
            capture={captures[i]}
            disabled={pending}
            onFile={(file) => setCapture(i, file)}
          />
        ))}
      </div>

      {error && reessayable && !pending ? (
        // Surcharge passagère : message rassurant + bouton « Réessayer » bien visible.
        <div role="alert" className="mb-3 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-3 text-[13px] text-ink">
          <p className="font-semibold text-warn">{error}</p>
          <p className="mt-1 text-muted">
            {relanceDans !== null
              ? `Ce n'est pas de ta faute. Nouvelle tentative automatique dans ${relanceDans} s…`
              : "Ce n'est pas de ta faute : c'est passager. Réessaie dans un instant."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => analyser()} className="flex-1">
              ↻ Réessayer{relanceDans !== null ? " maintenant" : ""}
            </Button>
            {relanceDans !== null && (
              <Button variant="ghost" onClick={annulerRelance} className="w-auto flex-none px-4">
                Annuler
              </Button>
            )}
          </div>
        </div>
      ) : (
        error && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-bad-line bg-bad-soft px-3.5 py-2.5 text-[13px] font-medium text-bad"
          >
            {error}
          </p>
        )
      )}

      {!(error && reessayable && !pending) && (
        <Button onClick={() => analyser()} disabled={pending} className="transition-opacity disabled:opacity-60">
          {pending ? "Lecture des captures…" : "Analyser les captures"}
        </Button>
      )}
      <p className="mt-2.5 text-center text-xs text-faint">
        {pending
          ? "Si Google est chargé, MOMENTO réessaie tout seul : ça peut prendre jusqu'à 3 minutes, ne ferme pas la page."
          : `${count}/${CAPTURES_BI.length} captures chargées`}
      </p>
    </div>
  );
}
