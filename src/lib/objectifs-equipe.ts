// Les OBJECTIFS D'ÉQUIPE d'un TM (vue RM) : ils remplacent le budget cumulé de l'équipe PARTOUT où l'on juge ou
// affiche un TM (courbes, statut, analyse, jauges, IA). Le budget cumulé bouge dès qu'un sales arrive ou part :
// il ne sert jamais d'objectif.
// Un TM ne monte pas en séniorité : il est toujours jugé à fond, sa date de début ne change rien.

export const PACE_CIBLE = 100; // ventes et installs : le PACE du TM (déjà en % dans le BI) contre 100 %
export const POS_PAR_SALES = 4; // POS vendus : 4 par sales ACTIF
export const OG_PAR_SALES = 5; // ventes OG : 5 par sales ACTIF
export const POS_SHARE_EQUIPE = 25; // %

export type ObjectifsEquipe = { pace: number; posVendus: number; og: number; posShare: number; nbActifs: number };

// L'effectif de l'équipe : ses sales dans le BI du mois, partis compris (Léa, partie, compte dans l'effectif du mois).
export function objectifsEquipe(nbActifs: number): ObjectifsEquipe {
  return {
    pace: PACE_CIBLE,
    posVendus: nbActifs * POS_PAR_SALES,
    og: nbActifs * OG_PAR_SALES,
    posShare: POS_SHARE_EQUIPE,
    nbActifs,
  };
}

// Le texte à donner à l'IA pour qu'elle juge l'équipe sur ces objectifs (et jamais sur le Sales Budget cumulé).
export function consigneObjectifsEquipe(nbActifs: number) {
  const o = objectifsEquipe(nbActifs);
  return `OBJECTIFS D'ÉQUIPE (à utiliser pour juger l'équipe ; effectif du mois : ${nbActifs} sales dans le BI, partis compris) :
- Ventes signées et installations : objectif = PACE 100 % (colonnes "Sales Budget Pace" et "Budget Pace").
- POS vendus : objectif = ${o.posVendus} (${nbActifs} sales × ${POS_PAR_SALES}).
- POS share : objectif = ${o.posShare} %.
- Ventes OG : objectif = ${o.og} (${nbActifs} sales × ${OG_PAR_SALES}).
N'utilise JAMAIS le "Sales Budget" cumulé de l'équipe (ni les "% Budget reached") comme objectif : il bouge dès qu'un sales arrive ou part.`;
}
