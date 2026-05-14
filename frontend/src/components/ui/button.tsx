import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger";
};

const styles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)]",
  outline: "border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-white/80",
  ghost: "text-[var(--color-text)] hover:bg-white/80",
  danger: "bg-[var(--color-danger)] text-white hover:bg-[#e53935]",
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-40",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

