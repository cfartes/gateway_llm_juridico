"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
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

export default function SuperAdminOpsPage() {
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<UserMe | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const [tenantFilter, setTenantFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [overview, setOverview] = useState<OpsOverview | null>(null);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("window_hours", String(windowHours));
      if (tenantFilter.trim()) params.set("tenant_id", tenantFilter.trim());

      const [meData, data] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<OpsOverview>(API_BASE, `/admin/ops/overview?${params.toString()}`, accessToken),
      ]);
      setMe(meData);
      setOverview(data);
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

  if (!ready || !token) {
    return <div className="min-h-screen grid place-items-center">Preparing your workspace...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[#213552]">SuperAdmin Operations</h1>
              <p className="mt-1 text-sm text-[#667896]">
                SLO, fila, throughput e saúde operacional para acompanhamento em tempo real.
              </p>
            </Card>

            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4 text-red-700">
                Access denied. This page is available only for global superadmin users.
              </Card>
            ) : (
              <>
                <Card className="rounded-xl p-4">
                  <div className="mb-3 flex flex-wrap items-end gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#4f6386]">Window</label>
                      <select
                        value={windowHours}
                        onChange={(event) => setWindowHours(Number(event.target.value))}
                        className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm"
                      >
                        <option value={1}>1h</option>
                        <option value={6}>6h</option>
                        <option value={24}>24h</option>
                        <option value={72}>72h</option>
                        <option value={168}>7d</option>
                      </select>
                    </div>
                    <div className="min-w-[240px] flex-1">
                      <label className="mb-1 block text-xs font-semibold text-[#4f6386]">Tenant ID (optional)</label>
                      <Input
                        value={tenantFilter}
                        onChange={(event) => setTenantFilter(event.target.value)}
                        placeholder="Filter by tenant UUID"
                      />
                    </div>
                    <Button variant="outline" onClick={() => token && load(token)} disabled={loading}>
                      {loading ? "Refreshing..." : "Refresh"}
                    </Button>
                    <Button className="bg-[#1f3f72] hover:bg-[#183561]" onClick={() => void runAlertEvaluation()} disabled={evaluating}>
                      {evaluating ? "Evaluating..." : "Run Alert Evaluation"}
                    </Button>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">SLO Pass</p>
                      <p className="text-2xl font-bold text-[#1f3f72]">{passCount}/{totalCount}</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Scan Success</p>
                      <p className="text-2xl font-bold text-[#1f3f72]">{overview?.scans.success_rate_percent ?? 0}%</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">P95 Scan Latency</p>
                      <p className="text-2xl font-bold text-[#7b4f00]">{overview?.scans.p95_processing_seconds ?? 0}s</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Generated At</p>
                      <p className="text-sm font-semibold text-[#2c3f5f]">{fmtDate(overview?.generated_at)}</p>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="text-lg font-semibold text-[#213552]">SLO Indicators</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                          <th className="py-2">Indicator</th>
                          <th className="py-2">Target</th>
                          <th className="py-2">Actual</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(overview?.slo ?? []).map((item) => (
                          <tr key={item.name} className="border-b border-[#eff3f8]">
                            <td className="py-2 text-[#334766]">{item.name}</td>
                            <td className="py-2 text-[#334766]">{item.target} {item.unit}</td>
                            <td className="py-2 text-[#334766]">{item.actual} {item.unit}</td>
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
                  <h2 className="text-lg font-semibold text-[#213552]">Active Alerts</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
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
                          <tr key={`${item.scope_key}:${item.indicator_name}`} className="border-b border-[#eff3f8]">
                            <td className="py-2 text-[#334766]">{item.indicator_name}</td>
                            <td className="py-2"><Badge className={sloTone(item.status)}>{item.status.toUpperCase()}</Badge></td>
                            <td className="py-2 text-[#334766]">{item.actual} {item.unit}</td>
                            <td className="py-2 text-[#334766]">{item.target} {item.unit}</td>
                            <td className="py-2 text-[#334766]">{item.alert_count}</td>
                            <td className="py-2 text-[#4f6386]">{fmtDate(item.last_sent_at ?? item.updated_at)}</td>
                          </tr>
                        ))}
                        {!(overview?.active_alerts?.length) ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-[#7586a3]">
                              No active SLO alerts.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        </main>
      </div>
      {error ? (
        <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error}
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
