import { redirect } from "next/navigation";
import { AccountNotConfigured } from "@/components/AccountNotConfigured";
import { MomentoApp } from "@/components/MomentoApp";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { getKpisDuMois } from "@/lib/kpis-mensuels";
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
  const [commerciaux, kpisParMois] = await Promise.all([
    getMyCommerciaux(),
    Promise.all(months.map((m) => getKpisDuMois(m))),
  ]);
  // Chaque commercial = sa fiche (nom, séniorité, budget) + ses chiffres du mois → analyse MOMENTO.
  const data = Object.fromEntries(
    months.map((m, i) => [
      m,
      commerciaux.map((c) =>
        repFromKpis({ id: c.id, name: c.nom, sen: c.seniorite ?? "", budget: c.budget }, kpisParMois[i][c.id]),
      ),
    ]),
  );
  const kpis = Object.fromEntries(months.map((m, i) => [m, kpisParMois[i]]));

  const profile = { nom: manager.nom, equipe: manager.equipe, initials: initials(manager.nom) };
  return <MomentoApp data={data} months={months} kpis={kpis} manager={profile} />;
}
