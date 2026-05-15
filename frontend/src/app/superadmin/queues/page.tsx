"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { authenticatedJson } from "@/lib/auth";

type UserMe = {
  id: string;
  role: string;
  email: string;
};

type QueueBucket = {
  queue_name: string;
  pending_jobs: number;
  running_jobs: number;
  completed_window: number;
  failed_window: number;
  avg_processing_seconds: number;
  last_completed_at: string | null;
  estimated_wait_seconds: number;
};

type QueueOverview = {
  generated_at: string;
  window_hours: number;
  tenant_id: string | null;
  total_pending: number;
  total_running: number;
  items: QueueBucket[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

function queueTone(name: string): string {
  if (name === "scan_light") return "bg-emerald-100 text-emerald-700";
  if (name === "scan_heavy") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

export default function SuperAdminQueuesPage() {
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<UserMe | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const [tenantFilter, setTenantFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<QueueOverview>({
    generated_at: "",
    window_hours: 24,
    tenant_id: null,
    total_pending: 0,
    total_running: 0,
    items: [],
  });

  const totalEta = useMemo(
    () => overview.items.reduce((acc, item) => acc + item.estimated_wait_seconds, 0),
    [overview.items],
  );

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("window_hours", String(windowHours));
      if (tenantFilter.trim()) params.set("tenant_id", tenantFilter.trim());

      const [meData, data] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<QueueOverview>(API_BASE, `/admin/queues/overview?${params.toString()}`, accessToken),
      ]);
      setMe(meData);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue overview");
    } finally {
      setLoading(false);
    }
  }, [windowHours, tenantFilter]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(token);
  }, [token, load]);

  useEffect(() => {
    if (!token || !autoRefresh) return;
    const id = setInterval(() => {
      void load(token);
    }, 15000);
    return () => clearInterval(id);
  }, [token, autoRefresh, load]);

  if (!ready || !token) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f7f9fc] text-[#4c5f82]">
        Preparing your workspace...
      </div>
    );
  }

  const isSuperAdmin = me ? me.role === "superadmin" : true;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[#213552]">SuperAdmin Queue Dashboard</h1>
              <p className="mt-1 text-sm text-[#667896]">
                Real-time queue pressure, throughput window, and ETA estimation by processing tier.
              </p>
            </Card>

            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4">
                <h2 className="text-lg font-semibold text-red-700">Access denied</h2>
                <p className="mt-1 text-sm text-red-700">This page is available only for global superadmin users.</p>
              </Card>
            ) : (
              <>
                <Card className="rounded-xl p-4">
                  <div className="mb-3 flex flex-wrap items-end gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#4f6386]">Window</label>
                      <select
                        value={windowHours}
                        onChange={(e) => setWindowHours(Number(e.target.value))}
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
                        onChange={(e) => setTenantFilter(e.target.value)}
                        placeholder="Filter by tenant UUID"
                      />
                    </div>
                    <label className="flex items-center gap-2 rounded-lg border border-[#e4ebf7] bg-[#fbfcff] px-3 py-2 text-sm text-[#324a6f]">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Auto-refresh 15s
                    </label>
                    <Button variant="outline" onClick={() => token && load(token)} disabled={loading}>
                      {loading ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Total Pending</p>
                      <p className="text-2xl font-bold text-[#1f3f72]">{overview.total_pending}</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Total Running</p>
                      <p className="text-2xl font-bold text-[#1f3f72]">{overview.total_running}</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Estimated Queue Wait</p>
                      <p className="text-2xl font-bold text-[#7b4f00]">{Math.round(totalEta)}s</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Generated At</p>
                      <p className="text-sm font-semibold text-[#2c3f5f]">{formatDate(overview.generated_at)}</p>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                          <th className="py-2">Queue</th>
                          <th className="py-2">Pending</th>
                          <th className="py-2">Running</th>
                          <th className="py-2">Completed ({overview.window_hours}h)</th>
                          <th className="py-2">Failed ({overview.window_hours}h)</th>
                          <th className="py-2">Avg Proc Time</th>
                          <th className="py-2">ETA</th>
                          <th className="py-2">Last Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.items.map((item) => (
                          <tr key={item.queue_name} className="border-b border-[#eff3f8]">
                            <td className="py-2">
                              <Badge className={queueTone(item.queue_name)}>{item.queue_name}</Badge>
                            </td>
                            <td className="py-2 text-[#334766]">{item.pending_jobs}</td>
                            <td className="py-2 text-[#334766]">{item.running_jobs}</td>
                            <td className="py-2 text-[#334766]">{item.completed_window}</td>
                            <td className="py-2 text-[#334766]">{item.failed_window}</td>
                            <td className="py-2 text-[#334766]">{item.avg_processing_seconds}s</td>
                            <td className="py-2 text-[#7b4f00]">{Math.round(item.estimated_wait_seconds)}s</td>
                            <td className="py-2 text-[#4f6386]">{formatDate(item.last_completed_at)}</td>
                          </tr>
                        ))}
                        {!overview.items.length ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-[#7586a3]">
                              No queue data available for this filter.
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
    </div>
  );
}
