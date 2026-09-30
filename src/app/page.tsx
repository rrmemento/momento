import { redirect } from "next/navigation";
import { AccountNotConfigured } from "@/components/AccountNotConfigured";
import { MomentoApp } from "@/components/MomentoApp";
import { type Commercial, getCommerciauxDesTM, getMyCommerciaux } from "@/lib/commerciaux";
import { construireEquipe } from "@/lib/equipe";
import { getEntretiens } from "@/lib/entretiens";
import type { KpiDonnees } from "@/lib/kpis";
import { getHistoriqueDe, getHistoriqueKpis, getMoisSpeciaux } from "@/lib/kpis-mensuels";
import { getCurrentManager, getCurrentUser, getMesTM, initials, type Manager } from "@/lib/managers";
import { statutEquipe } from "@/lib/statut-equipe";
import type { OneOnOne } from "@/lib/types";

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
// Un TM n'a pas encore ses propres chiffres (import de son BI : étape suivante) : aucun chiffre inventé,
// ses fiches affichent « En attente de l'import du BI ». Son statut dans l'onglet Équipe = celui de son équipe,
// calculé sur les chiffres déjà présents de ses commerciaux.
async function AppRm({ rm }: { rm: Manager }) {
  const tms = await getMesTM();
  const commerciaux = await getCommerciauxDesTM(tms.map((t) => t.id));
  const { historique, speciaux } = await getHistoriqueDe(commerciaux.map((c) => c.id));

  // Chaque TM représenté comme une « personne » de l'app, sans chiffres (pas de niveau ni de budget de commercial).
  const personnes: Commercial[] = tms.map((t) => ({ id: t.id, nom: t.nom, seniorite: null, budget: 0, demarrage: null }));
  // Les mois : ceux où ses équipes ont des chiffres (pour ouvrir sur le plus récent), sans rattacher ces chiffres aux TM.
  const { months, moisParDefaut, moisEntretiens, niveaux, data } = construireEquipe(personnes, historique, speciaux);

  // Le statut de chaque TM, mois par mois = le pace cumulé de ses commerciaux.
  const equipes = tms.map((t) => ({
    tm: t,
    data: construireEquipe(
      commerciaux.filter((c) => c.managerId === t.id),
      historique,
      speciaux,
    ).data,
  }));
  const statutsEquipe = Object.fromEntries(
    months.map((m) => [m, Object.fromEntries(equipes.map((e) => [e.tm.id, statutEquipe(e.data[m] ?? [])]))]),
  );

  // Aucun chiffre ni fiche 1:1 propre aux TM pour l'instant.
  const vides = <T,>(liste: string[]) => Object.fromEntries(liste.map((m) => [m, {} as Record<string, T>]));
  return (
    <MomentoApp
      data={data}
      months={months}
      moisParDefaut={moisParDefaut}
      kpis={vides<KpiDonnees>(months)}
      historique={{}}
      speciaux={{}}
      niveaux={niveaux}
      entretiens={vides<OneOnOne>(moisEntretiens)}
      manager={{ nom: rm.nom, equipe: rm.equipe, initials: initials(rm.nom) }}
      statutsEquipe={statutsEquipe}
    />
  );
}
