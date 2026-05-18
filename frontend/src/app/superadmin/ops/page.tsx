"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useI18n } from "@/hooks/use-i18n";
import { authenticatedJson } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type QueueOverview = {
  eta_total_seconds: number;
  total_pending: number;
  total_running: number;
  alert_level: string;
};

type SLOItem = {
  name: string;
  target: number;
  actual: number;
  unit: string;
  status: "pass" | "warn" | "fail";
};

type OpsOverview = {
  generated_at: string;
  window_hours: number;
  queue: QueueOverview;
  scans: {
    total_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    pending_jobs: number;
    running_jobs: number;
    success_rate_percent: number;
    avg_processing_seconds: number;
    p95_processing_seconds: number;
  };
  webhooks: {
    total_deliveries: number;
    delivered_count: number;
    dead_letter_count: number;
    discarded_count: number;
    delivery_success_rate_percent: number;
  };
  upgrade_requests: {
    pending_count: number;
    pending_over_sla_count: number;
    sla_hours: number;
  };
  support_tickets: {
    open_count: number;
    waiting_first_response_over_sla_count: number;
    first_response_sla_hours: number;
  };
  slo: SLOItem[];
  active_alerts: {
    scope_key: string;
    indicator_name: string;
    status: string;
    actual: number;
    target: number;
    unit: string;
    alert_count: number;
    last_sent_at: string | null;
    updated_at: string;
  }[];
};

type SLOHistoryPoint = {
  indicator_name: string;
  status: "pass" | "warn" | "fail";
  actual: number;
  target: number;
  unit: string;
  recorded_at: string;
};

type SLOHistoryResponse = {
  scope_key: string;
  window_hours: number;
  limit_per_indicator: number;
  items: SLOHistoryPoint[];
};

type UserMe = {
  role: string;
};

function fmtDate(input?: string): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

