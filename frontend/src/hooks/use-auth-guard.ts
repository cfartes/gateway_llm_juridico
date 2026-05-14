"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";

export function useAuthGuard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getAccessToken();
    if (!stored) {
      router.replace("/login");
      setReady(true);
      return;
    }
    setToken(stored);
    setReady(true);
  }, [router]);

  return { token, ready };
}