import { firstName, orderReps } from "@/lib/momento";
import { useStatutAffiche } from "@/components/ModeRm";
import type { Rep } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { statusDot } from "@/components/ui/StatusPill";

export function RepPicker({
  reps,
  currentId,
  onSelect,
}: {
  reps: Rep[];
  currentId: string;
  onSelect: (repId: string) => void;
}) {
  const statutAffiche = useStatutAffiche(); // vue RM : le statut de l'équipe du TM
  return (
    <div className="no-scrollbar -mx-0.5 mb-2 flex gap-[9px] overflow-x-auto px-0.5 pt-0.5 pb-3">
      {orderReps(reps, statutAffiche).map((rep) => {
        const on = rep.id === currentId;
        return (
          <button
            key={rep.id}
            type="button"
            onClick={() => onSelect(rep.id)}
            aria-pressed={on}
            className="relative flex w-[62px] flex-none flex-col items-center gap-1.5 py-1"
          >
            <span
              className={`absolute top-0.5 right-3 size-[9px] rounded-full border-2 border-paper ${statusDot[statutAffiche(rep).k]}`}
            />
            <Avatar
              initials={rep.initials}
              className={`transition duration-150 ${
                on ? "shadow-[0_0_0_2.5px_var(--color-paper),0_0_0_4.5px_var(--color-accent)]" : "opacity-50"
              }`}
            />
            <span className={`whitespace-nowrap text-[11.5px] font-semibold ${on ? "text-ink" : "text-muted"}`}>
              {firstName(rep)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
