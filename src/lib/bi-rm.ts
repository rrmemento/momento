// Vue RM, côté serveur : le BI importé par le RM (table bi_rm_lignes) et ses 1:1 avec ses TM (entretiens_tm).
// La RLS ne laisse lire que les lignes du RM connecté, pour ses propres TM.
import "server-only";
import { normaliserEntretien } from "@/lib/entretien-contenu";
import { type DonneesBiRm, nettoyerDonnees } from "@/lib/lecture-bi-rm";
import { getCurrentManager, getMesTM } from "@/lib/managers";
import { createClient } from "@/lib/supabase/server";
import type { OneOnOne } from "@/lib/types";

// Ce qui a été importé pour un mois (affiché dans l'onglet Import).
export type ResumeImportRm = { tm: number; sales: number; le: string };

// Les lignes agrégées « tm » du BI : { mois: { tmId: chiffres } }, et le résumé de chaque mois importé.
export async function getBiRm(): Promise<{ parTm: Record<string, Record<string, DonneesBiRm>>; resumes: Record<string, ResumeImportRm> }> {
  const supabase = await createClient();
  const moi = await getCurrentManager();
  if (moi?.role !== "RM") return { parTm: {}, resumes: {} };
  // Filtre rm_id en plus de la RLS : on ne lit que son propre import.
  const { data, error } = await supabase
    .from("bi_rm_lignes")
    .select("mois, niveau, tm_id, donnees, importe_le")
    .eq("rm_id", moi.id);
  if (error) throw new Error(`Lecture du BI RM impossible : ${error.message}`);

  const parTm: Record<string, Record<string, DonneesBiRm>> = {};
  const resumes: Record<string, ResumeImportRm> = {};
  for (const l of data) {
    const r = (resumes[l.mois] ??= { tm: 0, sales: 0, le: l.importe_le });
    if (l.niveau === "tm" && l.tm_id != null) {
      (parTm[l.mois] ??= {})[String(l.tm_id)] = nettoyerDonnees(l.donnees);
      r.tm += 1;
    } else if (l.niveau === "sales") r.sales += 1;
  }
  return { parTm, resumes };
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