function sloTone(status: string): string {
  if (status === "pass") return "bg-emerald-100 text-emerald-700";
  if (status === "warn") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function sloStroke(status: string): string {
  if (status === "pass") return "#059669";
  if (status === "warn") return "#d97706";
  return "#dc2626";
}

function toSparkline(points: SLOHistoryPoint[], width = 280, height = 64): string {
  if (!points.length) return "";
  const values = points.map((point) => point.actual);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  if (points.length === 1) {
    const y = Math.round(height / 2);
    return `0,${y} ${width},${y}`;
  }
  return points
    .map((point, index) => {
      const x = Math.round((index / (points.length - 1)) * width);
      const y = Math.round(height - ((point.actual - min) / range) * height);
      return `${x},${y}`;
    })
    .join(" ");
}

function targetLineY(points: SLOHistoryPoint[], height = 64): number {
  if (!points.length) return Math.round(height / 2);
  const values = points.map((point) => point.actual);
  const target = points[0]?.target ?? 0;
  const min = Math.min(...values, target);
  const max = Math.max(...values, target);
  const range = max - min || 1;
  return Math.round(height - ((target - min) / range) * height);
}

export default function SuperAdminOpsPage() {
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();
  const [me, setMe] = useState<UserMe | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const [tenantFilter, setTenantFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [sloHistory, setSloHistory] = useState<SLOHistoryResponse | null>(null);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("window_hours", String(windowHours));
      if (tenantFilter.trim()) params.set("tenant_id", tenantFilter.trim());

      const [meData, data, historyData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<OpsOverview>(API_BASE, `/admin/ops/overview?${params.toString()}`, accessToken),
        authenticatedJson<SLOHistoryResponse>(API_BASE, `/admin/ops/slo-history?${params.toString()}`, accessToken),
      ]);
      setMe(meData);
      setOverview(data);
      setSloHistory(historyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operations overview");
    } finally {
      setLoading(false);
    }
  }, [tenantFilter, windowHours]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(token);
  }, [token, load]);

  async function runAlertEvaluation() {
    if (!token) return;
    setEvaluating(true);
    setError("");
    setSuccess("");
    try {
      const params = new URLSearchParams();
      params.set("window_hours", String(windowHours));
      if (tenantFilter.trim()) params.set("tenant_id", tenantFilter.trim());
      const result = await authenticatedJson<{
        breaches_sent: number;
        recoveries_sent: number;
      }>(API_BASE, `/admin/ops/alerts/evaluate?${params.toString()}`, token, { method: "POST" });
      setSuccess(`Alert evaluation completed. Breaches: ${result.breaches_sent}, Recoveries: ${result.recoveries_sent}.`);
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to evaluate SLO alerts");
    } finally {
      setEvaluating(false);
    }
  }

  const passCount = useMemo(() => (overview ? overview.slo.filter((item) => item.status === "pass").length : 0), [overview]);
  const totalCount = overview?.slo.length ?? 0;
  const isSuperAdmin = me ? me.role === "superadmin" : true;
  const historyByIndicator = useMemo(() => {
    const grouped: Record<string, SLOHistoryPoint[]> = {};
    for (const item of sloHistory?.items ?? []) {
      if (!grouped[item.indicator_name]) grouped[item.indicator_name] = [];
      grouped[item.indicator_name].push(item);
    }
    for (const indicator of Object.keys(grouped)) {
      grouped[indicator] = [...grouped[indicator]].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
      );
    }
    return grouped;
  }, [sloHistory]);

  if (!ready || !token) {
    return <div className="min-h-screen grid place-items-center">{t("common.preparing")}</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">{t("superadmin.ops.title")}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                {t("superadmin.ops.subtitle")}
              </p>
            </Card>

            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4 text-red-700">
                {t("superadmin.accessDenied")}
              </Card>
            ) : (
              <>
                <Card className="rounded-xl p-4">
                  <div className="mb-3 flex flex-wrap items-end gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Window</label>
                      <select
                        value={windowHours}
                        onChange={(event) => setWindowHours(Number(event.target.value))}
                        className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
                      >
                        <option value={1}>1h</option>
                        <option value={6}>6h</option>
                        <option value={24}>24h</option>
                        <option value={72}>72h</option>
                        <option value={168}>7d</option>
                      </select>
                    </div>
                    <div className="min-w-[240px] flex-1">
                      <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Tenant ID (optional)</label>
                      <Input
                        value={tenantFilter}
                        onChange={(event) => setTenantFilter(event.target.value)}
                        placeholder="Filter by tenant UUID"
                      />
                    </div>
                    <Button variant="outline" onClick={() => token && load(token)} disabled={loading}>
                      {loading ? "Refreshing..." : t("common.refresh")}
                    </Button>
                    <Button className="bg-[var(--color-primary-strong)] hover:bg-[var(--color-primary)]" onClick={() => void runAlertEvaluation()} disabled={evaluating}>
                      {evaluating ? "Evaluating..." : "Run Alert Evaluation"}
                    </Button>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">SLO Pass</p>
                      <p className="text-2xl font-bold text-[var(--color-heading)]">{passCount}/{totalCount}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Scan Success</p>
                      <p className="text-2xl font-bold text-[var(--color-heading)]">{overview?.scans.success_rate_percent ?? 0}%</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">P95 Scan Latency</p>
                      <p className="text-2xl font-bold text-[var(--color-warn-text)]">{overview?.scans.p95_processing_seconds ?? 0}s</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Generated At</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{fmtDate(overview?.generated_at)}</p>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Operational SLAs</h2>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Pending Upgrade Requests</p>
                      <p className="text-2xl font-bold text-[var(--color-heading)]">{overview?.upgrade_requests.pending_count ?? 0}</p>
                      <p className="mt-1 text-xs text-[var(--color-warn-text)]">
                        Over SLA ({overview?.upgrade_requests.sla_hours ?? 24}h): {overview?.upgrade_requests.pending_over_sla_count ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Open Support Tickets</p>
                      <p className="text-2xl font-bold text-[var(--color-heading)]">{overview?.support_tickets.open_count ?? 0}</p>
                      <p className="mt-1 text-xs text-[var(--color-warn-text)]">
                        Waiting first response over {overview?.support_tickets.first_response_sla_hours ?? 8}h: {overview?.support_tickets.waiting_first_response_over_sla_count ?? 0}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">SLO Indicators</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                          <th className="py-2">Indicator</th>
                          <th className="py-2">Target</th>
                          <th className="py-2">Actual</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(overview?.slo ?? []).map((item) => (
                          <tr key={item.name} className="border-b border-[var(--color-border-soft)]">
                            <td className="py-2 text-[var(--color-text)]">{item.name}</td>
                            <td className="py-2 text-[var(--color-text)]">{item.target} {item.unit}</td>
                            <td className="py-2 text-[var(--color-text)]">{item.actual} {item.unit}</td>
                            <td className="py-2">
                              <Badge className={sloTone(item.status)}>{item.status.toUpperCase()}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Active Alerts</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                          <th className="py-2">Indicator</th>
                          <th className="py-2">Status</th>
                          <th className="py-2">Actual</th>
                          <th className="py-2">Target</th>
                          <th className="py-2">Alert Count</th>
                          <th className="py-2">Last Sent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(overview?.active_alerts ?? []).map((item) => (
                          <tr key={`${item.scope_key}:${item.indicator_name}`} className="border-b border-[var(--color-border-soft)]">
                            <td className="py-2 text-[var(--color-text)]">{item.indicator_name}</td>
                            <td className="py-2"><Badge className={sloTone(item.status)}>{item.status.toUpperCase()}</Badge></td>
                            <td className="py-2 text-[var(--color-text)]">{item.actual} {item.unit}</td>
                            <td className="py-2 text-[var(--color-text)]">{item.target} {item.unit}</td>
                            <td className="py-2 text-[var(--color-text)]">{item.alert_count}</td>
                            <td className="py-2 text-[var(--color-text-soft)]">{fmtDate(item.last_sent_at ?? item.updated_at)}</td>
                          </tr>
                        ))}
                        {!(overview?.active_alerts?.length) ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-[var(--color-text-soft)]">
                              No active SLO alerts.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">SLO History Timeline</h2>
                  <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                    Recent snapshots per indicator for the selected scope and window.
                  </p>
                  <div className="mt-3 space-y-3">
                    {Object.entries(historyByIndicator).map(([indicator, points]) => (
                      <div key={indicator} className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[var(--color-text)]">{indicator}</h3>
                          {points.length ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[var(--color-text-muted)]">
                                Latest: {points[points.length - 1].actual} {points[points.length - 1].unit}
                              </span>
                              <Badge className={sloTone(points[points.length - 1].status)}>
                                {points[points.length - 1].status.toUpperCase()}
                              </Badge>
                            </div>
                          ) : null}
                        </div>
                        {points.length ? (
                          <div className="mt-3 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-3">
                            <svg viewBox="0 0 280 64" className="h-16 w-full">
                              <line
                                x1={0}
                                y1={targetLineY(points)}
                                x2={280}
                                y2={targetLineY(points)}
                                stroke="var(--color-border-strong)"
                                strokeDasharray="4 4"
                                strokeWidth="1"
                              />
                              <polyline
                                fill="none"
                                stroke={sloStroke(points[points.length - 1].status)}
                                strokeWidth="2.5"
                                points={toSparkline(points)}
                              />
                            </svg>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                              <span>{fmtDate(points[0].recorded_at)}</span>
                              <span>
                                Target: {points[points.length - 1].target} {points[points.length - 1].unit}
                              </span>
                              <span>{fmtDate(points[points.length - 1].recorded_at)}</span>
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full min-w-[680px] text-left text-sm">
                            <thead>
                              <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                                <th className="py-2">Recorded At</th>
                                <th className="py-2">Status</th>
                                <th className="py-2">Actual</th>
                                <th className="py-2">Target</th>
                              </tr>
                            </thead>
                            <tbody>
                              {points.map((point, index) => (
                                <tr key={`${indicator}-${point.recorded_at}-${index}`} className="border-b border-[var(--color-border-soft)]">
                                  <td className="py-2 text-[var(--color-text-soft)]">{fmtDate(point.recorded_at)}</td>
                                  <td className="py-2">
                                    <Badge className={sloTone(point.status)}>{point.status.toUpperCase()}</Badge>
                                  </td>
                                  <td className="py-2 text-[var(--color-text)]">{point.actual} {point.unit}</td>
                                  <td className="py-2 text-[var(--color-text)]">{point.target} {point.unit}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                    {!Object.keys(historyByIndicator).length ? (
                      <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-6 text-center text-sm text-[var(--color-text-soft)]">
                        No SLO history available yet. Run an alert evaluation to capture snapshots.
                      </div>
                    ) : null}
                  </div>
                </Card>
              </>
            )}
          </div>
        </main>
      </div>
      {error ? (
        <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("common.error")}: {error}
        </div>
      ) : null}
      {success ? (
        <div className="fixed bottom-4 left-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}
    </div>
  );
}
