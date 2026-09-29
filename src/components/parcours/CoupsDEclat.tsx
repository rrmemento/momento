import type { CoupDEclat } from "@/lib/parcours-analyse";

// « Coups d'éclat » : ses records, ses séries à l'objectif, ses engagements tenus. À célébrer.
export function CoupsDEclat({ eclats, prenom }: { eclats: CoupDEclat[]; prenom: string }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2.5 text-[20px] font-bold">Coups d&apos;éclat</h2>
      {eclats.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
          Pas encore de coup d&apos;éclat à fêter : les records et séries de {prenom} apparaîtront ici au fil des mois.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {eclats.map((e) => (
            <li key={e.cle} className="flex gap-3 rounded-2xl border border-good-line bg-good-soft px-3.5 py-3">
              <span className="text-[22px] leading-none" aria-hidden="true">
                {e.icone}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-ink">{e.titre}</div>
                <div className="mt-0.5 text-[12px] text-muted">{e.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
