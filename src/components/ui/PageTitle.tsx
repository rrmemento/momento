export function PageTitle({ kicker, title, month }: { kicker: string; title: string; month?: string }) {
  return (
    <>
      <div className="mb-0.5 text-[12.5px] font-semibold text-muted">{kicker}</div>
      <h1 className="mb-4 text-[26px] font-bold">
        {title}
        {month && <span className="font-semibold text-faint"> · {month.toLowerCase()}</span>}
      </h1>
    </>
  );
}
