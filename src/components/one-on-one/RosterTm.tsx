"use client";

import { useState, useTransition } from "react";
import { renommerTm, retirerTm, setDateDebutTm } from "@/app/actions/roster-rm";
import { currentMonthLabel, MOIS_DE_L_ANNEE } from "@/lib/mois";
import { niveauCalcule } from "@/lib/niveau-mois";
import { repFromKpis } from "@/lib/momento";
import type { RosterTm, TmInfo } from "@/components/ModeRm";
import { Repli } from "@/components/parcours/Repli";
import { CommercialForm } from "@/components/team/CommercialForm";
import { Demarrage } from "@/components/team/Demarrage";
import { GestionCommercial } from "@/components/team/TeamView";
import { Button } from "@/components/ui/Button";

const selectClass = "rounded-[9px] border border-line bg-surface px-2 py-1.5 text-[13px] font-semibold text-ink";

// La fiche du TM : sa date de début (informative : un TM ne monte pas en séniorité, ses objectifs ne changent pas),
// et, s'il a été créé depuis le BI sans login, le renommer ou le retirer.
function FicheTm({ tm, onToast }: { tm: TmInfo; onToast: (message: string) => void }) {
  const courant = currentMonthLabel();
  const [moisNom, setMoisNom] = useState((tm.dateDebut ?? courant).split(" ")[0]);
  const [annee, setAnnee] = useState(Number((tm.dateDebut ?? courant).split(" ")[1]));
  const [nom, setNom] = useState(tm.nom);
  const [erreur, setErreur] = useState("");
  const [pending, startTransition] = useTransition();
  const anneeCourante = Number(courant.split(" ")[1]);
  const annees = Array.from({ length: 6 }, (_, k) => anneeCourante - 5 + k);

  function executer(action: () => Promise<{ ok: true } | { ok: false; error: string }>, message: string) {
    setErreur("");
    startTransition(async () => {
      const res = await action();
      if (res.ok) onToast(message);
      else setErreur(res.error);
    });
  }

  return (
    <div className="mb-3 rounded-xl border border-line bg-paper px-3 py-2.5">
      <div className="mb-1.5 text-[12.5px] font-semibold text-muted">
        Date de début de {tm.nom.split(" ")[0]} <span className="font-normal text-faint">(informative : un TM est toujours jugé à fond)</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Mois de début" value={moisNom} onChange={(e) => setMoisNom(e.target.value)} className={selectClass}>
          {MOIS_DE_L_ANNEE.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select aria-label="Année de début" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className={selectClass}>
          {annees.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => executer(() => setDateDebutTm(tm.id, `${moisNom} ${annee}`), `Date de début de ${tm.nom} : ${moisNom.toLowerCase()} ${annee}`)}
          className="rounded-[9px] bg-ink px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
        {tm.dateDebut && (
          <button
            type="button"
            disabled={pending}
            onClick={() => executer(() => setDateDebutTm(tm.id, null), `Date de début de ${tm.nom} effacée`)}
            className="text-[12px] font-semibold text-muted hover:text-ink"
          >
            Effacer
          </button>
        )}
      </div>
      <div className="mt-1 text-[12px] text-faint">
        {tm.dateDebut ? `Actuellement : ${tm.dateDebut.toLowerCase()}.` : "Pas encore renseignée."}
      </div>

      {tm.creeDepuisBi && (
        <div className="mt-3 border-t border-line2 pt-2.5">
          <div className="mb-1.5 text-[12.5px] font-semibold text-muted">TM créé depuis ton BI (sans login)</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              aria-label={`Nom de ${tm.nom}`}
              maxLength={60}
              className="min-w-0 flex-1 rounded-[9px] border border-line bg-field px-2.5 py-1.5 text-[13px]"
            />
            <button
              type="button"
              disabled={pending || !nom.trim() || nom.trim() === tm.nom}
              onClick={() => executer(() => renommerTm(tm.id, nom), `TM renommé : ${nom.trim()}`)}
              className="rounded-[9px] bg-ink px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
            >
              Renommer
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    `Retirer ${tm.nom} de tes TM ?\n\nIl ne sera plus rattaché à toi. Rien n'est supprimé : ses sales, ses 1:1 et le BI restent en base.`,
                  )
                ) {
                  executer(() => retirerTm(tm.id), `${tm.nom} n'est plus rattaché à toi`);
                }
              }}
              className="rounded-[9px] px-2 py-1.5 text-[12px] font-semibold text-muted hover:text-bad"
            >
              Retirer ce TM
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

// Un sales du roster : son niveau d'aujourd'hui (auto-progression depuis son mois de démarrage, comme l'accès TM),
// et, en dépliant, les mêmes réglages que l'accès TM (démarrage, renommer, marquer parti).
function LigneSales({ sales, onToast }: { sales: RosterTm["actifs"][number]; onToast: (message: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const base = { id: sales.id, name: sales.nom, sen: sales.seniorite ?? "", budget: sales.budget, demarrage: sales.demarrage };
  const niveau = niveauCalcule({ demarrage: sales.demarrage, seniorite: sales.seniorite }, currentMonthLabel());
  const rep = repFromKpis(base, undefined, null, niveau);
  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold">{sales.nom}</span>
        <span className="text-[12px] text-muted">
          {niveau ? `${niveau.seniorite} · objectif ${niveau.budget}` : `${sales.seniorite ?? "—"} · objectif ${sales.budget}`}
          {sales.demarrage && ` · démarrage ${sales.demarrage.toLowerCase()}`}
        </span>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          className="rounded-lg px-2 py-1 text-[12px] font-semibold text-accent hover:bg-accent-soft"
        >
          {ouvert ? "Fermer" : "Modifier"}
        </button>
      </div>
      {ouvert && (
        <div className="mt-1 pl-1">
          <Demarrage key={`${sales.seniorite}|${sales.demarrage ?? ""}`} rep={rep} onToast={onToast} />
          <GestionCommercial key={sales.nom} rep={rep} onToast={onToast} />
        </div>
      )}
    </li>
  );
}

// Le roster d'un TM depuis l'accès RM (comme l'onglet Équipe de l'accès TM) : ses sales actifs, ses partis,
// ajouter un sales, et la fiche du TM. Toutes les écritures passent par des fonctions Supabase réservées au RM.
export function RosterEquipeTm({ tm, roster, onToast }: { tm: TmInfo; roster: RosterTm; onToast: (message: string) => void }) {
  const [ajout, setAjout] = useState(false);
  return (
    <Repli
      titre={`Équipe de ${tm.nom.split(" ")[0]} · roster`}
      resume={`${roster.actifs.length} sales actif${roster.actifs.length > 1 ? "s" : ""}${
        roster.partis.length ? ` · ${roster.partis.length} parti${roster.partis.length > 1 ? "s" : ""}` : ""
      }`}
      lien="Gérer l'équipe"
    >
      <FicheTm key={`${tm.nom}|${tm.dateDebut ?? ""}`} tm={tm} onToast={onToast} />
      {roster.actifs.length ? (
        <ul className="divide-y divide-line2">
          {roster.actifs.map((s) => (
            <LigneSales key={s.id} sales={s} onToast={onToast} />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Aucun sales actif dans cette équipe.</p>
      )}
      {roster.partis.length > 0 && (
        <p className="mt-2 text-[12px] text-faint">Partis (exclus des analyses) : {roster.partis.map((p) => p.nom).join(", ")}.</p>
      )}
      <div className="mt-3">
        {ajout ? (
          <CommercialForm
            tmId={tm.id}
            onCreated={(_, nom) => {
              setAjout(false);
              onToast(`Nouveau dans l'équipe de ${tm.nom} : ${nom}`);
            }}
            onCancel={() => setAjout(false)}
          />
        ) : (
          <Button variant="ghost" onClick={() => setAjout(true)}>
            + Ajouter un sales
          </Button>
        )}
      </div>
    </Repli>
  );
}
