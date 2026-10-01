"use client";

import { useState, useTransition } from "react";
import { type BilanCreation, creerEquipesBiRm, reconnaitreBiRm, saveBiRm } from "@/app/actions/bi-rm";
import { TAILLE_MAX_IMAGE, TYPES_IMAGE } from "@/lib/lecture-bi";
import {
  CAPTURES_BI_RM,
  type LectureBiRmReponse,
  type LigneReconnue,
  NIVEAUX_SALES,
  type NiveauSales,
  niveauPropose,
} from "@/lib/lecture-bi-rm";
import { formatJour } from "@/lib/mois";
import { demarragePropose } from "@/lib/niveau-mois";
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
    l.etat === "a_creer"
      ? { texte: l.niveau === "tm" ? "nouveau TM · à créer" : "nouveau sales · à créer", ton: "bg-accent-soft text-accent" }
      : l.etat === "parti"
        ? { texte: "parti · exclu", ton: "bg-paper text-muted border border-line" }
        : l.etat === "ignore"
          ? { texte: "illisible · non enregistré", ton: "bg-bad-soft text-bad" }
          : null;
  return (
    <li className={`flex flex-col gap-0.5 py-2 ${retrait ? "pl-4" : ""} ${l.etat === "parti" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[13.5px] ${l.niveau === "sales" ? "font-medium" : "font-bold"}`}>{l.nom || "(sans nom)"}</span>
        {badge && <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${badge.ton}`}>{badge.texte}</span>}
      </div>
      <Chiffres l={l} />
    </li>
  );
}

type Bloc = { tete: LigneReconnue; sales: LigneReconnue[] };

// Les lignes dans l'ordre du BI → la synthèse Région, puis chaque TM avec ses sales.
function grouper(lignes: LigneReconnue[]) {
  const blocs: Bloc[] = [];
  const region: LigneReconnue[] = [];
  for (const l of lignes) {
    if (l.niveau === "region") region.push(l);
    else if (l.niveau === "tm") blocs.push({ tete: l, sales: [] });
    else blocs.at(-1)?.sales.push(l);
  }
  return { region, blocs };
}

// La vérification : la synthèse Région, puis chaque TM avec ses sales en dessous.
function Verification({ lignes }: { lignes: LigneReconnue[] }) {
  const { region, blocs } = grouper(lignes);
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
            b.tete.etat === "a_creer" ? "border-accent/40" : "border-line"
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

// Niveau et budget choisis pour un nouveau sales (par rang de ligne).
type Choix = Record<number, NiveauSales>;

// Ce qui est à créer : les TM inconnus (avec leurs sales) et les sales inconnus sous un TM connu.
function aCreer(lignes: LigneReconnue[]) {
  const { region, blocs } = grouper(lignes);
  const equipes = blocs
    .map((b) => ({ bloc: b, nouveaux: b.sales.filter((s) => s.etat === "a_creer") }))
    .filter(({ bloc, nouveaux }) => bloc.tete.etat === "a_creer" || nouveaux.length > 0);
  return { equipes, region: region[0]?.nom || null };
}

// Une ligne de sales à créer : son niveau et son budget PROPOSÉS, modifiables avant la création.
function SalesACreer({ s, choix, onChoix }: { s: LigneReconnue; choix: NiveauSales | undefined; onChoix: (n: NiveauSales) => void }) {
  const propose = niveauPropose(s.donnees.objectif);
  const actuel = choix ?? propose;
  const selectClass = "rounded-[9px] border border-line bg-surface px-2 py-1 text-[12.5px] font-semibold text-ink";
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1 text-[13px] font-medium">{s.nom}</span>
      <span className="text-[11.5px] text-faint">Sales Budget du BI : {nb(s.donnees.objectif)}</span>
      <select
        aria-label={`Niveau de ${s.nom}`}
        value={actuel.seniorite}
        onChange={(e) => onChoix(NIVEAUX_SALES.find((n) => n.seniorite === e.target.value) ?? actuel)}
        className={selectClass}
      >
        {NIVEAUX_SALES.map((n) => (
          <option key={n.seniorite}>{n.seniorite}</option>
        ))}
      </select>
      <select
        aria-label={`Budget de ${s.nom}`}
        value={actuel.budget}
        onChange={(e) => onChoix({ ...actuel, budget: Number(e.target.value) } as NiveauSales)}
        className={selectClass}
      >
        {NIVEAUX_SALES.map((n) => (
          <option key={n.budget} value={n.budget}>
            budget {n.budget}
          </option>
        ))}
      </select>
      {propose.aVerifier && !choix && (
        <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-bold text-warn">à vérifier</span>
      )}
    </li>
  );
}

// La confirmation : rien n'est créé sans le clic sur « Créer et rattacher à moi ».
function Confirmation({
  lignes,
  choix,
  onChoix,
  onCreer,
  enCours,
}: {
  lignes: LigneReconnue[];
  choix: Choix;
  onChoix: (rang: number, n: NiveauSales) => void;
  onCreer: () => void;
  enCours: boolean;
}) {
  const { equipes } = aCreer(lignes);
  if (!equipes.length) return null;
  const nouveauxTm = equipes.filter((e) => e.bloc.tete.etat === "a_creer").map((e) => e.bloc.tete.nom);
  const nouveauxSales = equipes.flatMap((e) => e.nouveaux.map((s) => s.nom));
  const liste = (noms: string[]) => (noms.length ? ` (${noms.join(", ")})` : "");
  return (
    <section className="mb-4 rounded-2xl border border-accent/40 bg-accent-soft/40 p-3.5">
      <h3 className="mb-1 text-[15px] font-bold">
        À créer : {nouveauxTm.length} TM{liste(nouveauxTm)}, {nouveauxSales.length} sales{liste(nouveauxSales)}
      </h3>
      <p className="mb-3 text-[12px] text-muted">
        Les nouveaux TM sont créés sans login et rattachés à toi ; leurs sales sont créés dans leur équipe. Vérifie le
        niveau et le budget proposés de chaque sales. Aucun doublon : un nom déjà existant est réutilisé ou signalé.
      </p>
      <div className="mb-3 flex flex-col gap-2">
        {equipes.map(({ bloc, nouveaux }) => (
          <div key={bloc.tete.rang} className="rounded-xl border border-line bg-surface px-3 py-2">
            <div className="text-[13px] font-bold">
              {bloc.tete.etat === "a_creer" ? `Nouveau TM : ${bloc.tete.nom}` : `Nouveaux sales chez ${bloc.tete.nom}`}
            </div>
            {nouveaux.length ? (
              <ul className="divide-y divide-line2">
                {nouveaux.map((s) => (
                  <SalesACreer key={s.rang} s={s} choix={choix[s.rang]} onChoix={(n) => onChoix(s.rang, n)} />
                ))}
              </ul>
            ) : (
              <div className="py-1 text-[12px] text-faint">Aucun sales lu sous ce TM.</div>
            )}
          </div>
        ))}
      </div>
      <Button onClick={onCreer} disabled={enCours} className="disabled:opacity-60">
        {enCours ? "Création…" : "Créer et rattacher à moi"}
      </Button>
    </section>
  );
}

// Le bilan renvoyé par Supabase après la création.
function Bilan({ bilan }: { bilan: BilanCreation }) {
  const liste = (noms: string[]) => (noms.length ? ` : ${noms.join(", ")}` : "");
  return (
    <div role="status" className="mb-4 rounded-2xl border border-good-line bg-good-soft px-3.5 py-3 text-[13px]">
      <div className="font-bold text-good">Création terminée ✓</div>
      <ul className="mt-1 flex flex-col gap-0.5 text-ink2">
        <li>
          {bilan.tmCrees.length} TM créé{bilan.tmCrees.length > 1 ? "s" : ""}
          {liste(bilan.tmCrees)} · {bilan.tmExistants} déjà existant{bilan.tmExistants > 1 ? "s" : ""}
        </li>
        <li>
          {bilan.salesCrees.length} sales créé{bilan.salesCrees.length > 1 ? "s" : ""}
          {liste(bilan.salesCrees)} · {bilan.salesExistants} déjà existant{bilan.salesExistants > 1 ? "s" : ""}
        </li>
      </ul>
      {bilan.signales.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-[12.5px] text-warn">
          {bilan.signales.map((s, k) => (
            <li key={k}>⚠ {s}</li>
          ))}
        </ul>
      )}
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
  const [creation, startCreation] = useTransition();
  const [choix, setChoix] = useState<Choix>({}); // niveau / budget modifiés des sales à créer
  const [bilan, setBilan] = useState<BilanCreation | null>(null);

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
    setBilan(null);
    setChoix({});
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

  // « Créer et rattacher à moi » : SEUL déclencheur de création. Puis les lignes sont reconnues de nouveau
  // avec les fiches créées (sans relire les captures), prêtes à « Enregistrer le BI ».
  function creer() {
    if (!lignes) return;
    const { equipes, region } = aCreer(lignes);
    setError("");
    startCreation(async () => {
      const res = await creerEquipesBiRm(
        equipes.map(({ bloc, nouveaux }) => ({
          tmId: bloc.tete.etat === "a_creer" ? null : bloc.tete.tmId,
          tmNom: bloc.tete.nom,
          region,
          sales: nouveaux.map((s) => {
            const n = choix[s.rang] ?? niveauPropose(s.donnees.objectif);
            // Mois de démarrage proposé d'après le niveau (M1 : ce mois, M2 : le mois dernier), modifiable ensuite.
            return { nom: s.nom, seniorite: n.seniorite, budget: n.budget, demarrage: demarragePropose(n.seniorite) };
          }),
        })),
      ).catch(() => ({ ok: false as const, error: "Connexion impossible, rien n'a été créé." }));
      if (!res.ok) return setError(res.error);
      setBilan(res.bilan);
      setChoix({});
      const relues = await reconnaitreBiRm(lignes).catch(() => null);
      if (relues) setLignes(relues);
      else setError("Création faite, mais la relecture a échoué : relance l'analyse des captures.");
    });
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
  const nbACreer = lignes?.filter((l) => l.etat === "a_creer").length ?? 0;
  const nbPartis = lignes?.filter((l) => l.etat === "parti").length ?? 0;
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
          et {modeRm.resume.sales} sales. Un nouvel import ne remplace que les équipes qu&apos;il contient : les autres
          équipes de ce mois sont gardées.
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
            {nbACreer > 0 && ` · ${nbACreer} fiche${nbACreer > 1 ? "s" : ""} à créer`}
            {nbPartis > 0 && ` · ${nbPartis} sales parti${nbPartis > 1 ? "s" : ""} (exclu${nbPartis > 1 ? "s" : ""})`}
            {nbIgnores > 0 && ` · ${nbIgnores} ligne${nbIgnores > 1 ? "s" : ""} illisible${nbIgnores > 1 ? "s" : ""} (non enregistrée${nbIgnores > 1 ? "s" : ""})`}
          </p>
          <Verification lignes={lignes} />
          {bilan && <Bilan bilan={bilan} />}
          <Confirmation
            lignes={lignes}
            choix={choix}
            onChoix={(rang, n) => setChoix((prev) => ({ ...prev, [rang]: n }))}
            onCreer={creer}
            enCours={creation}
          />
          <div className="flex flex-col gap-2">
            {nbACreer > 0 && (
              <p className="text-center text-[12px] text-faint">
                Sans création, les nouveaux TM ne sont pas enregistrés, et les nouveaux sales le sont sans rattachement.
              </p>
            )}
            <Button onClick={enregistrer} disabled={enregistrement || creation || nbTm === 0} className="disabled:opacity-60">
              {enregistrement ? "Enregistrement…" : `Enregistrer le BI de ${month.toLowerCase()}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setLignes(null);
                setBilan(null);
                setChoix({});
              }}
              disabled={enregistrement || creation}
            >
              Annuler
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
