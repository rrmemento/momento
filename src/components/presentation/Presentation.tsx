"use client";

import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { sujetRempli } from "@/lib/brief";
import { libelleObjectifChiffre } from "@/lib/kpis";
import { firstName } from "@/lib/momento";
import type { Engagement, StatutEngagement } from "@/lib/suivi";
import type { OneOnOne, Rep, Subject } from "@/lib/types";
import { Logo } from "@/components/ui/Logo";
import { autresChiffres, chiffresBandeau, jauges, ton, type ChiffreCle, type Jauge } from "./chiffres";

// Le « Mode présentation » : ce que l'on MONTRE au commercial pendant le 1:1, un écran à la fois.
// Volontairement absents : le brief de posture, le statut global (à accompagner / à surveiller / en forme)
// et l'analyse MOMENTO. Les chiffres, eux, sont colorés factuellement.

// bandeau = rappel des chiffres clés en haut de l'écran (écrans « sujet »).
type Ecran = { id: string; titre: string; contenu: ReactNode; bandeau?: boolean };

// ——— Petits éléments de mise en page ———

function Surtitre({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-sm font-bold uppercase tracking-[0.08em] text-accent-2">{children}</div>;
}

function GrandTitre({ children }: { children: ReactNode }) {
  return <h2 className="mb-6 text-[clamp(28px,4.5vw,44px)] font-bold leading-[1.1]">{children}</h2>;
}

function ZoneTexte({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold uppercase tracking-[0.06em] text-muted">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-28 w-full resize-y rounded-2xl border-2 border-line bg-surface px-4 py-3 text-[clamp(17px,2vw,20px)] leading-[1.5] text-ink placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_4px_var(--color-accent-soft)] focus:outline-none"
      />
    </label>
  );
}

// ——— L'ouverture et « Ton mois » (mêmes champs que la fiche 1:1) ———

function Question({ children }: { children: ReactNode }) {
  return (
    <p className="mb-5 rounded-2xl border-l-4 border-accent bg-accent-soft px-5 py-4 text-[clamp(20px,2.6vw,26px)] font-semibold leading-[1.4] text-ink">
      {children}
    </p>
  );
}

function NoteSur10({ note, onNote }: { note: number; onNote: (n: number) => void }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-bold uppercase tracking-[0.06em] text-muted">Ton auto-note /10</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ton auto-note sur 10">
        {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onNote(n)}
            aria-pressed={note === n}
            className={`size-[clamp(44px,6vw,56px)] rounded-xl border-2 font-display text-[clamp(18px,2.2vw,22px)] font-bold transition-colors duration-150 ${
              note === n ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:border-accent"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ——— Les chiffres ———

// Ventes / installations : la barre montre l'atteinte du budget, la couleur suit le pace (projection fin de mois).
function CarteJauge({ jauge: j }: { jauge: Jauge }) {
  const t = ton(j.ton);
  return (
    <div className={`rounded-2xl border p-5 shadow-card ${t.carte}`}>
      <div className="text-[15px] font-semibold text-muted">{j.label}</div>
      <div className={`mt-1 font-display text-[clamp(40px,6vw,60px)] font-bold leading-none ${t.texte}`}>
        {j.valeur}
        <span className="text-[0.45em] font-semibold text-faint"> / {j.objectif}</span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-track">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${t.barre}`}
          style={{ width: `${Math.min(j.ratio, 1) * 100}%` }}
        />
      </div>
      <div className={`mt-2 text-[14px] font-semibold ${t.texte}`}>
        {j.ratio >= 1 ? "Objectif atteint ✓" : `${Math.round(j.ratio * 100)} % de l'objectif`}
        {j.pace != null && <span className="font-medium text-muted"> · projection fin de mois {j.pace} %</span>}
      </div>
    </div>
  );
}

function CarteChiffre({ chiffre: c }: { chiffre: ChiffreCle }) {
  const t = ton(c.ton);
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${t.carte}`}>
      <div className="text-[13.5px] font-semibold text-muted">{c.label}</div>
      <div className={`mt-1 font-display text-[clamp(24px,3vw,30px)] font-bold leading-tight ${t.texte}`}>
        {c.valeur}
      </div>
    </div>
  );
}

// La légende des couleurs : des repères factuels, pas un jugement.
function Legende() {
  const items = [
    { t: "bon" as const, texte: "Objectif atteint" },
    { t: "moyen" as const, texte: "À améliorer" },
    { t: "critique" as const, texte: "Prioritaire" },
  ];
  return (
    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] font-semibold text-muted">
      {items.map((i) => (
        <span key={i.t} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${ton(i.t).point}`} />
          {i.texte}
        </span>
      ))}
    </div>
  );
}

