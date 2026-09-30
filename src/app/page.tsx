import { redirect } from "next/navigation";
import { AccountNotConfigured } from "@/components/AccountNotConfigured";
import { MomentoApp } from "@/components/MomentoApp";
import { getBiRm, getEntretiensTm } from "@/lib/bi-rm";
import { type Commercial, getMyCommerciaux } from "@/lib/commerciaux";
import { construireEquipe } from "@/lib/equipe";
import { getEntretiens } from "@/lib/entretiens";
import { getHistoriqueKpis, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { kpisDuBi } from "@/lib/lecture-bi-rm";
import { getCurrentManager, getCurrentUser, getMesTM, initials, type Manager } from "@/lib/managers";
import { repFromKpis } from "@/lib/momento";

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
  const [tms, { parTm, salesParTm, resumes }] = await Promise.all([getMesTM(), getBiRm()]);

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

  // Chaque TM comme une « personne » : son objectif du mois = le « Sales Budget » de sa ligne du BI.
  const data = Object.fromEntries(
    months.map((m) => [
      m,
      tms.map((t) =>
        repFromKpis(
          { id: t.id, name: t.nom, sen: "", budget: parTm[m]?.[t.id]?.objectif ?? 0 },
          kpisTm[m]?.[t.id],
        ),
      ),
    ]),
  );
  const kpis = Object.fromEntries(months.map((m) => [m, kpisTm[m] ?? {}]));
  // Pour le Parcours : l'objectif de chaque mois importé = le « Sales Budget » de la ligne du TM ce mois-là.
  const objectifsTm = Object.fromEntries(
    Object.entries(parTm).map(([m, lignes]) => [
      m,
      Object.fromEntries(
        Object.entries(lignes).flatMap(([tmId, d]) =>
          d.objectif != null ? [[tmId, { seniorite: "M3+" as const, budget: d.objectif }]] : [],
        ),
      ),
    ]),
  );
  const entretiens = await getEntretiensTm(moisEntretiens);

  return (
    <MomentoApp
      data={data}
      months={months}
      moisParDefaut={moisParDefaut}
      kpis={kpis}
      historique={kpisTm} // Parcours du TM : ses lignes « tm » de tous les mois importés
      speciaux={{}}
      niveaux={objectifsTm} // objectif de chaque mois = son « Sales Budget » du BI
      entretiens={entretiens}
      manager={{ nom: rm.nom, equipe: rm.equipe, initials: initials(rm.nom) }}
      rm={{ biParTm: parTm, salesParTm, resumes, tms: tms.map((t) => ({ id: t.id, nom: t.nom })) }}
    />
  );
}
