import type { Status, StatusKey } from "@/lib/types";

const tones: Record<StatusKey, string> = {
  ok: "bg-good-soft text-good",
  watch: "border border-line bg-paper text-ink2",
  acc: "bg-bad-soft text-bad",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`flex-none whitespace-nowrap rounded-[20px] px-[11px] py-[5px] text-[11.5px] font-bold ${tones[status.k]}`}
    >
      {status.t}
    </span>
  );
}

// Couleur de la pastille d'un commercial (vert / gris / rouge).
export const statusDot: Record<StatusKey, string> = {
  ok: "bg-good",
  watch: "bg-faint",
  acc: "bg-bad",
};
