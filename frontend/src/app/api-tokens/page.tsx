"use client";

import { FormEvent, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ApiToken = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const AUTH_TOKEN_KEY = "nexus_admin_jwt";

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

export default function ApiTokensPage() {
  const [jwt, setJwt] = useState("");
  const [tokenName, setTokenName] = useState("SIEM Integration");
  const [generatedToken, setGeneratedToken] = useState("");
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = window.localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
    setJwt(existing);
    if (existing) {
      void loadTokens(existing);
    }
  }, []);

  async function apiCall<T>(path: string, token: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as T;
  }

  async function loadTokens(currentToken: string = jwt) {
    if (!currentToken) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiCall<ApiToken[]>("/tokens", currentToken);
      setTokens(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }

  function saveJwtLocally(e: FormEvent) {
    e.preventDefault();
    window.localStorage.setItem(AUTH_TOKEN_KEY, jwt.trim());
    void loadTokens(jwt.trim());
  }

  async function generateToken(e: FormEvent) {
    e.preventDefault();
    if (!jwt.trim()) {
      setError("Add JWT first.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await apiCall<{ token: string }>("/tokens", jwt.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName, scopes: ["scan:write", "scan:read"] }),
      });
      setGeneratedToken(data.token);
      await loadTokens(jwt.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate token");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[#213552]">API Tokens</h1>
              <p className="mt-1 text-sm text-[#667896]">
                Configure admin JWT for dashboard operations and generate integration Bearer tokens.
              </p>
              <form onSubmit={saveJwtLocally} className="mt-4 flex flex-wrap items-center gap-2">
                <Input
                  value={jwt}
                  onChange={(e) => setJwt(e.target.value)}
                  placeholder="Paste admin JWT"
                  className="h-10 min-w-[360px] flex-1"
                />
                <Button type="submit" className="h-10" disabled={loading || !jwt.trim()}>
                  Save JWT
                </Button>
              </form>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-[#213552]">Token Management</h2>
                <form onSubmit={generateToken} className="flex items-center gap-2">
                  <Input
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    className="h-9 w-[220px]"
                  />
                  <Button type="submit" className="h-9" disabled={loading || !jwt.trim()}>
                    Generate New Token
                  </Button>
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                      <th className="py-2">Token Name</th>
                      <th className="py-2">Prefix</th>
                      <th className="py-2">Created</th>
                      <th className="py-2">Last Used</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr key={token.id} className="border-b border-[#eff3f8]">
                        <td className="py-2 text-[#2c3f5f]">{token.name}</td>
                        <td className="py-2 text-[#4f6386]">{token.token_prefix}</td>
                        <td className="py-2 text-[#4f6386]">{formatDate(token.created_at)}</td>
                        <td className="py-2 text-[#4f6386]">{formatDate(token.last_used_at)}</td>
                        <td className="py-2">
                          <Badge className={token.revoked_at ? "bg-gray-100 text-gray-700" : "bg-emerald-100 text-emerald-700"}>
                            {token.revoked_at ? "Revoked" : "Active"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {!tokens.length ? (
                      <tr>
                        <td colSpan={5} className="py-5 text-center text-[#6f80a0]">
                          No tokens yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {generatedToken ? (
                <div className="mt-3 rounded-lg border border-[#dce4f2] bg-[#f8fbff] p-2 text-xs text-[#314765]">
                  <p className="font-semibold">Generated token (shown only once)</p>
                  <code className="break-all">{generatedToken}</code>
                </div>
              ) : null}
            </Card>

            <Card className="rounded-xl p-4">
              <h3 className="text-lg font-semibold text-[#213552]">API usage example</h3>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-[#0f1729] p-3 text-xs text-[#d4e0ff]">
{`curl -X POST ${API_BASE}/uploads/scan-sync \
  -H "Authorization: Bearer <API_TOKEN>" \
  -F "files=@./sample.pdf"`}
              </pre>
            </Card>
          </div>
        </main>
      </div>

      {error ? (
        <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error}
        </div>
      ) : null}
    </div>
  );
}