function Chiffres({ rep }: { rep: Rep }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {jauges(rep).map((j) => (
          <CarteJauge key={j.label} jauge={j} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {autresChiffres(rep).map((c) => (
          <CarteChiffre key={c.cle} chiffre={c} />
        ))}
      </div>
      <Legende />
    </>
  );
}

// Le rappel des chiffres clés en haut des écrans « sujet » : discret, pour les avoir sous les yeux.
function BandeauChiffres({ rep }: { rep: Rep }) {
  return (
    <div
      className="no-scrollbar -mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1"
      aria-label="Rappel des chiffres du mois"
    >
      {chiffresBandeau(rep).map((c) => {
        const t = ton(c.ton);
        return (
          <span
            key={c.cle}
            className={`flex flex-none items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${t.carte}`}
          >
            <span className={`size-2 rounded-full ${t.point}`} />
            <span className="font-medium text-muted">{c.label}</span>
            <b className={`font-bold ${t.texte}`}>{c.valeur}</b>
          </span>
        );
      })}
    </div>
  );
}

// ——— Les engagements du mois dernier ———

const RESULTATS: Record<StatutEngagement, { texte: string; ton: string }> = {
  tenu: { texte: "Tenu ✅", ton: "bg-good-soft text-good" },
  non_tenu: { texte: "Non tenu", ton: "bg-paper text-ink2 border border-line" },
  en_cours: { texte: "En cours", ton: "bg-warn-soft text-warn" },
  a_juger: { texte: "On en parle", ton: "bg-accent-soft text-accent" },
  manquant: { texte: "Chiffre à venir", ton: "bg-paper text-muted border border-dashed border-line" },
};

function EngagementsPasses({ liste }: { liste: Engagement[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {liste.map((e) => {
        const r = RESULTATS[e.statut];
        return (
          <li key={e.index} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-[clamp(18px,2.2vw,22px)] font-semibold">{e.titre}</div>
              {e.cible && (
                <div className="mt-1 text-[15px] text-muted">
                  Objectif : <b className="font-semibold text-ink2">{e.cible}</b>
                  {e.reel != null && (
                    <>
                      {" "}
                      · Réalisé : <b className="font-semibold text-ink2">{e.reel}</b>
                    </>
                  )}
                </div>
              )}
              {!e.cible && e.objectif && <div className="mt-1 text-[15px] text-muted">{e.objectif}</div>}
            </div>
            <span className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[15px] font-bold ${r.ton}`}>{r.texte}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ——— Un sujet ———

const lignes = (texte: string) =>
  texte
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

function EcranSujet({
  sujet,
  onChange,
}: {
  sujet: Subject;
  onChange: (champ: "reponse" | "g", valeur: string) => void;
}) {
  const questions = lignes(sujet.questions);
  const cible = libelleObjectifChiffre(sujet.cible);
  return (
    <div className="flex flex-col gap-6">
      {sujet.o && <p className="text-[clamp(18px,2.2vw,22px)] leading-[1.55] text-ink2">{sujet.o}</p>}
      {questions.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {questions.map((q, k) => (
            <li
              key={k}
              className="rounded-2xl border-l-4 border-accent bg-accent-soft px-5 py-3.5 text-[clamp(18px,2.2vw,22px)] font-semibold leading-[1.45] text-ink"
            >
              {q}
            </li>
          ))}
        </ul>
      )}
      <ZoneTexte
        label="Ta réponse"
        value={sujet.reponse}
        placeholder="On la note ensemble…"
        onChange={(v) => onChange("reponse", v)}
      />
      <div className="rounded-2xl border border-good-line bg-good-soft p-5">
        <div className="mb-1.5 text-sm font-bold uppercase tracking-[0.06em] text-good">🎯 Objectif</div>
        {cible && <div className="mb-3 font-display text-[clamp(24px,3.2vw,32px)] font-bold text-ink">{cible}</div>}
        <input
          value={sujet.g}
          placeholder={cible ? "Précise l'objectif en une phrase (facultatif)" : "L'objectif qu'on fixe ensemble"}
          onChange={(e) => onChange("g", e.target.value)}
          aria-label="Objectif concret"
          className="w-full rounded-xl border border-good-line bg-surface px-4 py-3 text-[clamp(16px,1.9vw,19px)] text-ink placeholder:text-faint focus:border-good focus:outline-none"
        />
      </div>
    </div>
  );
}

// ——— L'écran de fin ———

function Fin({ sujets, besoin, onBesoin }: { sujets: Subject[]; besoin: string; onBesoin: (v: string) => void }) {
  const objectifs = sujets.filter((s) => s.cible?.valeur != null || s.g.trim());
  return (
    <div className="flex flex-col gap-7">
      {objectifs.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {objectifs.map((s, k) => (
            <li key={k} className="flex gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
              <span className="grid size-9 flex-none place-items-center rounded-full bg-accent font-display text-lg font-bold text-white">
                {k + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[clamp(18px,2.2vw,22px)] font-semibold">{s.t || `Sujet ${k + 1}`}</div>
                {libelleObjectifChiffre(s.cible) && (
                  <div className="mt-0.5 font-display text-[20px] font-bold text-good">
                    {libelleObjectifChiffre(s.cible)}
                  </div>
                )}
                {s.g.trim() && <div className="mt-0.5 text-[16px] text-muted">{s.g}</div>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[18px] text-muted">Pas encore d&apos;objectif fixé : on peut revenir sur les sujets.</p>
      )}
      <ZoneTexte
        label="Ce dont tu as besoin de moi"
        value={besoin}
        placeholder="Un coup de main, un outil, du temps ensemble…"
        onChange={onBesoin}
      />
    </div>
  );
}

// ——— La présentation ———

export function Presentation({
  rep,
  month,
  moisPrecedent,
  fiche,
  engagements,
  onModifier,
  onClose,
}: {
  rep: Rep;
  month: string;
  moisPrecedent: string;
  fiche: OneOnOne;
  engagements: Engagement[];
  onModifier: (change: (fiche: OneOnOne) => OneOnOne) => void;
  onClose: () => void;
}) {
  const prenom = firstName(rep);
  const sujets = fiche.sujets.map((s, index) => ({ s, index })).filter(({ s }) => sujetRempli(s));

  function modifierSujet(index: number, champ: "reponse" | "g", valeur: string) {
    onModifier((f) => ({ ...f, sujets: f.sujets.map((s, k) => (k === index ? { ...s, [champ]: valeur } : s)) }));
  }

  const ecrans: Ecran[] = [
    {
      id: "intro",
      titre: "Bienvenue",
      contenu: (
        <div className="flex min-h-[55vh] flex-col items-start justify-center">
          <Surtitre>One-on-One · {month}</Surtitre>
          <h1 className="text-[clamp(44px,8vw,88px)] font-bold leading-[1]">{rep.name}</h1>
          <p className="mt-6 max-w-[640px] text-[clamp(19px,2.4vw,24px)] leading-[1.5] text-muted">
            Merci pour ce moment, {prenom}. On regarde ensemble ton mois de {month.toLowerCase()}, on fait le point sur
            ce qu&apos;on s&apos;était dit, puis on fixe le cap pour la suite.
          </p>
        </div>
      ),
    },
    {
      id: "ouverture",
      titre: "Ouverture",
      contenu: (
        <>
          <Question>Comment tu te sens ce mois, au-delà des chiffres ?</Question>
          <ZoneTexte
            label="Ton ressenti"
            value={fiche.ressenti}
            placeholder="On le note ensemble…"
            onChange={(v) => onModifier((f) => ({ ...f, ressenti: v }))}
          />
        </>
      ),
    },
    {
      id: "son-mois",
      titre: "Ton mois",
      contenu: (
        <div className="flex flex-col gap-6">
          <ZoneTexte
            label="Ce qui t'a rendu fier(e) ?"
            value={fiche.fier}
            placeholder="Une vente, un client, un progrès…"
            onChange={(v) => onModifier((f) => ({ ...f, fier: v }))}
          />
          <ZoneTexte
            label="Ce qui t'a bloqué(e) ?"
            value={fiche.bloque}
            placeholder="Un frein, un dossier, un manque…"
            onChange={(v) => onModifier((f) => ({ ...f, bloque: v }))}
          />
          <NoteSur10 note={fiche.note} onNote={(n) => onModifier((f) => ({ ...f, note: n }))} />
        </div>
      ),
    },
    ...(rep.hasKpis
      ? [{ id: "chiffres", titre: "Tes chiffres", contenu: <Chiffres rep={rep} /> }]
      : []),
    ...(engagements.length
      ? [
          {
            id: "engagements",
            titre: `Ce qu'on s'était dit en ${moisPrecedent.toLowerCase()}`,
            contenu: <EngagementsPasses liste={engagements} />,
          },
        ]
      : []),
    ...sujets.map(({ s, index }, k) => ({
      id: `sujet-${index}`,
      titre: s.t || `Sujet ${k + 1}`,
      contenu: <EcranSujet sujet={s} onChange={(champ, v) => modifierSujet(index, champ, v)} />,
      bandeau: true,
    })),
    {
      id: "fin",
      titre: "Nos objectifs pour la suite",
      contenu: (
        <Fin
          sujets={sujets.map(({ s }) => s)}
          besoin={fiche.besoin}
          onBesoin={(v) => onModifier((f) => ({ ...f, besoin: v }))}
        />
      ),
    },
  ];

  // Surtitres des écrans de sujet : « Sujet 2 / 3 ».
  const surtitres: Record<string, string> = {
    ouverture: "Pour commencer",
    "son-mois": "On t'écoute d'abord",
    chiffres: `Ton mois de ${month.toLowerCase()}`,
    engagements: "Le mois dernier",
    fin: "Pour finir",
  };
  sujets.forEach(({ index }, k) => (surtitres[`sujet-${index}`] = `Sujet ${k + 1} / ${sujets.length}`));

  const [position, setPosition] = useState(0);
  const i = Math.min(position, ecrans.length - 1);
  const ecran = ecrans[i];
  const aller = (delta: number) => setPosition((p) => Math.max(0, Math.min(ecrans.length - 1, p + delta)));

  // Clavier : ← → pour dérouler (sauf pendant la saisie), Échap pour sortir.
  const allerRef = useRef(aller);
  const fermerRef = useRef(onClose);
  useEffect(() => {
    allerRef.current = aller;
    fermerRef.current = onClose;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return fermerRef.current();
      const saisie = e.target instanceof HTMLElement && e.target.closest("input, textarea, select");
      if (saisie) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") allerRef.current(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") allerRef.current(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Vrai plein écran quand le navigateur le permet ; Échap du navigateur ferme aussi la présentation.
  // La page derrière ne défile plus tant que la présentation est ouverte.
  useEffect(() => {
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let pleinEcran = false;
    const surChangement = () => {
      if (document.fullscreenElement) pleinEcran = true;
      else if (pleinEcran) fermerRef.current();
    };
    document.addEventListener("fullscreenchange", surChangement);
    document.documentElement.requestFullscreen?.().catch(() => {}); // refusé (iPad…) : l'overlay suffit
    return () => {
      document.body.style.overflow = debordement;
      document.removeEventListener("fullscreenchange", surChangement);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Glisser du doigt sur tablette (hors zones de saisie).
  const toucheX = useRef<number | null>(null);
  function debutToucher(e: TouchEvent) {
    const saisie = e.target instanceof HTMLElement && e.target.closest("input, textarea");
    toucheX.current = saisie ? null : e.touches[0].clientX;
  }
  function finToucher(e: TouchEvent) {
    if (toucheX.current == null) return;
    const dx = e.changedTouches[0].clientX - toucheX.current;
    toucheX.current = null;
    if (Math.abs(dx) > 70) aller(dx < 0 ? 1 : -1);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Présentation du One-on-One de ${rep.name}`}
      className="fixed inset-0 z-50 flex flex-col bg-paper"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-center gap-2 font-display text-[17px] font-extrabold tracking-[-0.03em]">
          <Logo size={22} />
          momento
        </div>
        <div className="hidden text-[14px] font-semibold text-muted sm:block">
          · {rep.name} · {month}
        </div>
        <div className="ml-auto text-[13px] font-semibold text-faint" aria-live="polite">
          {i + 1} / {ecrans.length}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border border-line bg-surface px-3.5 py-2 text-[13.5px] font-semibold text-ink hover:border-ink"
        >
          ✕ Fermer
        </button>
      </header>

      <main className="flex-1 overflow-y-auto" onTouchStart={debutToucher} onTouchEnd={finToucher}>
        <div key={ecran.id} className="mx-auto w-full max-w-[860px] animate-fade px-5 py-8 sm:px-8 sm:py-12">
          {ecran.bandeau && rep.hasKpis && <BandeauChiffres rep={rep} />}
          {ecran.id !== "intro" && (
            <>
              <Surtitre>{surtitres[ecran.id]}</Surtitre>
              <GrandTitre>{ecran.titre}</GrandTitre>
            </>
          )}
          {ecran.contenu}
        </div>
      </main>

      <footer className="flex items-center gap-3 border-t border-line bg-surface/80 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={() => aller(-1)}
          disabled={i === 0}
          className="rounded-xl border border-line bg-surface px-5 py-3 text-[15px] font-bold text-ink disabled:opacity-30"
        >
          ← Précédent
        </button>
        <div className="flex flex-1 flex-wrap justify-center gap-1.5" aria-hidden="true">
          {ecrans.map((e, k) => (
            <button
              key={e.id}
              type="button"
              tabIndex={-1}
              onClick={() => setPosition(k)}
              className={`h-2 rounded-full transition-all duration-300 ${k === i ? "w-6 bg-accent" : "w-2 bg-line"}`}
            />
          ))}
        </div>
        {i < ecrans.length - 1 ? (
          <button
            type="button"
            onClick={() => aller(1)}
            className="rounded-xl bg-accent px-5 py-3 text-[15px] font-bold text-white"
          >
            Suivant →
          </button>
        ) : (
          <button type="button" onClick={onClose} className="rounded-xl bg-accent px-5 py-3 text-[15px] font-bold text-white">
            Terminer
          </button>
        )}
      </footer>
    </div>
  );
}
