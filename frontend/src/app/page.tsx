"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useI18n } from "@/hooks/use-i18n";
import { authenticatedJson } from "@/lib/auth";

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

type QuarantineItem = {
  scan_id: string;
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
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();
  const [files, setFiles] = useState<FileList | null>(null);
  const [scans, setScans] = useState<ScanResponse[]>([]);
  const [selectedScan, setSelectedScan] = useState<ScanResponse | null>(null);
  const [pendingQuarantineCount, setPendingQuarantineCount] = useState(0);
  const [retryingScanId, setRetryingScanId] = useState<string | null>(null);
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
    return (selectedScan?.result?.evidences ?? []).slice(0, 3).map((ev) => ({
      title: ev.category.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      severity: ev.severity,
      snippet: ev.snippet,
    }));
  }, [selectedScan]);

  async function loadScans() {
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const data = await authenticatedJson<ScanResponse[]>(API_BASE, "/scans", token);
      setScans(data);
      if (data.length > 0) {
        setSelectedScan(data[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scans");
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingQuarantineCount(activeToken: string) {
    try {
      const data = await authenticatedJson<QuarantineItem[]>(
        API_BASE,
        "/quarantine?status=pending_review",
        activeToken,
      );
      setPendingQuarantineCount(data.length);
    } catch {
      setPendingQuarantineCount(0);
    }
  }

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPendingQuarantineCount(token);
  }, [token]);

  async function handleScanUpload(e: FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0 || !token) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("files", file));
      const data = await authenticatedJson<ScanResponse[]>(API_BASE, "/uploads/scan-sync", token, {
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

  async function retryScan(scanId: string) {
    if (!token) return;
    setRetryingScanId(scanId);
    setError("");
    try {
      const retried = await authenticatedJson<ScanResponse>(API_BASE, `/scans/${scanId}/retry`, token, {
        method: "POST",
      });
      setScans((prev) => prev.map((item) => (item.scan.id === scanId ? retried : item)));
      if (selectedScan?.scan.id === scanId) {
        setSelectedScan(retried);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry scan");
    } finally {
      setRetryingScanId(null);
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
          <div className="mx-auto w-full max-w-[1380px]">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
              <div className="flex min-w-[300px] items-center gap-3">
                <span className="text-sm font-semibold text-[var(--color-text-soft)]">{t("overview.tenant")}</span>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text)]">
                  Acme Corporation
                </div>
              </div>
            </header>

            <Card className="mb-4 rounded-xl border-[var(--color-warn-border)] bg-[var(--color-warn-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-warn-text)]">{t("overview.pendingReviews")}</p>
                  <p className="mt-1 text-3xl font-bold text-[var(--color-warn-text)]">{pendingQuarantineCount}</p>
                  <p className="mt-1 text-xs text-[var(--color-warn-soft)]">
                    {t("overview.pendingReviewsDesc")}
                  </p>
                </div>
                <Link href="/quarantine">
                  <Button className="bg-[var(--color-primary-strong)] hover:bg-[var(--color-primary)]">{t("overview.openQueue")}</Button>
                </Link>
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.7fr_0.8fr]">
              <section className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="rounded-xl p-4">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{t("overview.threatScore")}</p>
                    <p className="mt-3 text-4xl font-bold text-[var(--color-primary)]">{stats.avg}</p>
                    <p className="text-xs text-[var(--color-text-soft)]">/ 100</p>
                  </Card>
                  <Card className="rounded-xl p-4">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{t("overview.riskLevel")}</p>
                    <Badge className={`mt-3 ${riskTone(stats.latestRisk)}`}>
                      {stats.latestRisk.toUpperCase()}
                    </Badge>
                    <p className="mt-2 text-xs text-[var(--color-text-soft)]">{t("overview.environmentRisk")}</p>
                  </Card>
                  <Card className="rounded-xl p-4">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{t("overview.filesScanned")}</p>
                    <p className="mt-3 text-4xl font-bold text-[var(--color-text)]">{stats.total.toLocaleString()}</p>
                    <p className="text-xs text-[var(--color-text-soft)]">{t("overview.totalAnalyzedFiles")}</p>
                  </Card>
                </div>

                <Card className="rounded-xl p-4">
                  <form onSubmit={handleScanUpload}>
                    <label className="flex min-h-[145px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-4 text-center">
                      <span className="text-2xl text-[var(--color-primary)]">+</span>
                      <span className="mt-2 text-2xl font-semibold text-[var(--color-primary)]">
                        {t("overview.dragDrop")}
                      </span>
                      <span className="mt-1 text-sm text-[var(--color-text-soft)]">
                        {t("overview.supportedFormats")}
                      </span>
                      <input type="file" className="hidden" multiple onChange={(e) => setFiles(e.target.files)} />
                      <Button type="submit" className="mt-4" disabled={loading || !files || files.length === 0}>
                        {t("overview.chooseFiles")}
                      </Button>
                    </label>
                  </form>
                </Card>

                <Card className="rounded-xl p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-[var(--color-heading)]">{t("overview.recentScans")}</h2>
                    <Button variant="outline" onClick={loadScans} disabled={loading}>
                      {t("common.refresh")}
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[730px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                          <th className="py-2">File Name</th>
                          <th className="py-2">Risk Level</th>
                          <th className="py-2">Threat Score</th>
                          <th className="py-2">Scanned At</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scans.map((scan) => (
                          <tr key={scan.scan.id} className="border-b border-[var(--color-border-soft)]">
                            <td className="py-2 text-[var(--color-text)]">{scan.document.original_name}</td>
                            <td className="py-2">
                              <Badge className={riskTone(scan.scan.risk_level)}>
                                {(scan.scan.risk_level ?? "unknown").toUpperCase()}
                              </Badge>
                            </td>
                            <td className={`py-2 font-semibold ${riskScoreColor(scan.scan.threat_score ?? 0)}`}>
                              {scan.scan.threat_score ?? 0} / 100
                            </td>
                            <td className="py-2 text-[var(--color-text-soft)]">{formatDate(scan.scan.created_at)}</td>
                            <td className="py-2">
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" onClick={() => setSelectedScan(scan)}>
                                  {t("overview.viewReport")}
                                </Button>
                                {scan.scan.status === "failed" ? (
                                  <Button
                                    variant="outline"
                                    disabled={retryingScanId === scan.scan.id}
                                    onClick={() => void retryScan(scan.scan.id)}
                                  >
                                    {retryingScanId === scan.scan.id ? t("overview.retrying") : t("overview.retry")}
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!scans.length ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-[var(--color-text-soft)]">
                              {t("overview.noScans")}
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
                    <h2 className="text-2xl font-semibold text-[var(--color-heading)]">{t("overview.analysisEvidence")}</h2>
                  </div>
                  <div className="space-y-3">
                    {evidenceBlocks.length ? (
                      evidenceBlocks.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className={`rounded-lg border p-3 ${severityTone(item.severity)}`}
                        >
                          <p className="text-sm font-semibold text-[var(--color-heading)]">{item.title}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-soft)]">{item.snippet}</p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-3 text-sm text-[var(--color-text-soft)]">
                        {t("overview.noEvidence")}
                      </p>
                    )}
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="text-2xl font-semibold text-[var(--color-heading)]">{t("overview.sanitizedExport")}</h2>
                  <p className="mt-2 text-sm text-[var(--color-text-soft)]">
                    {t("overview.sanitizedDesc")}
                  </p>
                  <Button
                    className="mt-4 w-full bg-[var(--color-emerald)] hover:bg-[var(--color-emerald-strong)]"
                    disabled={!selectedScan?.scan.id}
                    onClick={() =>
                      selectedScan?.scan.id &&
                      window.open(`${API_BASE}/scans/${selectedScan.scan.id}/sanitized.txt`, "_blank")
                    }
                  >
                    {t("overview.exportSanitized")}
                  </Button>
                </Card>
              </section>
            </div>
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
