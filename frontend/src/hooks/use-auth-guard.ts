"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authenticatedJson, clearSessionTokens, ensureAccessToken } from "@/lib/auth";
import { AppLocale, setStoredLocale } from "@/lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export function useAuthGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState("");

  useEffect(() => {
    async function bootstrap() {
      let stored = "";
      try {
        stored = (await ensureAccessToken(API_BASE)) ?? "";
        if (!stored) {
          clearSessionTokens();
          router.replace("/login");
          return;
        }
        const me = await authenticatedJson<{ must_change_password?: boolean; role?: string }>(
          API_BASE,
          "/auth/me",
          stored,
        );
        const resolvedRole = (me.role ?? "").toLowerCase();
        setRole(resolvedRole);
        try {
          const settingsResponse = await fetch(`${API_BASE}/settings/current`, {
            method: "GET",
            credentials: "include",
            headers: { Authorization: `Bearer ${stored}` },
          });
          if (settingsResponse.ok) {
            const settings = (await settingsResponse.json()) as { ui?: { language?: AppLocale } };
            const language = settings.ui?.language;
            if (language === "pt-BR" || language === "en-US" || language === "es-ES") {
              setStoredLocale(language);
            }
          }
        } catch {
          // Keep local/browser fallback locale if settings endpoint is unavailable.
        }
        if (me.must_change_password && pathname !== "/first-access") {
          router.replace("/first-access");
          setToken(stored);
          return;
        }
        if (pathname.startsWith("/superadmin") && resolvedRole !== "superadmin") {
          router.replace("/");
          setToken(stored);
          return;
        }
        setToken(stored);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("Password change required")) {
          router.replace("/first-access");
          setToken(stored);
          return;
        }
        clearSessionTokens();
        router.replace("/login");
      } finally {
        setReady(true);
      }
    }
    void bootstrap();
  }, [pathname, router]);

  return { token, role, ready };
}
