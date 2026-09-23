"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InsightCard } from "@/components/ui/InsightCard";
import { PageTitle } from "@/components/ui/PageTitle";

const DROPS = [
  { title: "Performance & POS", hint: "budget · ventes · POS" },
  { title: "Détail installations", hint: "installs · délai · quick" },
  { title: "Détail ventes", hint: "IH CR · send back · OG" },
];

type Capture = { name: string; preview: string };

function DropZone({
  title,
  hint,
  capture,
  onFile,
}: {
  title: string;
  hint: string;
  capture: Capture | null;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  const border = over || capture ? "border-accent" : "border-[#C7C4B8]";

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`block cursor-pointer rounded-[15px] border-[1.5px] p-[18px] shadow-card transition duration-150 ${border} ${
        capture ? "border-solid" : "border-dashed"
      } ${over ? "bg-[#FAFCFA]" : "bg-surface"}`}
    >
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <div className="flex items-center gap-3.5">
        <div
          className={`grid size-11 flex-none place-items-center overflow-hidden rounded-xl text-xl text-accent ${
            capture ? "bg-paper" : "bg-accent-soft"
          }`}
        >
          {capture ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local d'une image choisie
            <img src={capture.preview} alt="" className="size-full object-cover" />
          ) : (
            "＋"
          )}
        </div>
        <div>
          <div className="text-[14.5px] font-bold">{title}</div>
          <div className={`mt-0.5 text-xs ${capture ? "font-semibold text-ink" : "text-faint"}`}>
            {capture ? capture.name : `${hint} — appuie pour choisir`}
          </div>
        </div>
      </div>
    </label>
  );
}

export function ImportView({ onToast }: { onToast: (message: string) => void }) {
  const monthInputId = useId();
  const [month, setMonth] = useState("Août 2026");
  const [captures, setCaptures] = useState<(Capture | null)[]>([null, null, null]);
  const [result, setResult] = useState<{ count: number; month: string } | null>(null);

  function setCapture(index: number, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const capture = { name: file.name, preview: reader.result as string };
      setCaptures((prev) => prev.map((c, i) => (i === index ? capture : c)));
    };
    reader.readAsDataURL(file);
  }

  function analyseImport() {
    const count = captures.filter(Boolean).length;
    const label = month || "Nouveau mois";
    if (count === 0) {
      onToast("Ajoute au moins une capture");
      return;
    }
    setResult({ count, month: label });
    onToast(`${count} image(s) chargée(s) — ${label}`);
  }

  return (
    <div className="mx-auto max-w-[600px]">
      <PageTitle kicker="Remplir les chiffres" title="Importer le BI" />
      <p className="mb-[18px] text-sm leading-[1.6] text-muted">
        Choisis le mois, ajoute tes 3 captures Power BI. MOMENTO les lira et remplira tous les KPIs — tu vérifieras
        avant de valider. Chaque mois est archivé.
      </p>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[13px] border border-line bg-surface px-3.5 py-3 shadow-card">
        <label htmlFor={monthInputId} className="text-[13px] font-semibold text-muted">
          Ces données concernent
        </label>
        <input
          id={monthInputId}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-[9px] border border-line px-[11px] py-2 text-[13.5px] font-semibold"
        />
        <span className="text-xs text-faint">le mois clôturé</span>
      </div>

      <div className="mb-4 flex flex-col gap-[11px]">
        {DROPS.map((drop, i) => (
          <DropZone
            key={drop.title}
            title={drop.title}
            hint={drop.hint}
            capture={captures[i]}
            onFile={(file) => setCapture(i, file)}
          />
        ))}
      </div>

      <Button onClick={analyseImport}>Analyser les captures</Button>
      <p className="mt-2.5 text-center text-xs text-faint">
        La lecture automatique arrive juste après. Tu peux déjà charger tes images.
      </p>

      {result && (
        <div className="mt-4">
          <InsightCard
            tone="done"
            insight={{
              big: `${result.count}/3`,
              tt: `Captures chargées pour ${result.month}`,
              dd: "La lecture automatique (image → tous les KPIs remplis, puis archivage du mois) est la prochaine brique qu'on code. Tes images sont prêtes.",
            }}
          />
        </div>
      )}
    </div>
  );
}
