export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <path
        d="M7 33 L7 14 L22 27 L37 8"
        stroke="var(--color-ink)"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="37" cy="8" r="4.2" fill="var(--color-accent)" />
    </svg>
  );
}
