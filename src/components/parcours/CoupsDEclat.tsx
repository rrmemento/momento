import type { PointFort } from "@/lib/parcours-analyse";

// « À valoriser ce mois-ci » : 1 à 2 réussites du dernier mois renseigné, avec l'action (féliciter en 1:1).
// Rien n'est affiché s'il n'y a rien de marquant ce mois-là.
export function CoupsDEclat({ mois, points }: { mois: string | null; points: PointFort[] }) {
  if (!mois || !points.length) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.05em] text-muted">
        À valoriser ce mois-ci <span className="font-semibold normal-case tracking-normal text-faint">· {mois.toLowerCase()}</span>
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {points.map((p) => (
          <li key={p.cle} className="flex gap-3 rounded-2xl border border-good-line bg-good-soft px-3.5 py-3">
            <span className="text-[20px] leading-none" aria-hidden="true">
              {p.icone}
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-ink">{p.titre}</div>
              <div className="mt-0.5 text-[12.5px] font-medium text-good">{p.action}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
