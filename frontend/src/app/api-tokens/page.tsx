"use client";

import { FormEvent, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useI18n } from "@/hooks/use-i18n";
import { authenticatedJson } from "@/lib/auth";

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

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

export default function ApiTokensPage() {
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();
  const [tokenName, setTokenName] = useState("SIEM Integration");
  const [generatedToken, setGeneratedToken] = useState("");
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) {
      void loadTokens(token);
    }
  }, [token]);

  async function loadTokens(activeToken: string) {
    setLoading(true);
    setError("");
    try {
      const data = await authenticatedJson<ApiToken[]>(API_BASE, "/tokens", activeToken);
      setTokens(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }

  async function generateToken(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await authenticatedJson<{ token: string }>(API_BASE, "/tokens", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName, scopes: ["scan:write", "scan:read"] }),
      });
      setGeneratedToken(data.token);
      await loadTokens(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate token");
    } finally {
      setLoading(false);
    }
  }

  if (!ready || !token) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-app)] grid place-items-center text-[var(--color-text-soft)]">
        {t("common.preparing")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">{t("apiTokens.title")}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                {t("apiTokens.subtitle")}
              </p>
              <div className="mt-3 rounded-lg bg-[var(--color-surface-alt)] px-3 py-2 text-xs text-[var(--color-text-soft)]">
                {t("apiTokens.usageBanner")}
              </div>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-[var(--color-heading)]">{t("apiTokens.management")}</h2>
                <form onSubmit={generateToken} className="flex items-center gap-2">
                  <Input
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    className="h-9 w-[220px]"
                  />
                  <Button type="submit" className="h-9" disabled={loading}>
                    {t("apiTokens.generate")}
                  </Button>
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                      <th className="py-2">{t("apiTokens.table.tokenName")}</th>
                      <th className="py-2">{t("apiTokens.table.prefix")}</th>
                      <th className="py-2">{t("apiTokens.table.created")}</th>
                      <th className="py-2">{t("apiTokens.table.lastUsed")}</th>
                      <th className="py-2">{t("apiTokens.table.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--color-border-soft)]">
                        <td className="py-2 text-[var(--color-text)]">{item.name}</td>
                        <td className="py-2 text-[var(--color-text-soft)]">{item.token_prefix}</td>
                        <td className="py-2 text-[var(--color-text-soft)]">{formatDate(item.created_at)}</td>
                        <td className="py-2 text-[var(--color-text-soft)]">{formatDate(item.last_used_at)}</td>
                        <td className="py-2">
                          <Badge className={item.revoked_at ? "bg-gray-100 text-gray-700" : "bg-emerald-100 text-emerald-700"}>
                            {item.revoked_at ? t("apiTokens.status.revoked") : t("apiTokens.status.active")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {!tokens.length ? (
                      <tr>
                        <td colSpan={5} className="py-5 text-center text-[var(--color-text-muted)]">
                          {t("apiTokens.none")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {generatedToken ? (
                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-2 text-xs text-[var(--color-text)]">
                  <p className="font-semibold">{t("apiTokens.generatedOnce")}</p>
                  <code className="break-all">{generatedToken}</code>
                </div>
              ) : null}
            </Card>

            <Card className="rounded-xl p-4">
              <h3 className="text-lg font-semibold text-[var(--color-heading)]">{t("apiTokens.example")}</h3>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--color-code-bg)] p-3 text-xs text-[var(--color-code-text)]">
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
          {t("common.error")}: {error}
        </div>
      ) : null}
    </div>
  );
}
