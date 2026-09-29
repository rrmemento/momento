import { redirect } from "next/navigation";
import { AccountNotConfigured } from "@/components/AccountNotConfigured";
import { MomentoApp } from "@/components/MomentoApp";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { getEntretiens } from "@/lib/entretiens";
import { getHistoriqueKpis, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { getCurrentManager, getCurrentUser, initials } from "@/lib/managers";
import { currentMonthLabel, moisDuRang, previousMonthLabel, rangMois } from "@/lib/mois";
import { repFromKpis } from "@/lib/momento";
import { niveauxDeLEquipe } from "@/lib/niveau-mois";

export default async function Home() {
  // Double vérification côté serveur, en plus du proxy.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const manager = await getCurrentManager();
  if (!manager) return <AccountNotConfigured email={user.email} />;

  const [commerciaux, historique, speciaux] = await Promise.all([
    getMyCommerciaux(),
    getHistoriqueKpis(), // tous les chiffres de l'équipe, tous les mois
    getMoisSpeciaux(), // mois particuliers (congés…) : objectif ajusté
  ]);

  // Les mois proposés : les 12 derniers mois + le mois courant, et tout mois plus ancien déjà rempli
  // (pour importer ou saisir l'historique). Du plus ancien au plus récent ; jamais de mois futur.
  const courant = currentMonthLabel();
  const rangCourant = rangMois(courant)!;
  const recents = Array.from({ length: 13 }, (_, k) => moisDuRang(rangCourant - 12 + k));
  const remplis = Object.keys(historique).filter((m) => (rangMois(m) ?? Infinity) <= rangCourant);
  const months = [...new Set([...recents, ...remplis])].sort((a, b) => rangMois(a)! - rangMois(b)!);
  // À l'ouverture : le mois le plus récent qui a des chiffres, sinon le mois courant.
  const aDesChiffres = (m: string) =>
    Object.values(historique[m] ?? {}).some((d) => Object.values(d).some((v) => v != null));
  const moisParDefaut = [...months].reverse().find(aDesChiffres) ?? courant;

  // Les 1:1 des mois affichés et de tout l'historique, chacun avec le mois d'avant :
  // les engagements d'un mois se jugent sur les chiffres du mois suivant (rappel du 1:1, taux de tenue).
  const moisEntretiens = [...new Set(months.flatMap((m) => [previousMonthLabel(m), m]))];
  const entretiens = await getEntretiens(moisEntretiens);
  // Le niveau (M1 / M2 / M3+) et le budget de chaque mois, calculés depuis le mois de démarrage de chaque fiche.
  const niveaux = niveauxDeLEquipe(commerciaux, months);
  // Chaque commercial = sa fiche (nom, séniorité, budget) + ses chiffres du mois → analyse MOMENTO.
  const data = Object.fromEntries(
    months.map((m) => [
      m,
      commerciaux.map((c) =>
        repFromKpis(
          { id: c.id, name: c.nom, sen: c.seniorite ?? "", budget: c.budget, demarrage: c.demarrage },
          historique[m]?.[c.id],
          speciaux[m]?.[c.id],
          niveaux[m]?.[c.id],
        ),
      ),
    ]),
  );
  const kpis = Object.fromEntries(months.map((m) => [m, historique[m] ?? {}]));

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
