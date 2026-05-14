import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-white/85 p-5 shadow-[0_18px_40px_-28px_rgba(18,34,74,0.45)] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

