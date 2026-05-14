"use client";

import { FormEvent, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Evidence = {
  category: string;
  severity: string;
  snippet: string;
  explanation: string;
};

type AnalysisResult = {
  risk_level: string;
  threat_score: number;
  content_classification: string;
  technical_explanation: string;
  evidences: Evidence[];
  suspicious_segments: string[];
  sanitized_text_preview: string;
  exfiltration_indicators: string[];
};

type ScanResponse = {
  document: {
    id: string;
    original_name: string;
    mime_type: string;
    extension: string;
    size_bytes: number;
    created_at: string;
  };
  scan: {
    id: string;
    status: string;
    threat_score: number | null;
    risk_level: string | null;
    summary: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  };
  result: AnalysisResult | null;
};

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

const MENU_ITEMS = [
  "Overview",
  "Scans",
  "Files",
  "API Tokens",
  "Policies",
  "Allow / Block Lists",
  "Integrations",
  "Audit Log",
  "Settings",
];

const SAMPLE_EVIDENCE = [
  {
    title: "Potential PII Detected",
    level: "high",
    snippet: "please contact John Smith at john.smith@acme.com",
  },
  {
    title: "Sensitive Policy Information",
    level: "medium",
    snippet: "vendor must adhere to retention policy of 7 years",
  },
  {
    title: "Secrets / Credentials",
    level: "critical",
    snippet: "api_key: sk_live_... endpoint: https://api.internal.acme.com/v1",
  },
];

function riskTone(risk?: string | null): string {
  switch ((risk ?? "").toLowerCase()) {
    case "critical":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

function severityTone(severity?: string): string {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "border-red-300 bg-red-50";
    case "high":
      return "border-rose-300 bg-rose-50";
    case "medium":
      return "border-amber-300 bg-amber-50";
    default:
      return "border-emerald-300 bg-emerald-50";
  }
}

function riskScoreColor(value: number): string {
  if (value >= 80) return "text-red-600";
  if (value >= 60) return "text-orange-600";
  if (value >= 35) return "text-amber-600";
  return "text-emerald-600";
}

function formatDate(input?: string): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

export default function Home() {
  const [sessionToken, setSessionToken] = useState("");
  const [tokenName, setTokenName] = useState("SIEM Integration");
  const [generatedToken, setGeneratedToken] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [scans, setScans] = useState<ScanResponse[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [selectedScan, setSelectedScan] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    const total = scans.length;
    const latest = scans[0];
    const avg = total
      ? Math.round(
          scans.reduce((acc, item) => acc + (item.scan.threat_score ?? 0), 0) / total,
        )
      : 0;
    return {
      total,
      avg,
      latestRisk: latest?.scan.risk_level ?? "low",
    };
  }, [scans]);

  const evidenceBlocks = useMemo(() => {
    if (!selectedScan?.result?.evidences?.length) {
      return SAMPLE_EVIDENCE.map((item) => ({
        title: item.title,
        severity: item.level,
        snippet: item.snippet,
      }));
    }
    return selectedScan.result.evidences.slice(0, 3).map((ev) => ({
      title: ev.category.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      severity: ev.severity,
      snippet: ev.snippet,
    }));
  }, [selectedScan]);

  async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as T;
  }

  async function loadScans() {
    const data = await apiCall<ScanResponse[]>("/scans");
    setScans(data);
    if (data.length > 0) {
      setSelectedScan(data[0]);
    }
  }

  async function loadTokens() {
    const data = await apiCall<ApiToken[]>("/tokens");
    setTokens(data);
  }

  async function handleGenerateToken(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await apiCall<{ token: string }>("/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName, scopes: ["scan:write", "scan:read"] }),
      });
      setGeneratedToken(data.token);
      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Token generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleScanUpload(e: FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("files", file));
      const data = await apiCall<ScanResponse[]>("/uploads/scan-sync", {
        method: "POST",
        body: form,
      });
      setScans((prev) => [...data, ...prev]);
      setSelectedScan(data[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload/analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function bootstrap() {
    if (!sessionToken) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadScans(), loadTokens()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[238px] flex-col border-r border-[#e6ebf3] bg-white lg:flex">
          <div className="px-6 pb-4 pt-5">
            <p className="text-[33px] font-extrabold leading-none text-[var(--color-primary)]">NEXUS</p>
            <p className="text-xs font-semibold tracking-wide text-[#8292af]">LLM SHIELD</p>
          </div>
          <nav className="px-3">
            {MENU_ITEMS.map((item, idx) => (
              <div
                key={item}
                className={`mb-1 flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  idx === 0 ? "bg-[#edf3ff] text-[var(--color-primary)]" : "text-[#4c5f82]"
                }`}
              >
                <span className="inline-block h-4 w-4 rounded-full border border-current opacity-80" />
                {item}
              </div>
            ))}
          </nav>
          <div className="mt-auto p-3">
            <Card className="rounded-xl bg-[#f5f8ff] p-3">
              <p className="text-sm font-semibold text-[var(--color-primary)]">Enterprise Plan</p>
              <p className="mt-1 text-xs text-[#6a7a95]">Unlimited scans</p>
            </Card>
          </div>
        </aside>

        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px]">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e6ebf3] bg-white px-4 py-3">
              <div className="flex min-w-[300px] items-center gap-3">
                <span className="text-sm font-semibold text-[#4c5f82]">Tenant</span>
                <div className="rounded-lg border border-[#dce4f2] bg-[#f8faff] px-3 py-2 text-sm text-[#334766]">
                  Acme Corporation
                </div>
              </div>
              <div className="flex min-w-[330px] items-center gap-2">
                <Input
                  placeholder="Paste JWT to enable API actions"
                  value={sessionToken}
                  onChange={(e) => setSessionToken(e.target.value)}
                  className="h-9"
                />
                <Button className="h-9" onClick={bootstrap} disabled={loading || !sessionToken}>
                  Connect
                </Button>
              </div>
            </header>

            <div className="grid gap-4 xl:grid-cols-[1.7fr_0.8fr]">
              <section className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="rounded-xl p-4">
                    <p className="text-sm font-semibold text-[#293b57]">Threat Score</p>
                    <p className="mt-3 text-4xl font-bold text-[var(--color-primary)]">{stats.avg}</p>
                    <p className="text-xs text-[#7a89a5]">/ 100</p>
                  </Card>
                  <Card className="rounded-xl p-4">
                    <p className="text-sm font-semibold text-[#293b57]">Risk Level</p>
                    <Badge className={`mt-3 ${riskTone(stats.latestRisk)}`}>
                      {stats.latestRisk.toUpperCase()}
                    </Badge>
                    <p className="mt-2 text-xs text-[#7a89a5]">Current environment risk status</p>
                  </Card>
                  <Card className="rounded-xl p-4">
                    <p className="text-sm font-semibold text-[#293b57]">Files Scanned</p>
                    <p className="mt-3 text-4xl font-bold text-[#182746]">{stats.total.toLocaleString()}</p>
                    <p className="text-xs text-[#7a89a5]">Total analyzed files</p>
                  </Card>
                </div>

                <Card className="rounded-xl p-4">
                  <form onSubmit={handleScanUpload}>
                    <label className="flex min-h-[145px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#8ea9de] bg-[#f8fbff] px-4 text-center">
                      <span className="text-2xl text-[var(--color-primary)]">+</span>
                      <span className="mt-2 text-2xl font-semibold text-[var(--color-primary)]">
                        Drag and drop files to scan
                      </span>
                      <span className="mt-1 text-sm text-[#6e7f9b]">
                        Supports PDF, DOCX, TXT, MD, HTML, CSV, and images
                      </span>
                      <input type="file" className="hidden" multiple onChange={(e) => setFiles(e.target.files)} />
                      <Button type="submit" className="mt-4" disabled={loading || !files || files.length === 0}>
                        Choose Files
                      </Button>
                    </label>
                  </form>
                </Card>

                <Card className="rounded-xl p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-[#213552]">API Token Management</h2>
                    <form onSubmit={handleGenerateToken} className="flex items-center gap-2">
                      <Input
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        className="h-9 w-[180px]"
                      />
                      <Button type="submit" className="h-9" disabled={loading || !sessionToken}>
                        Generate New Token
                      </Button>
                    </form>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
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
                        {(tokens.length
                          ? tokens
                          : [
                              {
                                id: "sample",
                                name: "CI/CD Pipeline",
                                token_prefix: "nxlm_****************",
                                scopes: [],
                                last_used_at: null,
                                revoked_at: null,
                                created_at: new Date().toISOString(),
                              },
                            ]
                        ).map((token) => (
                          <tr key={token.id} className="border-b border-[#eff3f8]">
                            <td className="py-2 text-[#2c3f5f]">{token.name}</td>
                            <td className="py-2 text-[#4f6386]">{token.token_prefix}</td>
                            <td className="py-2 text-[#4f6386]">{formatDate(token.created_at)}</td>
                            <td className="py-2 text-[#4f6386]">{formatDate(token.last_used_at ?? undefined)}</td>
                            <td className="py-2">
                              <Badge
                                className={
                                  token.revoked_at
                                    ? "bg-gray-100 text-gray-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }
                              >
                                {token.revoked_at ? "Revoked" : "Active"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
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
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-[#213552]">Recent Scans</h2>
                    <Button variant="outline" onClick={loadScans} disabled={loading || !sessionToken}>
                      Refresh
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[730px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                          <th className="py-2">File Name</th>
                          <th className="py-2">Risk Level</th>
                          <th className="py-2">Threat Score</th>
                          <th className="py-2">Scanned At</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scans.map((scan) => (
                          <tr key={scan.scan.id} className="border-b border-[#eff3f8]">
                            <td className="py-2 text-[#2c3f5f]">{scan.document.original_name}</td>
                            <td className="py-2">
                              <Badge className={riskTone(scan.scan.risk_level)}>
                                {(scan.scan.risk_level ?? "unknown").toUpperCase()}
                              </Badge>
                            </td>
                            <td className={`py-2 font-semibold ${riskScoreColor(scan.scan.threat_score ?? 0)}`}>
                              {scan.scan.threat_score ?? 0} / 100
                            </td>
                            <td className="py-2 text-[#4f6386]">{formatDate(scan.scan.created_at)}</td>
                            <td className="py-2">
                              <Button variant="ghost" onClick={() => setSelectedScan(scan)}>
                                View Report
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {!scans.length ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-[#7586a3]">
                              No scan data yet. Connect a JWT and upload files.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>

              <section className="space-y-4">
                <Card className="rounded-xl p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-[#213552]">Analysis Evidence</h2>
                  </div>
                  <div className="space-y-3">
                    {evidenceBlocks.map((item, index) => (
                      <div
                        key={`${item.title}-${index}`}
                        className={`rounded-lg border p-3 ${severityTone(item.severity)}`}
                      >
                        <p className="text-sm font-semibold text-[#213552]">{item.title}</p>
                        <p className="mt-1 text-xs text-[#4f6386]">{item.snippet}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="text-2xl font-semibold text-[#213552]">Sanitized Export</h2>
                  <p className="mt-2 text-sm text-[#667896]">
                    Export a sanitized text version with sensitive instructions removed.
                  </p>
                  <Button
                    className="mt-4 w-full bg-[#0ea56d] hover:bg-[#0b915f]"
                    disabled={!selectedScan?.scan.id}
                    onClick={() =>
                      selectedScan?.scan.id &&
                      window.open(`${API_BASE}/scans/${selectedScan.scan.id}/sanitized.txt`, "_blank")
                    }
                  >
                    Export Sanitized File
                  </Button>
                </Card>
              </section>
            </div>
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