"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";

const ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Scans", href: "#" },
  { label: "Files", href: "#" },
  { label: "API Tokens", href: "/api-tokens" },
  { label: "Policies", href: "#" },
  { label: "Allow / Block Lists", href: "#" },
  { label: "Integrations", href: "#" },
  { label: "Audit Log", href: "#" },
  { label: "Settings", href: "#" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[238px] flex-col border-r border-[#e6ebf3] bg-white lg:flex">
      <div className="px-6 pb-4 pt-5">
        <p className="text-[33px] font-extrabold leading-none text-[var(--color-primary)]">NEXUS</p>
        <p className="text-xs font-semibold tracking-wide text-[#8292af]">LLM SHIELD</p>
      </div>
      <nav className="px-3">
        {ITEMS.map((item) => {
          const active = item.href !== "#" && pathname === item.href;
          return (
            <Link
              href={item.href === "#" ? "/" : item.href}
              key={item.label}
              className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active ? "bg-[#edf3ff] text-[var(--color-primary)]" : "text-[#4c5f82]"
              }`}
            >
              <span className="inline-block h-4 w-4 rounded-full border border-current opacity-80" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-3">
        <Card className="rounded-xl bg-[#f5f8ff] p-3">
          <p className="text-sm font-semibold text-[var(--color-primary)]">Enterprise Plan</p>
          <p className="mt-1 text-xs text-[#6a7a95]">Unlimited scans</p>
        </Card>
      </div>
    </aside>
  );
}