import type { ReactNode } from "react";

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-[14px] border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
      {children}
    </div>
  );
}
