// Lecture côté serveur des chiffres du mois (table « kpis_mensuels »).
import "server-only";
import { cache } from "react";
import { getMyCommerciaux } from "@/lib/commerciaux";
import { cleanDonnees, type KpiDonnees } from "@/lib/kpis";
import { lireMoisSpecial, type MoisSpeciaux } from "@/lib/mois-special";
import { createClient } from "@/lib/supabase/server";

// Les KPIs du mois pour les commerciaux du manager connecté : { idCommercial: donnees }.
export const getKpisDuMois = cache(async (mois: string): Promise<Record<string, KpiDonnees>> => {
  const commerciaux = await getMyCommerciaux();
  if (commerciaux.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kpis_mensuels")
    .select("commercial_id, donnees")
    .eq("mois", mois)
    .in(
      "commercial_id",
      commerciaux.map((c) => c.id),
    );

  if (error) throw new Error(`Lecture des chiffres du mois impossible : ${error.message}`);
  return Object.fromEntries(data.map((row) => [String(row.commercial_id), cleanDonnees(row.donnees)]));
});

type Ligne = { commercialId: string; mois: string; donnees: Record<string, unknown> };

// Toutes les lignes de chiffres des commerciaux donnés (tous les mois).
async function lireLignes(ids: string[]): Promise<Ligne[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kpis_mensuels")
    .select("commercial_id, mois, donnees")
    .in("commercial_id", ids);
  if (error) throw new Error(`Lecture de l'historique des chiffres impossible : ${error.message}`);
  return data.map((row) => ({
    commercialId: String(row.commercial_id),
    mois: row.mois,
    donnees: row.donnees && typeof row.donnees === "object" ? (row.donnees as Record<string, unknown>) : {},
  }));
}

// Toutes les lignes de chiffres de l'équipe (tous les mois), lues UNE fois par requête : la source de l'historique,
// et des mois particuliers (donnees.special).
const lignesDeLEquipe = cache(async (): Promise<Ligne[]> => {
  const commerciaux = await getMyCommerciaux();
  return lireLignes(commerciaux.map((c) => c.id));
});

// Rangement { mois: { idCommercial: valeur } } des lignes pour lesquelles `lire` renvoie quelque chose.
function parMois<T>(lignes: Ligne[], lire: (donnees: Record<string, unknown>) => T | null) {
  const resultat: Record<string, Record<string, T>> = {};
  for (const l of lignes) {
    const valeur = lire(l.donnees);
    if (valeur != null) (resultat[l.mois] ??= {})[l.commercialId] = valeur;
  }
  return resultat;
}

// Tout l'historique des chiffres de l'équipe : { mois: { idCommercial: donnees } }.
export const getHistoriqueKpis = cache(
  async (): Promise<Record<string, Record<string, KpiDonnees>>> => parMois(await lignesDeLEquipe(), (d) => cleanDonnees(d)),
);

// Les mois particuliers (congés, arrêt, ramp-up…), rangés dans donnees.special.
export const getMoisSpeciaux = cache(
  async (): Promise<MoisSpeciaux> => parMois(await lignesDeLEquipe(), (d) => lireMoisSpecial(d.special)),
);
