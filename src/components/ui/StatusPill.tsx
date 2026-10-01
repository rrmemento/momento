import type { Status, StatusKey } from "@/lib/types";

// En forme (vert) > En bonne voie (orange clair) > À surveiller (orange foncé) > À accompagner (rouge).
const tones: Record<StatusKey, string> = {
  ok: "bg-good-soft text-good",
  voie: "border border-amber-200 bg-amber-50 text-amber-600",
  watch: "border border-orange-300 bg-orange-100 text-orange-800",
  acc: "bg-bad-soft text-bad",
  none: "border border-dashed border-line bg-paper text-muted",
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

// Couleur de la pastille d'un commercial (vert / orange clair / orange foncé / rouge).
export const statusDot: Record<StatusKey, string> = {
  ok: "bg-good",
  voie: "bg-amber-300",
  watch: "bg-orange-600",
  acc: "bg-bad",
  none: "bg-line",
};

// Le liseré gauche d'une carte, à la couleur du statut (vert / orange clair / orange foncé / rouge).
export const statusBord: Record<StatusKey, string> = {
  ok: "border-l-[3px] border-l-good",
  voie: "border-l-[3px] border-l-amber-300",
  watch: "border-l-[3px] border-l-orange-600",
  acc: "border-l-[3px] border-l-bad",
  none: "",
};
