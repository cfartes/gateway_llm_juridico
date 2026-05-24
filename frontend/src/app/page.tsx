"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { authenticatedJson } from "@/lib/auth";

type SecurityGate = {
  safe_to_continue: boolean;
  policy_action: string;
  policy_reason: string;
  risk_level: string;
  threat_score: number;
  evidence_count: number;
};

type DueDiligenceCriterion = {
  criterion: string;
  weight_percent: number;
  status: string;
  impact_points: number;
  note: string;
};

type DueDiligenceResponse = {
  security_gate: SecurityGate;
  cnpj: string | null;
  cnpj_valid: boolean;
  score: number | null;
  recommendation: string | null;
  criteria: DueDiligenceCriterion[];
  summary: string;
};

type BulkItemResult = {
  cnpj: string;
  valid: boolean;
  registration_status: string;
  score: number | null;
  recommendation: string;
};

type BulkDistribution = {
  active: number;
  inactive: number;
  attention: number;
  recommended: number;
  desist: number;
};

type BulkUpdateResponse = {
  security_gate: SecurityGate;
  total_extracted: number;
  total_valid: number;
  total_invalid: number;
  average_score: number | null;
  distribution: BulkDistribution;
  items: BulkItemResult[];
  summary: string;
};

type InvoiceValidationResponse = {
  security_gate: SecurityGate;
  access_key: string | null;
  access_key_valid: boolean;
  emitter_cnpj: string | null;
  emitter_cnpj_valid: boolean;
  sefaz_status: string;
  recommendation: string;
  summary: string;
};

