import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_8px_20px_-18px_rgba(22,40,74,0.5)]",
        className,
      )}
      {...props}
    />
  );
}

