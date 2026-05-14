"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export function useAuthGuard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      const stored = await ensureAccessToken(API_BASE);
      if (!stored) {
        router.replace("/login");
        setReady(true);
        return;
      }
      setToken(stored);
      setReady(true);
    }
    void bootstrap();
  }, [router]);

  return { token, ready };
}
