"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { clearAccessToken } from "@/lib/auth";

const ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Scans" },
  { label: "Files" },
  { label: "API Tokens", href: "/api-tokens" },
  { label: "Policies" },
  { label: "Allow / Block Lists" },
  { label: "Integrations" },
  { label: "Audit Log" },
  { label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearAccessToken();
    router.replace("/login");
  }

  return (
    <aside className="hidden w-[238px] flex-col border-r border-[#e6ebf3] bg-white lg:flex">
      <div className="px-6 pb-4 pt-5">
        <p className="text-[33px] font-extrabold leading-none text-[var(--color-primary)]">NEXUS</p>
        <p className="text-xs font-semibold tracking-wide text-[#8292af]">LLM SHIELD</p>
      </div>
      <nav className="px-3">
        {ITEMS.map((item) => {
          const hasLink = Boolean(item.href);
          const active = hasLink && pathname === item.href;
          const className = `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
            active ? "bg-[#edf3ff] text-[var(--color-primary)]" : "text-[#4c5f82]"
          }`;

          if (!hasLink) {
            return (
              <div key={item.label} className={`${className} opacity-70`}>
                <span className="inline-block h-4 w-4 rounded-full border border-current opacity-80" />
                {item.label}
              </div>
            );
          }

          return (
            <Link href={item.href!} key={item.label} className={className}>
              <span className="inline-block h-4 w-4 rounded-full border border-current opacity-80" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-3 space-y-2">
        <Card className="rounded-xl bg-[#f5f8ff] p-3">
          <p className="text-sm font-semibold text-[var(--color-primary)]">Enterprise Plan</p>
          <p className="mt-1 text-xs text-[#6a7a95]">Unlimited scans</p>
        </Card>
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-lg border border-[#e0e7f3] bg-white px-3 py-2 text-sm font-semibold text-[#4c5f82] hover:bg-[#f6f9ff]"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}