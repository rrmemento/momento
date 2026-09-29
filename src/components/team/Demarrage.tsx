"use client";

import { useState, useTransition } from "react";
import { setDemarrage } from "@/app/actions/commerciaux";
import { currentMonthLabel, MOIS_DE_L_ANNEE } from "@/lib/mois";
import { firstName } from "@/lib/momento";
import { BUDGET_DU_NIVEAU, lireNiveau, NIVEAUX, niveauCalcule, type Niveau } from "@/lib/niveau-mois";
import type { Rep } from "@/lib/types";

const champ =
  "rounded-[9px] border border-line bg-field px-2 py-1.5 text-[13px] text-ink focus:border-accent focus:bg-white focus:outline-none";

const CHOIX: { niveau: Niveau; label: string }[] = [
  { niveau: "M1", label: "Démarre en M1" },
  { niveau: "M2", label: "Démarre en M2" },
  { niveau: "M3+", label: "Déjà senior (M3+)" },
];

// Le démarrage, sur la fiche : un seul réglage d'où l'app déduit le niveau de CHAQUE mois
// (mois de démarrage = niveau de départ, puis +1 par mois jusqu'à M3+ ; M1 → 5, M2 → 10, M3+ → 15).
export function Demarrage({ rep, onToast }: { rep: Rep; onToast: (message: string) => void }) {
  const { demarrage, sen } = rep.fiche;
  const depart = lireNiveau(sen);
  const courant = currentMonthLabel();
  const [edition, setEdition] = useState(false);
  const [niveau, setNiveau] = useState<Niveau>(depart ?? "M1");
  const [moisNom, setMoisNom] = useState((demarrage ?? courant).split(" ")[0]);
  const [annee, setAnnee] = useState(Number((demarrage ?? courant).split(" ")[1]));
  const [erreur, setErreur] = useState("");
  const [pending, startTransition] = useTransition();

  const anneeCourante = Number(courant.split(" ")[1]);
  const annees = Array.from({ length: 6 }, (_, k) => anneeCourante - 5 + k);
  const aujourdhui = niveauCalcule({ demarrage, seniorite: sen }, courant);

  // Ce que la fiche dit aujourd'hui, en une ligne.
  const resume =
    depart === "M3+"
      ? "Déjà senior : tous ses mois en M3+ (objectif 15)."
      : demarrage && aujourdhui
        ? `Démarrage ${demarrage.toLowerCase()} en ${depart} → aujourd'hui ${aujourdhui.seniorite} (objectif ${aujourdhui.budget}).`
        : `Démarrage non renseigné : le budget de la fiche (${rep.fiche.budget}) s'applique à tous les mois.`;

  function enregistrer() {
    setErreur("");
    const mois = niveau === "M3+" ? null : `${moisNom} ${annee}`;
    startTransition(async () => {
      const res = await setDemarrage(rep.id, niveau, mois);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setEdition(false);
      onToast(
        niveau === "M3+"
          ? `${firstName(rep)} : déjà senior, tous ses mois en M3+`
          : `${firstName(rep)} : démarrage ${mois!.toLowerCase()} en ${niveau}`,
      );
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-paper px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
        <span className="font-bold text-ink2">Démarrage</span>
        <span className={depart === "M3+" || demarrage ? "text-ink2" : "text-muted"}>{resume}</span>
        {!edition && (
          <button type="button" onClick={() => setEdition(true)} className="ml-auto font-semibold text-accent underline">
            {demarrage || depart === "M3+" ? "Modifier" : "Régler"}
          </button>
        )}
      </div>

      {edition && (
        <div className="mt-2.5 flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Niveau au démarrage">
            {CHOIX.map((c) => (
              <button
                key={c.niveau}
                type="button"
                role="radio"
                aria-checked={niveau === c.niveau}
                disabled={pending}
                onClick={() => setNiveau(c.niveau)}
                className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold ${
                  niveau === c.niveau ? "border-transparent bg-ink text-white" : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {niveau !== "M3+" && (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-muted">
              Mois de démarrage
              <select value={moisNom} onChange={(e) => setMoisNom(e.target.value)} disabled={pending} className={champ} aria-label="Mois">
                {MOIS_DE_L_ANNEE.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} disabled={pending} className={champ} aria-label="Année">
                {annees.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
          )}
          <div className="text-[11.5px] text-faint">
            {niveau === "M3+"
              ? "Tous ses mois seront jugés en M3+ (objectif 15)."
              : `${moisNom} ${annee} = ${niveau}, puis ${NIVEAUX.slice(NIVEAUX.indexOf(niveau) + 1).join(", puis ")} (plafond). Objectifs : M1 → ${BUDGET_DU_NIVEAU.M1}, M2 → ${BUDGET_DU_NIVEAU.M2}, M3+ → ${BUDGET_DU_NIVEAU["M3+"]}.`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={enregistrer}
              disabled={pending}
              className="rounded-[9px] bg-accent px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEdition(false);
                setErreur("");
              }}
              disabled={pending}
              className="rounded-[9px] px-2 py-1.5 text-[12.5px] font-semibold text-muted hover:text-ink"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {erreur && (
        <p role="alert" className="mt-1.5 text-[12px] font-medium text-bad">
          {erreur}
        </p>
      )}
    </div>
  );
}
