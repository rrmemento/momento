import { redirect } from "next/navigation";
import { AccountNotConfigured } from "@/components/AccountNotConfigured";
import { MomentoApp } from "@/components/MomentoApp";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { getKpisDuMois } from "@/lib/kpis-mensuels";
import { getCurrentManager, getCurrentUser, initials } from "@/lib/managers";
import { currentMonthLabel } from "@/lib/mois";
import { repFromKpis } from "@/lib/momento";

export default async function Home() {
  // Double vérification côté serveur, en plus du proxy.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const manager = await getCurrentManager();
  if (!manager) return <AccountNotConfigured email={user.email} />;

  const month = currentMonthLabel();
  const [commerciaux, kpis] = await Promise.all([getMyCommerciaux(), getKpisDuMois(month)]);
  // Chaque commercial = sa fiche (nom, séniorité, budget) + ses chiffres du mois → analyse MOMENTO.
  const reps = commerciaux.map((c) =>
    repFromKpis({ id: c.id, name: c.nom, sen: c.seniorite ?? "", budget: c.budget }, kpis[c.id]),
  );

  const profile = { nom: manager.nom, equipe: manager.equipe, initials: initials(manager.nom) };
  return <MomentoApp data={{ [month]: reps }} months={[month]} kpis={{ [month]: kpis }} manager={profile} />;
}
