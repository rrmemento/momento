import type { ReactNode } from "react";

// Une section repliée par défaut : le titre, un résumé, et un lien pour déplier le détail.
export function Repli({
  titre,
  resume,
  lien,
  children,
}: {
  titre: string;
  resume?: ReactNode;
  lien: string; // ex. « Voir les courbes détaillées »
  children: ReactNode;
}) {
  return (
    <details className="group mb-3 rounded-2xl border border-line bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] font-bold">{titre}</span>
        {resume && <span className="text-[12.5px] text-muted">{resume}</span>}
        <span className="ml-auto text-[12.5px] font-semibold text-accent">
          <span className="group-open:hidden">{lien} ▾</span>
          <span className="hidden group-open:inline">Replier ▴</span>
        </span>
      </summary>
      <div className="border-t border-line2 px-4 pt-3 pb-4">{children}</div>
    </details>
  );
}
