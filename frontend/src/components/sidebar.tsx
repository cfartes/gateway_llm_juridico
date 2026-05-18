"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { clearSessionTokens, ensureAccessToken, getAccessToken } from "@/lib/auth";
import { AppLocale, LOCALE_FLAGS } from "@/lib/i18n";
import { useI18n } from "@/hooks/use-i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type NavItem = {
  labelKey: string;
  href: string;
  superadminOnly?: boolean;
};

const ITEMS: NavItem[] = [
  { labelKey: "sidebar.overview", href: "/" },
  { labelKey: "sidebar.apiTokens", href: "/api-tokens" },
  { labelKey: "sidebar.users", href: "/users" },
  { labelKey: "sidebar.quarantine", href: "/quarantine" },
  { labelKey: "sidebar.queues", href: "/queues" },
  { labelKey: "sidebar.superadminTenants", href: "/superadmin/tenants", superadminOnly: true },
  { labelKey: "sidebar.superadminLLM", href: "/superadmin/llm-config", superadminOnly: true },
  { labelKey: "sidebar.superadminWebhooks", href: "/superadmin/webhooks", superadminOnly: true },
  { labelKey: "sidebar.superadminQueues", href: "/superadmin/queues", superadminOnly: true },
  { labelKey: "sidebar.superadminOps", href: "/superadmin/ops", superadminOnly: true },
  { labelKey: "sidebar.superadminSupport", href: "/superadmin/support", superadminOnly: true },
  { labelKey: "sidebar.webhookDeliveries", href: "/webhooks" },
  { labelKey: "sidebar.integrations", href: "/integrations" },
  { labelKey: "sidebar.auditLog", href: "/audit-log" },
  { labelKey: "sidebar.support", href: "/support" },
  { labelKey: "sidebar.settings", href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState("");
  const { locale, setLocale, t } = useI18n();
  const [updatingLocale, setUpdatingLocale] = useState(false);

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

  async function changeLanguage(nextLocale: AppLocale) {
    if (nextLocale === locale || updatingLocale) return;
    setUpdatingLocale(true);
    try {
      const accessToken = await ensureAccessToken(API_BASE);
      if (accessToken) {
        await fetch(`${API_BASE}/settings/current/language`, {
          method: "PUT",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ language: nextLocale }),
        });
      }
    } catch {
      // Keep local state update even if backend is temporarily unreachable.
    } finally {
      setLocale(nextLocale);
      setUpdatingLocale(false);
    }
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
            <Link href={item.href} key={item.labelKey} className={className}>
              <span className="inline-block h-4 w-4 rounded-full border border-current opacity-80" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-3 space-y-2">
        <Card className="rounded-xl bg-[var(--color-surface-alt)] p-3">
          <p className="text-sm font-semibold text-[var(--color-primary)]">{t("sidebar.plan")}</p>
          <p className="mt-1 text-xs text-[var(--color-text-soft)]">{t("sidebar.planDesc")}</p>
        </Card>
        <Card className="rounded-xl p-2">
          <p className="px-1 pb-1 text-xs font-semibold text-[var(--color-text-soft)]">{t("sidebar.language")}</p>
          <div className="grid grid-cols-3 gap-1">
            {(["pt-BR", "en-US", "es-ES"] as AppLocale[]).map((itemLocale) => (
              <button
                key={itemLocale}
                type="button"
                className={`rounded-lg border px-2 py-1 text-lg transition ${
                  locale === itemLocale
                    ? "border-[var(--color-primary)] bg-[var(--color-surface-alt)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]"
                }`}
                onClick={() => void changeLanguage(itemLocale)}
                disabled={updatingLocale}
                title={itemLocale}
              >
                {LOCALE_FLAGS[itemLocale]}
              </button>
            ))}
          </div>
        </Card>
        <ThemeToggle />
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text-soft)] hover:bg-[var(--color-surface-alt)]"
        >
          {t("sidebar.logout")}
        </button>
      </div>
    </aside>
  );
}
