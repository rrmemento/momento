import type { SignalFaible } from "@/lib/parcours-analyse";

// Le détail des signaux faibles repérés par les règles MOMENTO (le diagnostic IA les intègre déjà).
export function SignauxFaibles({ signaux, prenom }: { signaux: SignalFaible[]; prenom: string }) {
  return (
    <>
      <p className="mb-2.5 text-[12px] text-faint">
        Calculés automatiquement. Le mois en cours (pas terminé) et les mois particuliers (congés, arrêt…) ne sont pas
        comptés pour les volumes.
      </p>
      {signaux.length === 0 ? (
        <p className="text-[13px] text-muted">Aucun signal faible repéré par les règles sur le parcours de {prenom}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {signaux.map((s) => (
            <li key={s.cle} className="flex gap-3 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-2.5">
              <span className="font-bold text-warn" aria-hidden="true">
                ⚠
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-ink">{s.titre}</div>
                <div className="mt-0.5 text-[12.5px] text-ink2">{s.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
