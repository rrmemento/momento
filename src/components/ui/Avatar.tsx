const sizes = {
  sm: "size-[42px] rounded-[11px] text-sm",
  lg: "size-14 rounded-[15px] text-[19px]",
};

export function Avatar({
  initials,
  size = "sm",
  className = "",
}: {
  initials: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span className={`grid flex-none place-items-center bg-ink font-bold text-white ${sizes[size]} ${className}`}>
      {initials}
    </span>
  );
}
