import type { ComponentProps } from "react";

const variants = {
  primary: "bg-accent text-white",
  ghost: "border border-line bg-white text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-center gap-[9px] rounded-xl p-3.5 text-[14.5px] font-bold ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
