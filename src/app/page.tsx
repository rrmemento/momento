import { redirect } from "next/navigation";
import { AccountNotConfigured } from "@/components/AccountNotConfigured";
import { MomentoApp } from "@/components/MomentoApp";
import { getBiRm, getEntretiensTm } from "@/lib/bi-rm";
import { type Commercial, getCommerciauxDesTM, getMyCommerciaux, getPartisDesTM } from "@/lib/commerciaux";
import { construireEquipe } from "@/lib/equipe";
import { getEntretiens } from "@/lib/entretiens";
import { getHistoriqueKpis, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { kpisDuBi } from "@/lib/lecture-bi-rm";
import { getCurrentManager, getCurrentUser, getMesTM, initials, type Manager } from "@/lib/managers";
import { repFromKpis } from "@/lib/momento";
import { PACE_CIBLE } from "@/lib/objectifs-equipe";

export default async function Home() {
  // Double vérification côté serveur, en plus du proxy.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const manager = await getCurrentManager();
  if (!manager) return <AccountNotConfigured email={user.email} />;

  // RM : la même app, peuplée avec ses TM (lus via rm_tms). Un TM ne passe jamais par ici.
  if (manager.role === "RM") {
    return <AppRm rm={manager} />;
  }

  const [commerciaux, historique, speciaux] = await Promise.all([
    getMyCommerciaux(),
    getHistoriqueKpis(), // tous les chiffres de l'équipe, tous les mois
    getMoisSpeciaux(), // mois particuliers (congés…) : objectif ajusté
  ]);
  const { months, moisParDefaut, moisEntretiens, niveaux, data, kpis } = construireEquipe(commerciaux, historique, speciaux);
  const entretiens = await getEntretiens(moisEntretiens);

  const profile = { nom: manager.nom, equipe: manager.equipe, initials: initials(manager.nom) };
  return (
    <MomentoApp
      data={data}
      months={months}
      moisParDefaut={moisParDefaut}
      kpis={kpis}
      historique={historique}
      speciaux={speciaux}
      niveaux={niveaux}
      entretiens={entretiens}
      manager={profile}
    />
  );
}

// Vue RM : la même app qu'un TM (mêmes onglets, mêmes écrans), mais les « personnes » sont ses TM.
// Les chiffres d'un TM = SA ligne agrégée « tm » du BI importé par le RM (table séparée : les chiffres saisis
// par les TM ne sont jamais mélangés). Sans BI importé pour ce mois : « En attente de l'import du BI », aucun chiffre inventé.
async function AppRm({ rm }: { rm: Manager }) {
  const [tms, { parTm, salesParTm, effectifParTm, resumes }] = await Promise.all([getMesTM(), getBiRm()]);
  // Le roster de chaque TM (vraies fiches commerciaux) : actifs et partis. Sert à la gestion depuis l'accès RM et aux
  // objectifs d'équipe (objectifs d'équipe : l'effectif du BI du mois, voir ModeRm.effectifEquipe).
  const [actifs, partis] = await Promise.all([getCommerciauxDesTM(tms.map((t) => t.id)), getPartisDesTM(tms.map((t) => t.id))]);
  const rosterParTm = Object.fromEntries(
    tms.map((t) => [
      t.id,
      {
        actifs: actifs.filter((c) => c.managerId === t.id),
        partis: partis.filter((c) => c.managerId === t.id).map((c) => ({ id: c.id, nom: c.nom })),
      },
    ]),
  );

  // Les KPIs MOMENTO de chaque TM, mois par mois (ventes, installs, pace, POS share…).
  const kpisTm = Object.fromEntries(
    Object.entries(parTm).map(([m, lignes]) => [
      m,
      Object.fromEntries(Object.entries(lignes).map(([tmId, d]) => [tmId, kpisDuBi(d)])),
    ]),
  );
  // Les mois proposés (et celui d'ouverture = le plus récent importé), comme pour un TM.
  const personnes: Commercial[] = tms.map((t) => ({ id: t.id, nom: t.nom, seniorite: null, budget: 0, demarrage: null }));
  const { months, moisParDefaut, moisEntretiens } = construireEquipe(personnes, kpisTm, {});

  // Chaque TM comme une « personne ». Jamais de budget cumulé d'équipe comme objectif (il bouge dès qu'un sales arrive
  // ou part) : le volume d'un TM se juge sur son PACE contre 100 %, POS et OG sur les objectifs d'équipe
  // (lib/objectifs-equipe.ts). Un TM n'a pas de séniorité.
  const data = Object.fromEntries(
    months.map((m) => [m, tms.map((t) => repFromKpis({ id: t.id, name: t.nom, sen: "", budget: 0 }, kpisTm[m]?.[t.id]))]),
  );
  const kpis = Object.fromEntries(months.map((m) => [m, kpisTm[m] ?? {}]));
  // Pour le Parcours : les courbes « ventes » et « installs » d'un TM tracent son PACE (en %) contre un objectif de 100 %,
  // et toutes les règles du Parcours (séries à l'objectif, décrochages…) jugent donc le pace, jamais le budget cumulé.
  const historiqueParcours = Object.fromEntries(
    Object.entries(kpisTm).map(([m, parTmDuMois]) => [
      m,
      Object.fromEntries(
        Object.entries(parTmDuMois).map(([tmId, k]) => [tmId, { ...k, ventes: k.vPace ?? null, install: k.iPace ?? null }]),
      ),
    ]),
  );
  const objectifsTm = Object.fromEntries(
    Object.entries(kpisTm).map(([m, parTmDuMois]) => [
      m,
      Object.fromEntries(Object.keys(parTmDuMois).map((tmId) => [tmId, { seniorite: "M3+" as const, budget: PACE_CIBLE }])),
    ]),
  );
  const entretiens = await getEntretiensTm(moisEntretiens);

  return (
    <MomentoApp
      data={data}
      months={months}
      moisParDefaut={moisParDefaut}
      kpis={kpis}
      historique={historiqueParcours} // Parcours du TM : son pace de chaque mois importé
      speciaux={{}}
      niveaux={objectifsTm} // objectif de chaque mois = 100 % (pace), jamais le Sales Budget cumulé
      entretiens={entretiens}
      manager={{ nom: rm.nom, equipe: rm.equipe, initials: initials(rm.nom) }}
      rm={{
        biParTm: parTm,
        salesParTm,
        effectifParTm,
        resumes,
        rosterParTm,
        tms: tms.map((t) => ({
          id: t.id,
          nom: t.nom,
          dateDebut: t.dateDebut ?? null,
          creeDepuisBi: t.creeParRm != null && t.user_id == null,
        })),
      }}
    />
  );
}
