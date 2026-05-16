"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ensureAccessToken, setSessionTokens } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [tenantSlug, setTenantSlug] = useState("acme");
  const [email, setEmail] = useState("admin@acme.com");
  const [password, setPassword] = useState("StrongPass#2026");

  const [tenantName, setTenantName] = useState("Acme Corp");
  const [fullName, setFullName] = useState("Acme Admin");

  useEffect(() => {
    async function checkSession() {
      const token = await ensureAccessToken(API_BASE);
      if (token) {
        router.replace("/");
      }
    }
    void checkSession();
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? { email, password }
          : {
              tenant_name: tenantName,
              tenant_slug: tenantSlug,
              email,
              full_name: fullName,
              password,
            };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { access_token: string; must_change_password?: boolean };
      setSessionTokens(data.access_token);
      if (data.must_change_password) {
        router.replace("/first-access");
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f9ff_0%,#fdfefe_100%)] p-4">
      <div className="mx-auto flex min-h-[92vh] w-full max-w-[1080px] items-center justify-center">
        <Card className="grid w-full max-w-[880px] grid-cols-1 overflow-hidden p-0 md:grid-cols-[1.05fr_1fr]">
          <div className="bg-[linear-gradient(145deg,#2f6fff,#1748bb)] p-8 text-white">
            <p className="text-3xl font-extrabold">NEXUS</p>
            <p className="text-sm font-semibold text-blue-100">GATEWAY LLM SHIELD</p>
            <h1 className="mt-10 text-3xl font-bold">Secure AI Document Pipeline</h1>
            <p className="mt-3 text-sm text-blue-100">
              Authenticate with your user email and start scanning files for prompt injections, hidden instructions, and exfiltration attempts.
            </p>
          </div>

          <div className="p-7">
            <div className="mb-5 flex gap-2">
              <Button
                variant={mode === "login" ? "default" : "outline"}
                className="h-9"
                onClick={() => setMode("login")}
              >
                Login
              </Button>
              <Button
                variant={mode === "register" ? "default" : "outline"}
                className="h-9"
                onClick={() => setMode("register")}
              >
                Register
              </Button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === "register" ? (
                <Input
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Tenant name"
                  required
                />
              ) : null}

              {mode === "register" ? (
                <Input
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  placeholder="Tenant slug"
                  required
                />
              ) : null}

              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
              />

              {mode === "register" ? (
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  required
                />
              ) : null}

              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />

              <Button type="submit" className="h-10 w-full" disabled={loading}>
                {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create tenant and sign in"}
              </Button>
            </form>

            {error ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
