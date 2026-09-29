"use client";

import { useState } from "react";
import { moisCourt } from "@/lib/mois";
import type { PointParcours, SerieParcours } from "@/lib/parcours";

// Un petit graphique d'évolution mois par mois (courbe lissée) : une seule série, un seul axe,
// le repère MOMENTO (objectif / cible) en pointillé ; la valeur d'un mois se lit au survol ou au toucher.

const L = 320; // largeur du dessin (le SVG s'adapte ensuite à la carte)
const H = 150;
const M = { haut: 18, droite: 10, bas: 24, gauche: 30 };
const LARGEUR = L - M.gauche - M.droite;
const HAUTEUR = H - M.haut - M.bas;

export const formatValeur = (v: number, s: Pick<SerieParcours, "unite" | "decimales">) =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: s.decimales }) + s.unite;

// Un maximum « rond » pour l'axe : 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100…
function maxRond(v: number) {
  if (v <= 0) return 1;
  const puissance = 10 ** Math.floor(Math.log10(v));
  const pas = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((p) => p * puissance >= v) ?? 10;
  return pas * puissance;
}

type Pt = { x: number; y: number };
const f1 = (n: number) => n.toFixed(1);

// Courbe lissée « monotone » (Fritsch-Carlson) : fluide, mais elle ne dépasse jamais les vrais points
// (pas de faux creux ni de faux pic entre deux mois).
function lisse(p: Pt[]) {
  if (p.length < 2) return "";
  const pentes = p.slice(1).map((q, k) => (q.y - p[k].y) / (q.x - p[k].x));
  const t = p.map((_, k) =>
    k === 0 ? pentes[0] : k === p.length - 1 ? pentes[k - 1] : pentes[k - 1] * pentes[k] <= 0 ? 0 : (pentes[k - 1] + pentes[k]) / 2,
  );
  pentes.forEach((d, k) => {
    if (d === 0) {
      t[k] = t[k + 1] = 0;
      return;
    }
    const a = t[k] / d;
    const b = t[k + 1] / d;
    const s = a * a + b * b;
    if (s > 9) {
      t[k] = (3 / Math.sqrt(s)) * a * d;
      t[k + 1] = (3 / Math.sqrt(s)) * b * d;
    }
  });
  let d = `M${f1(p[0].x)},${f1(p[0].y)}`;
  for (let k = 0; k < p.length - 1; k++) {
    const h = (p[k + 1].x - p[k].x) / 3;
    d += ` C${f1(p[k].x + h)},${f1(p[k].y + t[k] * h)} ${f1(p[k + 1].x - h)},${f1(p[k + 1].y - t[k + 1] * h)} ${f1(p[k + 1].x)},${f1(p[k + 1].y)}`;
  }
  return d;
}

// Les morceaux de courbe entre les mois sans donnée (la courbe est coupée, rien n'est inventé).
function morceaux(points: { x: number; y: number | null }[]) {
  const liste: Pt[][] = [[]];
  for (const p of points) {
    if (p.y == null) liste.push([]);
    else liste[liste.length - 1].push({ x: p.x, y: p.y });
  }
  return liste.filter((m) => m.length >= 2);
}

