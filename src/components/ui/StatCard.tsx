export function StatCard({ value, label, valueClass = "" }: { value: number; label: string; valueClass?: string }) {
  return (
    <div className="flex-1 rounded-[14px] border border-line bg-surface px-3.5 py-[13px] shadow-card">
      <div className={`font-display text-[23px] font-bold leading-none ${valueClass}`}>{value}</div>
      <div className="mt-1.5 text-[11.5px] font-semibold text-muted">{label}</div>
    </div>
  );
}
