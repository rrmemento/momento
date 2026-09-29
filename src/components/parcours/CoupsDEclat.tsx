import type { CoupDEclat } from "@/lib/parcours-analyse";

// « Coups d'éclat », version compacte : un badge par record, série ou engagement tenu (détail au survol).
export function CoupsDEclat({ eclats }: { eclats: CoupDEclat[] }) {
  if (!eclats.length) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.05em] text-muted">Coups d&apos;éclat</h2>
      <ul className="flex flex-wrap gap-1.5">
        {eclats.map((e) => (
          <li
            key={e.cle}
            title={e.detail}
            className="flex items-center gap-1.5 rounded-full border border-good-line bg-good-soft px-3 py-1.5 text-[12.5px]"
          >
            <span aria-hidden="true">{e.icone}</span>
            <span className="font-semibold text-ink">{e.titre}</span>
            <span className="text-muted">· {e.detail.split(" · ")[0]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