export function MiniGraphique({ serie }: { serie: SerieParcours }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const pts = serie.points;
  const n = pts.length;
  const valeurs = pts.map((p) => p.valeur).filter((v): v is number => v != null);

  // Objectif propre à chaque mois (ventes, installations : budget du mois ou objectif ajusté) → repère en paliers.
  const objectifs = pts.map((p) => p.objectif ?? null);
  const enPaliers = objectifs.some((o) => o != null);
  const max = maxRond(Math.max(...valeurs, serie.repere?.valeur ?? 0, ...objectifs.map((o) => o ?? 0)) * 1.12);
  const bande = LARGEUR / n;
  const cx = (i: number) => M.gauche + bande * (i + 0.5);
  const cy = (v: number) => M.haut + HAUTEUR * (1 - v / max);
  const base = M.haut + HAUTEUR;
  const courbes = morceaux(pts.map((p, i) => ({ x: cx(i), y: p.valeur == null ? null : cy(p.valeur) })));

  // Étiquettes de mois : toutes s'il y a de la place, sinon une sur deux ; l'année au premier mois et en janvier.
  const tous = n <= 8;
  const plusieursAnnees = new Set(pts.map((p) => p.mois.split(" ")[1])).size > 1;
  const actif = survol != null ? pts[survol] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${L} ${H}`}
        className="block h-auto w-full touch-manipulation"
        role="img"
        aria-label={`${serie.titre}, évolution sur ${n} mois`}
        onMouseLeave={() => setSurvol(null)}
      >
        {/* Grille discrète : 0 et le maximum */}
        {[0, max].map((v) => (
          <g key={v}>
            <line x1={M.gauche} x2={L - M.droite} y1={cy(v)} y2={cy(v)} stroke="var(--color-line2)" strokeWidth="1" />
            <text x={M.gauche - 6} y={cy(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-faint)">
              {v.toLocaleString("fr-FR")}
            </text>
          </g>
        ))}

        {/* Objectif de chaque mois : un palier pointillé par mois (M1 → 5, M2 → 10, M3+ → 15, mois ajustés…) */}
        {enPaliers &&
          objectifs.map((o, i) =>
            o == null ? null : (
              <line
                key={`obj-${pts[i].mois}`}
                x1={M.gauche + bande * i + 2}
                x2={M.gauche + bande * (i + 1) - 2}
                y1={cy(o)}
                y2={cy(o)}
                stroke="var(--color-muted)"
                strokeWidth="1.25"
                strokeDasharray="4 3"
              />
            ),
          )}
        {enPaliers && objectifs.at(-1) != null && (
          <text
            x={L - M.droite}
            y={cy(objectifs.at(-1)!) - 4}
            textAnchor="end"
            fontSize="10"
            fontWeight="600"
            fill="var(--color-muted)"
          >
            objectif {objectifs.at(-1)}
          </text>
        )}

        {/* Repère MOMENTO fixe (cible) */}
        {!enPaliers && serie.repere && serie.repere.valeur <= max && (
          <g>
            <line
              x1={M.gauche}
              x2={L - M.droite}
              y1={cy(serie.repere.valeur)}
              y2={cy(serie.repere.valeur)}
              stroke="var(--color-muted)"
              strokeWidth="1.25"
              strokeDasharray="4 3"
            />
            <text
              x={L - M.droite}
              y={cy(serie.repere.valeur) - 4}
              textAnchor="end"
              fontSize="10"
              fontWeight="600"
              fill="var(--color-muted)"
            >
              {serie.repere.libelle}
            </text>
          </g>
        )}

        {/* La courbe de progression : voile léger dessous, trait vert foncé, un point par mois */}
        {courbes.map((m, k) => (
          <g key={k}>
            <path
              d={`${lisse(m)} L${f1(m[m.length - 1].x)},${base} L${f1(m[0].x)},${base} Z`}
              fill="var(--color-accent)"
              opacity="0.07"
            />
            <path
              d={lisse(m)}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}
        {survol != null && pts[survol].valeur != null && (
          <line
            x1={cx(survol)}
            x2={cx(survol)}
            y1={M.haut}
            y2={base}
            stroke="var(--color-accent)"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.5"
          />
        )}
        {pts.map((p, i) =>
          p.valeur == null ? null : (
            <circle
              key={p.mois}
              cx={cx(i)}
              cy={cy(p.valeur)}
              r={survol === i ? 5.5 : 4}
              fill={p.special ? "var(--color-surface)" : "var(--color-accent)"}
              stroke={p.special ? "var(--color-accent)" : "var(--color-surface)"}
              strokeWidth="2"
            />
          ),
        )}

        {/* Les mois */}
        {pts.map((p, i) =>
          tous || i % 2 === (n - 1) % 2 ? (
            <text key={p.mois} x={cx(i)} y={H - 7} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
              {moisCourt(p.mois, plusieursAnnees && (i === 0 || p.mois.startsWith("Janvier")))}
            </text>
          ) : null,
        )}

        {/* Zones de survol / toucher, plus larges que les marques */}
        {pts.map((p, i) => (
          <rect
            key={p.mois}
            x={M.gauche + bande * i}
            y={0}
            width={bande}
            height={H}
            fill="transparent"
            onMouseEnter={() => setSurvol(i)}
            onClick={() => setSurvol((s) => (s === i ? null : i))}
          />
        ))}
      </svg>

      {actif && survol != null && (
        <Infobulle point={actif} serie={serie} gauche={(cx(survol) / L) * 100} />
      )}

      {/* Les mêmes données en tableau, pour les lecteurs d'écran */}
      <table className="sr-only">
        <caption>{serie.titre}</caption>
        <tbody>
          {pts.map((p) => (
            <tr key={p.mois}>
              <th scope="row">{p.mois}</th>
              <td>{p.valeur == null ? "pas de donnée" : formatValeur(p.valeur, serie)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Infobulle({ point, serie, gauche }: { point: PointParcours; serie: SerieParcours; gauche: number }) {
  // Collée au point survolé, sans sortir de la carte.
  const cote = gauche > 60 ? { right: `${100 - gauche}%` } : { left: `${gauche}%` };
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 min-w-[120px] -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-card"
      style={cote}
      role="status"
    >
      <div className="font-semibold text-muted">{point.mois}</div>
      <div className="font-bold text-ink">
        {point.valeur == null ? "Pas de donnée" : formatValeur(point.valeur, serie)}
        {point.valeur != null && !point.special && point.objectif != null && (
          <span className="font-medium text-muted"> · objectif {point.objectif}</span>
        )}
        {point.valeur != null && !point.special && point.objectif == null && serie.repere && (
          <span className="font-medium text-muted"> · {serie.repere.libelle}</span>
        )}
      </div>
      {point.detail && <div className="text-muted">{point.detail}</div>}
    </div>
  );
}
