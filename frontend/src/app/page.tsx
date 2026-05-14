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
      latestRisk: latest?.scan.risk_level ?? "-",
    };
  }, [scans]);

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
      setError(err instanceof Error ? err.message : "Falha ao gerar token");
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
      setError(err instanceof Error ? err.message : "Falha no upload/análise");
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
      setError(err instanceof Error ? err.message : "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1100px_500px_at_10%_-5%,rgba(47,111,255,0.18),transparent),radial-gradient(900px_450px_at_95%_0,rgba(5,168,124,0.18),transparent),linear-gradient(180deg,#f4f9ff_0%,#fdfefe_40%,#f7fbff_100%)] text-[var(--color-text)]">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-5 py-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_45px_-35px_rgba(15,48,106,0.6)] backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-text-soft)]">Nexus LLM Shield</p>
            <h1 className="text-3xl font-bold tracking-tight">Prompt Injection Defense Center</h1>
          </div>
          <div className="flex w-full gap-2 sm:w-[520px]">
            <Input
              placeholder="Cole seu JWT de sessão"
              value={sessionToken}
              onChange={(e) => setSessionToken(e.target.value)}
            />
            <Button onClick={bootstrap} disabled={loading || !sessionToken}>Conectar</Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-[var(--color-text-soft)]">Threat Score Médio</p>
            <p className="mt-2 text-3xl font-bold text-[var(--color-primary)]">{stats.avg}</p>
          </Card>
          <Card>
            <p className="text-sm text-[var(--color-text-soft)]">Risco Mais Recente</p>
            <Badge className={`mt-3 ${riskTone(stats.latestRisk)} w-fit`}>{stats.latestRisk.toUpperCase()}</Badge>
          </Card>
          <Card>
            <p className="text-sm text-[var(--color-text-soft)]">Arquivos Escaneados</p>
            <p className="mt-2 text-3xl font-bold text-[var(--color-emerald)]">{stats.total}</p>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <h2 className="text-lg font-semibold">Upload e Análise Imediata</h2>
            <p className="mt-1 text-sm text-[var(--color-text-soft)]">Suporta PDF, DOCX, PPTX, XLSX, CSV, TXT, HTML, MD e imagens com OCR.</p>
            <form onSubmit={handleScanUpload} className="mt-4 space-y-3">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-border-strong)] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] px-4 text-center">
                <span className="text-sm font-medium">Arraste arquivos ou clique para selecionar</span>
                <span className="text-xs text-[var(--color-text-soft)]">Upload múltiplo habilitado</span>
                <input type="file" className="hidden" multiple onChange={(e) => setFiles(e.target.files)} />
              </label>
              <Button type="submit" disabled={loading || !files || files.length === 0}>Analisar Arquivos</Button>
            </form>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">API Bearer Token</h2>
            <p className="mt-1 text-sm text-[var(--color-text-soft)]">Crie token para integração com SIEM, DLP, ECM ou pipelines internos.</p>
            <form onSubmit={handleGenerateToken} className="mt-4 space-y-3">
              <Input value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
              <Button type="submit" disabled={loading || !sessionToken}>Gerar Token</Button>
            </form>
            {generatedToken ? (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-xs">
                <p className="mb-1 font-semibold">Token gerado (mostrado apenas agora)</p>
                <code className="break-all text-[11px]">{generatedToken}</code>
              </div>
            ) : null}
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <Card className="overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Scans Recentes</h2>
              <Button variant="outline" onClick={loadScans} disabled={loading || !sessionToken}>Atualizar</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[var(--color-text-soft)]">
                    <th className="py-2">Arquivo</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Risco</th>
                    <th className="py-2">Score</th>
                    <th className="py-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan.scan.id} className="border-b border-[var(--color-border)]/70">
                      <td className="py-2 pr-3">{scan.document.original_name}</td>
                      <td className="py-2">{scan.scan.status}</td>
                      <td className="py-2">
                        <Badge className={riskTone(scan.scan.risk_level)}>{(scan.scan.risk_level ?? "-").toUpperCase()}</Badge>
                      </td>
                      <td className="py-2">{scan.scan.threat_score ?? "-"}</td>
                      <td className="py-2">
                        <Button variant="ghost" onClick={() => setSelectedScan(scan)}>Detalhar</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Evidências Técnicas</h2>
            {selectedScan?.result ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-[var(--color-text-soft)]">{selectedScan.result.technical_explanation}</p>
                <div className="space-y-2">
                  {selectedScan.result.evidences.slice(0, 5).map((ev, index) => (
                    <div key={`${ev.category}-${index}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-soft)]">{ev.category} • {ev.severity}</p>
                      <p className="mt-1 text-sm">{ev.snippet}</p>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `${API_BASE}/scans/${selectedScan.scan.id}/sanitized.txt`,
                      "_blank",
                    )
                  }
                >
                  Exportar Sanitização
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-text-soft)]">Selecione um scan concluído para ver evidências e sanitização.</p>
            )}
          </Card>
        </section>

        <section>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tokens Ativos</h2>
              <Button variant="outline" onClick={loadTokens} disabled={loading || !sessionToken}>Recarregar</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tokens.map((token) => (
                <Badge key={token.id} className="bg-[var(--color-surface-alt)] text-[var(--color-text)]">
                  {token.name} ({token.token_prefix})
                </Badge>
              ))}
            </div>
          </Card>
        </section>

        {error ? (
          <Card className="border-[var(--color-danger)] bg-red-50 text-red-700">
            <p className="text-sm font-medium">Erro: {error}</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

