// Vue RM : le statut d'un TM = celui de son équipe, sur le pace cumulé de ses commerciaux.
// Mêmes seuils que le statut d'un commercial (statut() dans momento.ts) :
// ventes OU installs sous 80 % → à accompagner · sous 100 % → à surveiller · les deux à 100 % et plus → en forme.
import type { Rep, Status } from "@/lib/types";

const pc = (f: number) => Math.round(f * 100) + " %";

export function statutEquipe(reps: Rep[]): Status {
  // Seuls les commerciaux qui ont leurs chiffres du mois comptent ; chacun pèse selon son objectif du mois.
  const avecChiffres = reps.filter((r) => r.hasKpis && r.objectif > 0);
  const objectif = avecChiffres.reduce((s, r) => s + r.objectif, 0);
  if (!objectif) return { k: "none", t: "Chiffres à venir", why: "chiffres de l'équipe non renseignés" };

  // Pace de l'équipe = projection fin de mois cumulée / objectif cumulé.
  const vp = avecChiffres.reduce((s, r) => s + r.vPaceF * r.objectif, 0) / objectif;
  const ip = avecChiffres.reduce((s, r) => s + r.iPaceF * r.objectif, 0) / objectif;
  const why = `équipe : ventes ${pc(vp)} · installs ${pc(ip)}`;

  if (vp < 0.8 || ip < 0.8) return { k: "acc", t: "Équipe à accompagner", why };
  if (vp < 1 || ip < 1) return { k: "watch", t: "Équipe à surveiller", why };
  return { k: "ok", t: "Équipe en forme", why };
}
