// Vue RM, côté serveur : le BI importé par le RM (table bi_rm_lignes) et ses 1:1 avec ses TM (entretiens_tm).
// La RLS ne laisse lire que les lignes du RM connecté, pour ses propres TM.
import "server-only";
import { normaliserEntretien } from "@/lib/entretien-contenu";
import { associerLignes } from "@/lib/lecture-bi";
import { type DonneesBiRm, nettoyerDonnees } from "@/lib/lecture-bi-rm";
import { getCurrentManager, getMesTM } from "@/lib/managers";
import { rangMois } from "@/lib/mois";
import { createClient } from "@/lib/supabase/server";
import type { OneOnOne } from "@/lib/types";

// Ce qui a été importé pour un mois (affiché dans l'onglet Import).
export type ResumeImportRm = { tm: number; sales: number; le: string };

// Une ligne « sales » du BI RM, pour la vue RM (lecture seule) : son rang sert d'identifiant.
export type SalesBi = { rang: number; nom: string; donnees: DonneesBiRm; rattache: boolean };

// Tout le BI importé par le RM : les lignes agrégées « tm » { mois: { tmId: chiffres } }, les sales de chaque TM
// { mois: { tmId: sales[] } } dans l'ordre du BI, et le résumé de chaque mois importé.
export async function getBiRm(): Promise<{
  parTm: Record<string, Record<string, DonneesBiRm>>;
  salesParTm: Record<string, Record<string, SalesBi[]>>;
  resumes: Record<string, ResumeImportRm>;
}> {
  const supabase = await createClient();
  const moi = await getCurrentManager();
  if (moi?.role !== "RM") return { parTm: {}, salesParTm: {}, resumes: {} };
  // Filtre rm_id en plus de la RLS : on ne lit que son propre import.
  const { data, error } = await supabase
    .from("bi_rm_lignes")
    .select("mois, rang, niveau, tm_id, commercial_id, nom, donnees, importe_le")
    .eq("rm_id", moi.id)
    .order("rang");
  if (error) throw new Error(`Lecture du BI RM impossible : ${error.message}`);

  // Les sales partis (actif = false) ne sont jamais montrés ni analysés.
  const estParti = await testSalesPartis([...new Set(data.flatMap((l) => (l.tm_id != null ? [String(l.tm_id)] : [])))]);
  const parTm: Record<string, Record<string, DonneesBiRm>> = {};
  const salesParTm: Record<string, Record<string, SalesBi[]>> = {};
  const resumes: Record<string, ResumeImportRm> = {};
  for (const l of data) {
    const r = (resumes[l.mois] ??= { tm: 0, sales: 0, le: l.importe_le });
    if (l.niveau === "tm" && l.tm_id != null) {
      (parTm[l.mois] ??= {})[String(l.tm_id)] = nettoyerDonnees(l.donnees);
      r.tm += 1;
    } else if (l.niveau === "sales" && l.tm_id != null && !estParti(String(l.tm_id), l.commercial_id, l.nom)) {
      ((salesParTm[l.mois] ??= {})[String(l.tm_id)] ??= []).push({
        rang: l.rang,
        nom: l.nom,
        donnees: nettoyerDonnees(l.donnees),
        rattache: l.commercial_id != null,
      });
      r.sales += 1;
    }
  }
  return { parTm, salesParTm, resumes };
}

// Les 1:1 du RM avec ses TM, pour les mois demandés : { mois: { tmId: fiche } }.
export async function getEntretiensTm(mois: string[]): Promise<Record<string, Record<string, OneOnOne>>> {
  const parMois: Record<string, Record<string, OneOnOne>> = Object.fromEntries(mois.map((m) => [m, {}]));
  const tms = await getMesTM();
  if (tms.length === 0) return parMois;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entretiens_tm")
    .select("tm_id, mois, contenu")
    .in("mois", mois)
    .in(
      "tm_id",
      tms.map((t) => t.id),
    );
  if (error) throw new Error(`Lecture des 1:1 des TM impossible : ${error.message}`);
  for (const row of data) parMois[row.mois][String(row.tm_id)] = normaliserEntretien(row.contenu);
  return parMois;
}

// Une ligne du BI RM telle qu'envoyée à l'analyse : le nom lu et tous ses chiffres bruts.
export type LigneBiAnalyse = { nom: string; donnees: DonneesBiRm; rattache: boolean; rang?: number };

