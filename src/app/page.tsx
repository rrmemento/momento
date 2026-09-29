import { redirect } from "next/navigation";
import { AccountNotConfigured } from "@/components/AccountNotConfigured";
import { MomentoApp } from "@/components/MomentoApp";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { getEntretiens } from "@/lib/entretiens";
import { getHistoriqueKpis, getKpisDuMois, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { getCurrentManager, getCurrentUser, initials } from "@/lib/managers";
import { currentMonthLabel, previousMonthLabel } from "@/lib/mois";
import { repFromKpis } from "@/lib/momento";

export default async function Home() {
  // Double vérification côté serveur, en plus du proxy.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const manager = await getCurrentManager();
  if (!manager) return <AccountNotConfigured email={user.email} />;

  // Le mois en cours, et le mois précédent pour pouvoir saisir ou importer le mois clôturé.
  const month = currentMonthLabel();
  const months = [previousMonthLabel(month), month];
  const [commerciaux, kpisParMois, historique, speciaux] = await Promise.all([
    getMyCommerciaux(),
    Promise.all(months.map((m) => getKpisDuMois(m))),
    getHistoriqueKpis(), // tous les mois : onglet Parcours
    getMoisSpeciaux(), // mois particuliers (congés…) : objectif ajusté
  ]);
  // Les 1:1 des mois affichés et de tout l'historique, chacun avec le mois d'avant :
  // les engagements d'un mois se jugent sur les chiffres du mois suivant (rappel du 1:1, taux de tenue).
  const moisEntretiens = [...new Set([...months, ...Object.keys(historique)].flatMap((m) => [previousMonthLabel(m), m]))];
  const entretiens = await getEntretiens(moisEntretiens);
  // Chaque commercial = sa fiche (nom, séniorité, budget) + ses chiffres du mois → analyse MOMENTO.
  const data = Object.fromEntries(
    months.map((m, i) => [
      m,
      commerciaux.map((c) =>
        repFromKpis(
          { id: c.id, name: c.nom, sen: c.seniorite ?? "", budget: c.budget },
          kpisParMois[i][c.id],
          speciaux[m]?.[c.id],
        ),
      ),
    ]),
  );
  const kpis = Object.fromEntries(months.map((m, i) => [m, kpisParMois[i]]));

  const profile = { nom: manager.nom, equipe: manager.equipe, initials: initials(manager.nom) };
  return (
    <MomentoApp
      data={data}
      months={months}
      kpis={kpis}
      historique={historique}
      speciaux={speciaux}
      entretiens={entretiens}
      manager={profile}
    />
  );
}
