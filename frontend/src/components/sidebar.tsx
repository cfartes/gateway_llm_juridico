"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { clearSessionTokens, ensureAccessToken, getAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type NavItem = {
  label: string;
  href: string;
  superadminOnly?: boolean;
};

const ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  { label: "API Tokens", href: "/api-tokens" },
  { label: "Users", href: "/users" },
  { label: "Quarantine", href: "/quarantine" },
  { label: "Queues", href: "/queues" },
  { label: "SuperAdmin Tenants", href: "/superadmin/tenants", superadminOnly: true },
  { label: "SuperAdmin LLM", href: "/superadmin/llm-config", superadminOnly: true },
  { label: "SuperAdmin Webhooks", href: "/superadmin/webhooks", superadminOnly: true },
  { label: "SuperAdmin Queues", href: "/superadmin/queues", superadminOnly: true },
  { label: "SuperAdmin Ops", href: "/superadmin/ops", superadminOnly: true },
  { label: "SuperAdmin Support", href: "/superadmin/support", superadminOnly: true },
  { label: "Webhook Deliveries", href: "/webhooks" },
  { label: "Integrations", href: "/integrations" },
  { label: "Audit Log", href: "/audit-log" },
  { label: "Support", href: "/support" },
  { label: "Settings", href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState("");

  useEffect(() => {
    async function loadRole() {
      const accessToken = await ensureAccessToken(API_BASE);
      if (!accessToken) return;
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          method: "GET",
          credentials: "include",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return;
        const me = (await response.json()) as { role?: string };
        setRole((me.role ?? "").toLowerCase());
      } catch {
        // Ignore profile fetch issues and keep a safe default visibility.
      }
    }
    void loadRole();
  }, []);

  const visibleItems = useMemo(
    () => ITEMS.filter((item) => !item.superadminOnly || role === "superadmin"),
    [role],
  );

  async function logout() {
    const accessToken = getAccessToken();
    if (accessToken) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"}/auth/logout`, {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch {
        // Ignore network errors during logout; local session must still be cleared.
      }
    }
    clearSessionTokens();
    router.replace("/login");
  }

  return (
    <aside className="hidden w-[238px] flex-col border-r border-[var(--color-border-soft)] bg-[var(--color-surface)] lg:flex">
      <div className="px-6 pb-4 pt-5">
        <p className="text-[33px] font-extrabold leading-none text-[var(--color-primary)]">NEXUS</p>
        <p className="text-xs font-semibold tracking-wide text-[var(--color-text-muted)]">GATEWAY LLM SHIELD</p>
      </div>
      <nav className="px-3">
        {visibleItems.map((item) => {
          const active = pathname === item.href;
          const className = `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
            active ? "bg-[var(--color-surface-alt)] text-[var(--color-primary)]" : "text-[var(--color-text-soft)]"
          }`;

          return (
            <Link href={item.href} key={item.label} className={className}>
              <span className="inline-block h-4 w-4 rounded-full border border-current opacity-80" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-3 space-y-2">
        <Card className="rounded-xl bg-[var(--color-surface-alt)] p-3">
          <p className="text-sm font-semibold text-[var(--color-primary)]">Enterprise Plan</p>
          <p className="mt-1 text-xs text-[var(--color-text-soft)]">Unlimited scans</p>
        </Card>
        <ThemeToggle />
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text-soft)] hover:bg-[var(--color-surface-alt)]"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
