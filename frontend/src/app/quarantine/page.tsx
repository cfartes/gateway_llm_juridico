"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
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

type QuarantineItem = {
  scan_id: string;
  file_id: string;
  file_name: string;
  policy_action: string | null;
  policy_reason: string | null;
  quarantine_status: string | null;
  threat_score: number | null;
  risk_level: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  rag_markdown_available: boolean;
  created_at: string;
  updated_at: string;
};

type QuarantineDetail = QuarantineItem & {
  result: AnalysisResult | null;
  quarantine_note: string | null;
};

type ReviewResponse = {
  ok: boolean;
  item: QuarantineDetail;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const FILTERS = [
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "not_required", label: "Not Required" },
  { value: "all", label: "All" },
];

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

function statusTone(status?: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "bg-emerald-100 text-emerald-700";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "pending_review":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

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
      return "border-orange-300 bg-orange-50";
    case "medium":
      return "border-amber-300 bg-amber-50";
    default:
      return "border-emerald-300 bg-emerald-50";
  }
}

export default function QuarantinePage() {
  const { token, ready } = useAuthGuard();
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [rows, setRows] = useState<QuarantineItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<QuarantineDetail | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [generateRag, setGenerateRag] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  const canReview = useMemo(() => detail?.quarantine_status === "pending_review", [detail]);

  const loadList = useCallback(async (activeToken: string, status: string) => {
    setLoadingList(true);
    setError("");
    try {
      const data = await authenticatedJson<QuarantineItem[]>(
        API_BASE,
        `/quarantine?status=${encodeURIComponent(status)}`,
        activeToken,
      );
      setRows(data);
      if (data.length > 0) {
        if (!data.find((row) => row.scan_id === selectedId)) {
          setSelectedId(data[0].scan_id);
        }
      } else {
        setSelectedId("");
        setDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quarantine queue");
    } finally {
      setLoadingList(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (activeToken: string, scanId: string) => {
    setLoadingDetail(true);
    setError("");
    try {
      const data = await authenticatedJson<QuarantineDetail>(API_BASE, `/quarantine/${scanId}`, activeToken);
      setDetail(data);
      setReviewNote(data.quarantine_note ?? "");
      setGenerateRag(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quarantine detail");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList(token, statusFilter);
  }, [token, statusFilter, loadList]);

  useEffect(() => {
    if (!token || !selectedId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDetail(token, selectedId);
  }, [token, selectedId, loadDetail]);

  async function review(action: "approve" | "reject") {
    if (!token || !detail) return;
    setReviewing(true);
    setError("");
    try {
      const data = await authenticatedJson<ReviewResponse>(API_BASE, `/quarantine/${detail.scan_id}/review`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: reviewNote || null,
          generate_rag_md: generateRag,
        }),
      });
      setDetail(data.item);
      await loadList(token, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit quarantine review");
    } finally {
      setReviewing(false);
    }
  }

  if (!ready || !token) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-app)] grid place-items-center text-[var(--color-text-soft)]">
        Preparing your workspace...
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-[var(--color-heading)]">Quarantine Queue</h1>
                  <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                    Review and decide if suspicious documents can move forward to sanitized RAG ingestion.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]"
                  >
                    {FILTERS.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" onClick={() => token && loadList(token, statusFilter)} disabled={loadingList}>
                    Refresh
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <Card className="rounded-xl p-4">
                <h2 className="mb-3 text-xl font-semibold text-[var(--color-heading)]">Queue Items</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                        <th className="py-2">File</th>
                        <th className="py-2">Risk</th>
                        <th className="py-2">Score</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.scan_id}
                          className={`cursor-pointer border-b border-[var(--color-border-soft)] ${selectedId === row.scan_id ? "bg-[var(--color-surface-alt)]" : ""}`}
                          onClick={() => setSelectedId(row.scan_id)}
                        >
                          <td className="py-2 text-[var(--color-text)]">{row.file_name}</td>
                          <td className="py-2">
                            <Badge className={riskTone(row.risk_level)}>{(row.risk_level ?? "unknown").toUpperCase()}</Badge>
                          </td>
                          <td className="py-2 text-[var(--color-text)]">{row.threat_score ?? 0}</td>
                          <td className="py-2">
                            <Badge className={statusTone(row.quarantine_status)}>
                              {(row.quarantine_status ?? "unknown").toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-2 text-[var(--color-text-soft)]">{formatDate(row.updated_at)}</td>
                        </tr>
                      ))}
                      {!rows.length ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-[var(--color-text-soft)]">
                            No items for this filter.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="rounded-xl p-4">
                <h2 className="mb-3 text-xl font-semibold text-[var(--color-heading)]">Review Detail</h2>
                {loadingDetail ? (
                  <p className="text-sm text-[var(--color-text-soft)]">Loading detail...</p>
                ) : !detail ? (
                  <p className="text-sm text-[var(--color-text-soft)]">Select one item to review.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                      <p className="text-sm font-semibold text-[var(--color-text)]">{detail.file_name}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-soft)]">Scan ID: {detail.scan_id}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-soft)]">Policy: {detail.policy_action ?? "-"}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-soft)]">{detail.policy_reason ?? "-"}</p>
                    </div>

                    <div className="rounded-lg border border-[var(--color-border)] p-3">
                      <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Review Note</p>
                      <Input
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Reason for decision..."
                        disabled={!canReview || reviewing}
                      />
                      <label className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-soft)]">
                        <input
                          type="checkbox"
                          checked={generateRag}
                          onChange={(e) => setGenerateRag(e.target.checked)}
                          disabled={!canReview || reviewing}
                        />
                        Generate `rag-md` when approving
                      </label>
                      <div className="mt-3 flex gap-2">
                        <Button
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={!canReview || reviewing}
                          onClick={() => review("approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          className="bg-red-600 hover:bg-red-700"
                          disabled={!canReview || reviewing}
                          onClick={() => review("reject")}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>

                    {detail.result?.evidences?.length ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-[var(--color-text)]">Top Evidences</p>
                        {detail.result.evidences.slice(0, 5).map((ev, idx) => (
                          <div key={`${ev.category}-${idx}`} className={`rounded-lg border p-2 ${severityTone(ev.severity)}`}>
                            <p className="text-xs font-semibold text-[var(--color-heading)]">
                              {ev.category} ({ev.severity.toUpperCase()})
                            </p>
                            <p className="mt-1 text-xs text-[var(--color-text-soft)]">{ev.snippet}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
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
