"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ensureAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export function useAuthGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        const stored = await ensureAccessToken(API_BASE);
        if (!stored) {
          router.replace("/login");
          return;
        }
        const response = await fetch(`${API_BASE}/auth/me`, {
          method: "GET",
          credentials: "include",
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (!response.ok) {
          router.replace("/login");
          return;
        }
        const me = (await response.json()) as { must_change_password?: boolean; role?: string };
        const resolvedRole = (me.role ?? "").toLowerCase();
        setRole(resolvedRole);
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
      } catch {
        router.replace("/login");
      } finally {
        setReady(true);
      }
    }
    void bootstrap();
  }, [pathname, router]);

  return { token, role, ready };
}
