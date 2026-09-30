"use client";

import { useState, useTransition } from "react";
import { saveBiRm } from "@/app/actions/bi-rm";
import { TAILLE_MAX_IMAGE, TYPES_IMAGE } from "@/lib/lecture-bi";
import { CAPTURES_BI_RM, type LectureBiRmReponse, type LigneReconnue } from "@/lib/lecture-bi-rm";
import { formatJour } from "@/lib/mois";
import { useModeRm } from "@/components/ModeRm";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageTitle } from "@/components/ui/PageTitle";
import { type Capture, DropZone } from "./ImportView";

const nb = (v: number | null | undefined, suffixe = "") => (v == null ? "—" : `${String(v).replace(".", ",")}${suffixe}`);

// Les chiffres clés d'une ligne, pour vérifier la lecture d'un coup d'œil.
function Chiffres({ l }: { l: LigneReconnue }) {
  const d = l.donnees;
  return (
    <span className="text-[12px] text-muted">
      ventes {nb(d.ventes)}/{nb(d.objectif)} · pace {nb(d.vPace, " %")} · installs {nb(d.install)} · pace{" "}
      {nb(d.iPace, " %")} · POS share {nb(d.posShare, " %")}
    </span>
  );
}

function Ligne({ l, retrait = false }: { l: LigneReconnue; retrait?: boolean }) {
  const badge =
    l.etat === "inconnu"
      ? { texte: "nom inconnu · enregistré sans rattachement", ton: "bg-warn-soft text-warn" }
      : l.etat === "ignore"
        ? { texte: "pas un de tes TM · non enregistré", ton: "bg-bad-soft text-bad" }
        : null;
  return (
    <li className={`flex flex-col gap-0.5 py-2 ${retrait ? "pl-4" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[13.5px] ${l.niveau === "sales" ? "font-medium" : "font-bold"}`}>{l.nom || "(sans nom)"}</span>
        {badge && <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${badge.ton}`}>{badge.texte}</span>}
      </div>
      <Chiffres l={l} />
    </li>
  );
}

// La vérification : la synthèse Région, puis chaque TM avec ses sales en dessous.
function Verification({ lignes }: { lignes: LigneReconnue[] }) {
  const blocs: { tete: LigneReconnue; sales: LigneReconnue[] }[] = [];
  const region: LigneReconnue[] = [];
  for (const l of lignes) {
    if (l.niveau === "region") region.push(l);
    else if (l.niveau === "tm") blocs.push({ tete: l, sales: [] });
    else blocs.at(-1)?.sales.push(l);
  }
  return (
    <div className="mb-4 flex flex-col gap-2.5">
      {region.length > 0 && (
        <ul className="rounded-2xl border border-line bg-surface px-3.5 py-1 shadow-card">
          {region.map((l) => (
            <Ligne key={l.rang} l={l} />
          ))}
        </ul>
      )}
      {blocs.map((b) => (
        <ul
          key={b.tete.rang}
          className={`divide-y divide-line2 rounded-2xl border bg-surface px-3.5 py-1 shadow-card ${
            b.tete.etat === "ignore" ? "border-bad-line opacity-70" : "border-line"
          }`}
        >
          <Ligne l={b.tete} />
          {b.sales.map((l) => (
            <Ligne key={l.rang} l={l} retrait />
          ))}
        </ul>
      ))}
    </div>
  );
}

// L'onglet Import du RM : 2 captures du BI (alignées ligne par ligne) → vérification → enregistrement du mois.
export function ImportRmView({ month, onToast }: { month: string; onToast: (message: string) => void }) {
  const modeRm = useModeRm();
  const [captures, setCaptures] = useState<(Capture | null)[]>(CAPTURES_BI_RM.map(() => null));
  const [error, setError] = useState("");
  const [reessayable, setReessayable] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [lignes, setLignes] = useState<LigneReconnue[] | null>(null);
  const [enregistrement, startEnregistrement] = useTransition();

  function setCapture(index: number, file: File) {
    setReessayable(false);
    if (!TYPES_IMAGE.includes(file.type)) return setError(`« ${file.name} » n'est pas une image PNG, JPEG ou WebP.`);
    if (file.size > TAILLE_MAX_IMAGE) return setError(`« ${file.name} » dépasse 5 Mo. Recadre la capture sur le tableau.`);
    setError("");
    const reader = new FileReader();
    reader.onload = () =>
      setCaptures((prev) => prev.map((c, i) => (i === index ? { file, preview: reader.result as string } : c)));
    reader.readAsDataURL(file);
  }

  async function analyser() {
    const manquantes = CAPTURES_BI_RM.filter((_, i) => !captures[i]).map((c) => c.code);
    if (manquantes.length) return setError(`Il manque le screen ${manquantes.join(" et ")}.`);
    setError("");
    setReessayable(false);
    setLignes(null);
    setLecture(true);
    const body = new FormData();
    for (const c of captures) if (c) body.append("images", c.file);
    let reponse: LectureBiRmReponse;
    try {
      const res = await fetch("/api/lecture-bi-rm", { method: "POST", body });
      reponse = ((await res.json().catch(() => null)) as LectureBiRmReponse | null) ?? {
        ok: false,
        error: "Réponse illisible du serveur. Réessaie.",
        reessayable: res.status >= 500,
      };
    } catch {
      reponse = { ok: false, error: "Impossible de joindre le serveur. Vérifie ta connexion.", reessayable: true };
    }
    setLecture(false);
    if (!reponse.ok) {
      setError(reponse.error);
      setReessayable(!!reponse.reessayable);
      return;
    }
    setLignes(reponse.lignes);
  }

  function enregistrer() {
    if (!lignes) return;
    startEnregistrement(async () => {
      const res = await saveBiRm(month, lignes).catch(() => ({
        ok: false as const,
        error: "Connexion impossible, l'import n'a pas été enregistré.",
      }));
      if (!res.ok) return setError(res.error);
      setLignes(null);
      setCaptures(CAPTURES_BI_RM.map(() => null));
      onToast(`BI de ${month.toLowerCase()} enregistré ✓ (${res.nb} lignes)`);
    });
  }

  const count = captures.filter(Boolean).length;
  const nbTm = lignes?.filter((l) => l.niveau === "tm" && l.etat === "ok").length ?? 0;
  const nbInconnus = lignes?.filter((l) => l.etat === "inconnu").length ?? 0;
  const nbIgnores = lignes?.filter((l) => l.etat === "ignore").length ?? 0;

  return (
    <div className="mx-auto max-w-[600px]">
      <PageTitle kicker="Import & chiffres" title="Import du BI RM" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-muted">Ces données concernent</span>
        <span className="rounded-[9px] border border-line px-[11px] py-2 text-[13.5px] font-semibold">{month}</span>
        <span className="text-xs text-faint">change le mois en haut à droite</span>
      </div>

      {modeRm?.resume && (
        <Notice>
          Déjà importé pour {month.toLowerCase()} le {formatJour(modeRm.resume.le.slice(0, 10))} : {modeRm.resume.tm} TM
          et {modeRm.resume.sales} sales. Un nouvel import remplacera celui-ci.
        </Notice>
      )}

      <p className="mb-3 text-[12.5px] text-muted">
        Les 2 captures doivent montrer <b className="font-semibold text-ink2">exactement les mêmes lignes, dans le même
        ordre</b> (Région → TM → sales) : la ligne N de l&apos;une correspond à la ligne N de l&apos;autre.
      </p>

      <div className="mb-4 flex flex-col gap-[11px]">
        {CAPTURES_BI_RM.map((c, i) => (
          <DropZone
            key={c.code}
            code={c.code}
            title={c.titre}
            hint={c.hint}
            capture={captures[i]}
            disabled={lecture || enregistrement}
            onFile={(file) => setCapture(i, file)}
          />
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className={`mb-3 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium ${
            reessayable ? "border-warn-line bg-warn-soft text-warn" : "border-bad-line bg-bad-soft text-bad"
          }`}
        >
          {error}
          {reessayable && " Ce n'est pas de ta faute : c'est passager, réessaie dans un instant."}
        </p>
      )}

      {!lignes && (
        <>
          <Button onClick={analyser} disabled={lecture} className="transition-opacity disabled:opacity-60">
            {lecture ? "Lecture des captures…" : reessayable ? "↻ Réessayer" : "Analyser les captures"}
          </Button>
          <p className="mt-2.5 text-center text-xs text-faint">
            {lecture
              ? "Si Google est chargé, MOMENTO réessaie tout seul : ça peut prendre jusqu'à 3 minutes, ne ferme pas la page."
              : `${count}/${CAPTURES_BI_RM.length} captures chargées`}
          </p>
        </>
      )}

      {lignes && (
        <section className="mt-2">
          <h2 className="mb-1 text-[17px] font-bold">Vérifie la lecture</h2>
          <p className="mb-3 text-[12.5px] text-muted">
            {nbTm} TM reconnu{nbTm > 1 ? "s" : ""}
            {nbInconnus > 0 && ` · ${nbInconnus} nom${nbInconnus > 1 ? "s" : ""} de sales inconnu${nbInconnus > 1 ? "s" : ""}`}
            {nbIgnores > 0 && ` · ${nbIgnores} ligne${nbIgnores > 1 ? "s" : ""} hors de tes TM (non enregistrée${nbIgnores > 1 ? "s" : ""})`}
          </p>
          <Verification lignes={lignes} />
          <div className="flex flex-col gap-2">
            <Button onClick={enregistrer} disabled={enregistrement || nbTm === 0} className="disabled:opacity-60">
              {enregistrement ? "Enregistrement…" : `Enregistrer le BI de ${month.toLowerCase()}`}
            </Button>
            <Button variant="ghost" onClick={() => setLignes(null)} disabled={enregistrement}>
              Annuler
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