type ScanLite = {
  document: { original_name: string };
  scan: {
    id: string;
    risk_level: string | null;
    threat_score: number | null;
    created_at: string;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function gateTone(gate?: SecurityGate): string {
  if (!gate) return "bg-slate-100 text-slate-700";
  if (!gate.safe_to_continue) return "bg-red-100 text-red-700";
  if (gate.risk_level.toLowerCase() === "high" || gate.risk_level.toLowerCase() === "critical") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-emerald-100 text-emerald-700";
}

function formatDate(input: string): string {
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return input;
  return dt.toLocaleString();
}

function resolveErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const raw = (err.message || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    // keep raw
  }
  return raw;
}

async function parseResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (parsed?.detail && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // keep plain text
    }
    return text;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const { token, ready } = useAuthGuard();

  const [contractFile, setContractFile] = useState<File | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  const [contractResult, setContractResult] = useState<DueDiligenceResponse | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkUpdateResponse | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<InvoiceValidationResponse | null>(null);

  const [latestScans, setLatestScans] = useState<ScanLite[]>([]);

  const [contractLoading, setContractLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [error, setError] = useState("");

  const historyRiskSummary = useMemo(() => {
    const total = latestScans.length;
    if (!total) return "Sem historico recente";
    const avg = Math.round(
      latestScans.reduce((acc, item) => acc + (item.scan.threat_score ?? 0), 0) / total,
    );
    return `Media de risco dos ultimos ${total} scans: ${avg}/100`;
  }, [latestScans]);

  useEffect(() => {
    async function loadHistory() {
      if (!token) return;
      setHistoryLoading(true);
      try {
        const data = await authenticatedJson<ScanLite[]>(API_BASE, "/scans", token);
        setLatestScans(data.slice(0, 5));
      } catch {
        setLatestScans([]);
      } finally {
        setHistoryLoading(false);
      }
    }
    void loadHistory();
  }, [token]);

  async function postMultipart<T>(path: string, file: File): Promise<T> {
    if (!token) throw new Error("Sessao expirada. Faca login novamente.");
    const form = new FormData();
    form.append("file", file);

    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!response.ok) {
      throw new Error(await parseResponseError(response, "Falha na requisicao"));
    }
    return (await response.json()) as T;
  }

  async function runDueDiligence() {
    if (!contractFile) {
      setError("Selecione um contrato antes de executar a due diligence.");
      return;
    }
    setError("");
    setContractLoading(true);
    try {
      const data = await postMultipart<DueDiligenceResponse>("/cnpj-validation/due-diligence", contractFile);
      setContractResult(data);
    } catch (err) {
      setError(resolveErrorMessage(err, "Falha na due diligence"));
    } finally {
      setContractLoading(false);
    }
  }

  async function runBulkUpdate() {
    if (!bulkFile) {
      setError("Selecione um arquivo de lote antes de executar a atualizacao.");
      return;
    }
    setError("");
    setBulkLoading(true);
    try {
      const data = await postMultipart<BulkUpdateResponse>("/cnpj-validation/bulk-update", bulkFile);
      setBulkResult(data);
    } catch (err) {
      setError(resolveErrorMessage(err, "Falha no processamento em lote"));
    } finally {
      setBulkLoading(false);
    }
  }

  async function runInvoiceValidation() {
    if (!invoiceFile) {
      setError("Selecione uma NF antes de validar.");
      return;
    }
    setError("");
    setInvoiceLoading(true);
    try {
      const data = await postMultipart<InvoiceValidationResponse>("/cnpj-validation/invoice-validation", invoiceFile);
      setInvoiceResult(data);
    } catch (err) {
      setError(resolveErrorMessage(err, "Falha na validacao fiscal"));
    } finally {
      setInvoiceLoading(false);
    }
  }

  if (!ready || !token) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-app)] grid place-items-center text-[var(--color-text-soft)]">
        Preparando seu workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1180px] space-y-4">
            <Card className="rounded-xl p-5">
              <h1 className="text-2xl font-bold text-[var(--color-heading)]">LLM Shield - Validacao inteligente de CNPJ e NF</h1>
              <p className="mt-2 text-sm text-[var(--color-text-soft)]">
                Fluxo unico: Seguranca anti-injection primeiro, depois extracao de dados e decisao de negocio.
              </p>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">{historyRiskSummary}</p>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">1) Contrato e Due Diligence</h2>
                <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                  Upload de contrato para extrair CNPJ, aplicar score e sugerir aprovacao.
                </p>
                <input
                  type="file"
                  className="mt-3 block w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
                />
                <Button className="mt-3 w-full" onClick={() => void runDueDiligence()} disabled={contractLoading}>
                  {contractLoading ? "Processando..." : "Executar due diligence"}
                </Button>

                {contractResult ? (
                  <div className="mt-3 space-y-2">
                    <Badge className={gateTone(contractResult.security_gate)}>
                      Gate: {contractResult.security_gate.safe_to_continue ? "Liberado" : "Bloqueado"}
                    </Badge>
                    <p className="text-xs text-[var(--color-text-soft)]">{contractResult.summary}</p>
                    <p className="text-sm"><strong>CNPJ:</strong> {contractResult.cnpj ?? "Nao encontrado"}</p>
                    <p className="text-sm"><strong>Score:</strong> {contractResult.score ?? "-"}</p>
                    <p className="text-sm"><strong>Recomendacao:</strong> {contractResult.recommendation ?? "-"}</p>
                    {contractResult.criteria?.length ? (
                      <div className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-2">
                        <p className="text-xs font-semibold text-[var(--color-text-muted)]">Matriz de score</p>
                        {contractResult.criteria.map((item) => (
                          <p key={item.criterion} className="mt-1 text-xs text-[var(--color-text-soft)]">
                            {item.criterion}: {item.impact_points}/{item.weight_percent} ({item.status})
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>

              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">2) Atualizacao Cadastral em Lote</h2>
                <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                  Upload de CSV/XLSX/TXT com CNPJs para saneamento da base.
                </p>
                <input
                  type="file"
                  className="mt-3 block w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
                />
                <Button className="mt-3 w-full" onClick={() => void runBulkUpdate()} disabled={bulkLoading}>
                  {bulkLoading ? "Processando..." : "Processar lote"}
                </Button>

                {bulkResult ? (
                  <div className="mt-3 space-y-2">
                    <Badge className={gateTone(bulkResult.security_gate)}>
                      Gate: {bulkResult.security_gate.safe_to_continue ? "Liberado" : "Bloqueado"}
                    </Badge>
                    <p className="text-xs text-[var(--color-text-soft)]">{bulkResult.summary}</p>
                    <p className="text-sm"><strong>Total:</strong> {bulkResult.total_extracted}</p>
                    <p className="text-sm"><strong>Validos:</strong> {bulkResult.total_valid}</p>
                    <p className="text-sm"><strong>Invalidos:</strong> {bulkResult.total_invalid}</p>
                    <p className="text-sm"><strong>Media:</strong> {bulkResult.average_score ?? "-"}</p>
                    {bulkResult.items.length ? (
                      <div className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-2">
                        <p className="text-xs font-semibold text-[var(--color-text-muted)]">Primeiros registros</p>
                        {bulkResult.items.slice(0, 4).map((item) => (
                          <p key={`${item.cnpj}-${item.recommendation}`} className="mt-1 text-xs text-[var(--color-text-soft)]">
                            {item.cnpj}: {item.recommendation}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>

              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">3) Validacao de Nota Fiscal</h2>
                <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                  Upload de NF para extrair chave de acesso e validar status fiscal.
                </p>
                <input
                  type="file"
                  className="mt-3 block w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                />
                <Button className="mt-3 w-full" onClick={() => void runInvoiceValidation()} disabled={invoiceLoading}>
                  {invoiceLoading ? "Validando..." : "Validar NF"}
                </Button>

                {invoiceResult ? (
                  <div className="mt-3 space-y-2">
                    <Badge className={gateTone(invoiceResult.security_gate)}>
                      Gate: {invoiceResult.security_gate.safe_to_continue ? "Liberado" : "Bloqueado"}
                    </Badge>
                    <p className="text-xs text-[var(--color-text-soft)]">{invoiceResult.summary}</p>
                    <p className="text-sm"><strong>Status SEFAZ:</strong> {invoiceResult.sefaz_status}</p>
                    <p className="text-sm"><strong>Chave:</strong> {invoiceResult.access_key ?? "Nao encontrada"}</p>
                    <p className="text-sm"><strong>CNPJ emitente:</strong> {invoiceResult.emitter_cnpj ?? "Nao encontrado"}</p>
                    <p className="text-sm"><strong>Recomendacao:</strong> {invoiceResult.recommendation}</p>
                  </div>
                ) : null}
              </Card>
            </div>

            <Card className="rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">Historico recente de seguranca</h2>
                <Button
                  variant="outline"
                  disabled={historyLoading}
                  onClick={async () => {
                    if (!token) return;
                    setHistoryLoading(true);
                    try {
                      const data = await authenticatedJson<ScanLite[]>(API_BASE, "/scans", token);
                      setLatestScans(data.slice(0, 5));
                    } catch {
                      setLatestScans([]);
                    } finally {
                      setHistoryLoading(false);
                    }
                  }}
                >
                  {historyLoading ? "Atualizando..." : "Atualizar"}
                </Button>
              </div>

              <div className="overflow-auto rounded-lg border border-[var(--color-border-soft)]">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-[var(--color-surface-alt)]">
                    <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                      <th className="px-3 py-2">Arquivo</th>
                      <th className="px-3 py-2">Risco</th>
                      <th className="px-3 py-2">Score</th>
                      <th className="px-3 py-2">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestScans.map((item) => (
                      <tr key={item.scan.id} className="border-b border-[var(--color-border-soft)]">
                        <td className="px-3 py-2">{item.document.original_name}</td>
                        <td className="px-3 py-2">{(item.scan.risk_level ?? "unknown").toUpperCase()}</td>
                        <td className="px-3 py-2">{item.scan.threat_score ?? 0}/100</td>
                        <td className="px-3 py-2 text-[var(--color-text-soft)]">{formatDate(item.scan.created_at)}</td>
                      </tr>
                    ))}
                    {!latestScans.length ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-[var(--color-text-soft)]">
                          Nenhum scan recente.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </main>
      </div>

      {error ? (
        <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Erro: {error}
        </div>
      ) : null}
    </div>
  );
}