// Le BI d'un TM pour un mois : sa ligne agrégée « tm » et le détail de TOUS ses sales, dans l'ordre du BI.
export async function getBiDuTm(
  tmId: string,
  mois: string,
): Promise<{ tm: LigneBiAnalyse | null; sales: LigneBiAnalyse[] }> {
  const moi = await getCurrentManager();
  if (moi?.role !== "RM") return { tm: null, sales: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bi_rm_lignes")
    .select("niveau, nom, commercial_id, donnees, rang")
    .eq("rm_id", moi.id)
    .eq("tm_id", tmId)
    .eq("mois", mois)
    .order("rang");
  if (error) throw new Error(`Lecture du BI du TM impossible : ${error.message}`);

  const ligne = (l: (typeof data)[number]): LigneBiAnalyse => ({
    nom: l.nom,
    donnees: nettoyerDonnees(l.donnees),
    rattache: l.commercial_id != null,
    rang: l.rang,
  });
  const tm = data.find((l) => l.niveau === "tm");
  // Les sales partis (actif = false) ne sont jamais envoyés à l'IA.
  const estParti = await testSalesPartis([tmId]);
  return {
    tm: tm ? ligne(tm) : null,
    sales: data.filter((l) => l.niveau === "sales" && !estParti(tmId, l.commercial_id, l.nom)).map(ligne),
  };
}

// Le parcours d'un TM : sa ligne agrégée « tm » de chaque mois importé { mois: chiffres }, et ses sales du mois le plus récent.
export async function getParcoursBiDuTm(
  tmId: string,
): Promise<{ parMois: Record<string, DonneesBiRm>; salesDernierMois: LigneBiAnalyse[]; dernierMois: string | null }> {
  const moi = await getCurrentManager();
  if (moi?.role !== "RM") return { parMois: {}, salesDernierMois: [], dernierMois: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bi_rm_lignes")
    .select("mois, niveau, nom, commercial_id, donnees, rang")
    .eq("rm_id", moi.id)
    .eq("tm_id", tmId)
    .order("rang");
  if (error) throw new Error(`Lecture du parcours du TM impossible : ${error.message}`);

  const estParti = await testSalesPartis([tmId]); // les sales partis ne sont jamais envoyés à l'IA
  const parMois: Record<string, DonneesBiRm> = {};
  for (const l of data) if (l.niveau === "tm") parMois[l.mois] = nettoyerDonnees(l.donnees);
  const dernierMois = Object.keys(parMois).sort((a, b) => (rangMois(a) ?? 0) - (rangMois(b) ?? 0)).at(-1) ?? null;
  const salesDernierMois = data
    .filter((l) => l.niveau === "sales" && l.mois === dernierMois && !estParti(tmId, l.commercial_id, l.nom))
    .map((l) => ({ nom: l.nom, donnees: nettoyerDonnees(l.donnees), rattache: l.commercial_id != null }));
  return { parMois, salesDernierMois, dernierMois };
}

// ——— Sales partis (actif = false) : exclus de toute la vue RM (analyse, coaching, sujets, « Les sales de … ») ———

// Renvoie un test « ce sales du BI est-il parti ? » pour les TM donnés. Un sales est parti si sa ligne est rattachée
// à un commercial inactif, ou, si elle n'est pas rattachée (nom inconnu à l'import, car les inactifs ne sont pas
// proposés), si son nom correspond à un seul commercial inactif de ce TM et à aucun actif.
async function testSalesPartis(tmIds: string[]) {
  if (tmIds.length === 0) return () => false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("commerciaux").select("id, nom, manager_id, actif").in("manager_id", tmIds);
  if (error) throw new Error(`Lecture des commerciaux des TM impossible : ${error.message}`);

  const inactifs = new Set(data.filter((c) => c.actif === false).map((c) => String(c.id)));
  const parTm = (tmId: string, actif: boolean) =>
    data.filter((c) => String(c.manager_id) === tmId && (c.actif !== false) === actif).map((c) => ({ id: String(c.id), name: c.nom }));
  const ressemble = (nom: string, liste: { id: string; name: string }[]) =>
    associerLignes([{ nom, valeurs: {} }], liste).reconnus.length > 0;

  return (tmId: string, commercialId: unknown, nom: string) => {
    if (commercialId != null) return inactifs.has(String(commercialId));
    return ressemble(nom, parTm(tmId, false)) && !ressemble(nom, parTm(tmId, true));
  };
}
