"use client";

import { useState, type ReactNode } from "react";
import { PROFILS, RECUL_MIN, type DiagnosticReponse } from "@/lib/parcours-ia";
import type { DiagnosticIa, ProfilParcours } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { useModeRm } from "@/components/ModeRm";

// Couleur du profil : vert = on peut compter dessus, rouge = à risque, orange = à surveiller.
const TONS: Record<ProfilParcours, { carte: string; badge: string }> = {
  valeur_sure: { carte: "border-good-line bg-good-soft", badge: "bg-good text-white" },
  progression: { carte: "border-accent/25 bg-accent-soft", badge: "bg-accent text-white" },
  risque: { carte: "border-bad-line bg-bad-soft", badge: "bg-bad text-white" },
  irregulier: { carte: "border-warn-line bg-warn-soft", badge: "bg-warn text-white" },
  rampup: { carte: "border-line bg-surface", badge: "bg-ink text-white" },
  repli: { carte: "border-warn-line bg-warn-soft", badge: "bg-warn text-white" },
};

const TRAJECTOIRES = {
  progresse: { icone: "↗", texte: "Progresse", ton: "text-good" },
  stagne: { icone: "→", texte: "Stagne", ton: "text-muted" },
  decroche: { icone: "↘", texte: "Décroche", ton: "text-bad" },
} as const;

// « mardi 29 septembre à 14:05 », heure de Paris.
const dateDiag = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

function Rubrique({ titre, ton = "text-muted", children }: { titre: string; ton?: string; children: ReactNode }) {
  return (
    <div className="border-t border-line2 pt-3 first:border-t-0 first:pt-0">
      <div className={`mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.04em] ${ton}`}>{titre}</div>
      {children}
    </div>
  );
}

function Puces({ items, puce, ton }: { items: string[]; puce: string; ton: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((t, k) => (
        <li key={k} className="flex gap-2 text-[13.5px] leading-[1.5] text-ink2">
          <span className={`font-bold ${ton}`} aria-hidden="true">
            {puce}
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

// 1. Le profil (gros, en haut) et 2. le diagnostic : un seul appel à l'IA, gardé dans le 1:1 du mois en cours.
export function ProfilDiagnostic({
  repId,
  prenom,
  recul,
  diagnostic,
  onDiagnostic,
}: {
  repId: string;
  prenom: string;
  recul: number; // nombre de mois avec ventes et installations saisies
  diagnostic: DiagnosticIa | null;
  onDiagnostic: (d: DiagnosticIa) => void;
}) {
  const modeRm = useModeRm();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function etablir() {
    setEnCours(true);
    setErreur(null);
    try {
      // Vue RM : la « personne » est un TM → diagnostic de son équipe dans le temps (même consigne d'analyste).
      const res = await fetch(modeRm ? "/api/parcours-tm" : "/api/parcours-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modeRm ? { tmId: repId } : { commercialId: repId }),
      });
      const data = (await res.json().catch(() => null)) as DiagnosticReponse | null;
      if (data?.ok) onDiagnostic(data.diagnostic);
      else setErreur(data?.error ?? "Le diagnostic n'a pas pu être établi. Réessaie.");
    } catch {
      setErreur("Connexion impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  const alerte = erreur && (
    <div role="alert" className="mt-3 rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
      {erreur}
    </div>
  );

  // Historique trop court : on le dit honnêtement, pas de profil inventé.
  if (recul < RECUL_MIN) {
    const reste = RECUL_MIN - recul;
    return (
      <section className="mb-5 rounded-2xl border border-dashed border-line bg-surface px-5 py-5 shadow-card">
        <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Profil</div>
        <div className="font-display text-[22px] font-bold">Pas encore assez de recul</div>
        <p className="mt-1 text-[14px] text-muted">
          {recul === 0 ? "Aucun mois de chiffres" : `${recul} mois de chiffres`} pour {prenom} : il en faut au moins{" "}
          {RECUL_MIN} pour un profil honnête. Reviens dans {reste} mois.
        </p>
      </section>
    );
  }

  // Pas encore de diagnostic : le bouton.
  if (!diagnostic) {
    return (
      <section className="mb-5 rounded-2xl border border-line bg-surface px-5 py-5 shadow-card">
        <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Profil & diagnostic</div>
        <p className="mb-4 text-[14px] text-muted">
          L&apos;IA relit tout le parcours de {prenom} ({recul} mois, mois particuliers compris) et rend un verdict :
          son profil, sa trajectoire, ce qui mérite ton attention et l&apos;action à mener.
        </p>
        <Button onClick={etablir} disabled={enCours} className="disabled:opacity-60">
          {enCours ? "Diagnostic en cours… (jusqu'à 1 min)" : "✦ Établir le profil et le diagnostic (IA)"}
        </Button>
        {alerte}
      </section>
    );
  }

  const p = PROFILS[diagnostic.profil];
  const ton = TONS[diagnostic.profil];
  const traj = TRAJECTOIRES[diagnostic.trajectoire.sens];

  return (
    <div className={`mb-5 ${enCours ? "opacity-60" : ""}`} aria-busy={enCours}>
      {/* 1. Le profil */}
      <section className={`rounded-2xl border px-5 py-5 shadow-card ${ton.carte}`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Profil de {prenom}</div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-[clamp(20px,3vw,26px)] font-bold ${ton.badge}`}
            >
              <span aria-hidden="true">{p.icone}</span>
              {p.label}
            </span>
            <p className="mt-3 text-[clamp(16px,2vw,19px)] font-semibold leading-[1.45] text-ink">{diagnostic.phrase}</p>
          </div>
          <button
            type="button"
            onClick={etablir}
            disabled={enCours}
            className="rounded-lg border border-line bg-surface px-2.5 py-[5px] text-[11.5px] font-bold text-accent disabled:opacity-60"
          >
            {enCours ? "Diagnostic…" : "↻ Régénérer"}
          </button>
        </div>
        <div className="mt-3 text-[11.5px] text-muted">Établi par l&apos;IA le {dateDiag(diagnostic.genereLe)}</div>
        {alerte}
      </section>

      {/* 2. Le diagnostic */}
      <section className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
        <Rubrique titre="Trajectoire">
          <p className="text-[14px] leading-[1.5] text-ink2">
            <b className={`font-bold ${traj.ton}`}>
              {traj.icone} {traj.texte}
            </b>{" "}
            — {diagnostic.trajectoire.texte}
          </p>
        </Rubrique>
        {(diagnostic.monte.length > 0 || diagnostic.coince.length > 0) && (
          <Rubrique titre="Ce qui monte · ce qui coince">
            <div className="flex flex-col gap-1.5">
              <Puces items={diagnostic.monte} puce="↗" ton="text-good" />
              <Puces items={diagnostic.coince} puce="↘" ton="text-warn" />
            </div>
          </Rubrique>
        )}
        <Rubrique titre="En priorité" ton="text-accent">
          <div className="rounded-xl border-l-4 border-accent bg-accent-soft px-4 py-3">
            <p className="text-[14px] font-semibold leading-[1.5] text-ink">{diagnostic.priorite.texte}</p>
            <p className="mt-1.5 text-[13.5px] leading-[1.5] text-ink2">
              <b className="font-bold text-accent">Action :</b> {diagnostic.priorite.action}
            </p>
          </div>
        </Rubrique>
        {diagnostic.reussites.length > 0 && (
          <Rubrique titre="Points forts et réussites" ton="text-good">
            <Puces items={diagnostic.reussites} puce="★" ton="text-good" />
          </Rubrique>
        )}
      </section>
    </div>
  );
}
