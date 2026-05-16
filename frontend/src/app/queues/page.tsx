"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import {
  appendQueueAlertEvent,
  buildAlertSignature,
  getAcknowledgedSignature,
  isAlertSnoozed,
  isCriticalEscalation,
  QueueAlertEvent,
  readQueueAlertHistory,
} from "@/lib/queue-alerts";
import { authenticatedJson } from "@/lib/auth";
import { fetchQueueAlertPreference, QueueAlertPreference, updateQueueAlertPreference } from "@/lib/queue-alert-preferences";

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
  eta_total_seconds: number;
  alert_level: string;
  alerts: string[];
  items: QueueBucket[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString();
}

function queueTone(name: string): string {
  if (name === "scan_light") return "bg-emerald-100 text-emerald-700";
  if (name === "scan_heavy") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

export default function QueuesPage() {
  const { token, ready } = useAuthGuard();
  const [windowHours, setWindowHours] = useState(24);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [history, setHistory] = useState<QueueAlertEvent[]>(() => readQueueAlertHistory().slice(0, 12));
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [alertPreference, setAlertPreference] = useState<QueueAlertPreference | null>(null);
  const [overview, setOverview] = useState<QueueOverview>({
    generated_at: "",
    window_hours: 24,
    tenant_id: null,
    total_pending: 0,
    total_running: 0,
    eta_total_seconds: 0,
    alert_level: "normal",
    alerts: [],
    items: [],
  });
  const previousLevelRef = useRef<string>("normal");

  const totalEta = useMemo(() => overview.eta_total_seconds || overview.items.reduce((acc, item) => acc + item.estimated_wait_seconds, 0), [overview.eta_total_seconds, overview.items]);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const [data, preferenceData] = await Promise.all([
        authenticatedJson<QueueOverview>(
          API_BASE,
          `/queues/overview?window_hours=${windowHours}`,
          accessToken,
        ),
        fetchQueueAlertPreference(API_BASE, accessToken, "tenant"),
      ]);
      setOverview(data);
      setAlertPreference(preferenceData);
      const alertSignature = buildAlertSignature(data.alert_level, data.tenant_id, data.alerts);
      const acknowledged = getAcknowledgedSignature(preferenceData);
      const snoozed = isAlertSnoozed(preferenceData);
      if (isCriticalEscalation(previousLevelRef.current, data.alert_level) && !snoozed && acknowledged !== alertSignature) {
        const event: QueueAlertEvent = {
          id: `${Date.now()}-tenant`,
          timestamp: new Date().toISOString(),
          page: "tenant",
          level: "critical",
          tenantId: data.tenant_id,
          windowHours: data.window_hours,
          messages: data.alerts,
        };
        const nextHistory = appendQueueAlertEvent(event);
        setHistory(nextHistory.slice(0, 12));
        setToast({
          title: "Critical Queue Alert",
          message: data.alerts[0] ?? "Queue pressure crossed critical threshold.",
        });
      }
      previousLevelRef.current = data.alert_level;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue overview");
    } finally {
      setLoading(false);
    }
  }, [windowHours]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

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
    return <div className="min-h-screen grid place-items-center">Preparing your workspace...</div>;
  }

  const alertSignature = buildAlertSignature(overview.alert_level, overview.tenant_id, overview.alerts);
  const acknowledged = getAcknowledgedSignature(alertPreference);
  const snoozed = isAlertSnoozed(alertPreference);
  const showAlertBanner = overview.alert_level !== "normal" && !snoozed && acknowledged !== alertSignature;

  async function handleAcknowledge() {
    if (!token) return;
    setActionLoading(true);
    try {
      const updated = await updateQueueAlertPreference(API_BASE, token, "tenant", {
        acknowledged_signature: alertSignature,
      });
      setAlertPreference(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update alert preference");
    } finally {
      setActionLoading(false);
    }
    setToast(null);
  }

  async function handleSnooze(minutes: number) {
    if (!token) return;
    setActionLoading(true);
    try {
      const updated = await updateQueueAlertPreference(API_BASE, token, "tenant", {
        snooze_minutes: minutes,
      });
      setAlertPreference(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update alert preference");
    } finally {
      setActionLoading(false);
    }
    setToast(null);
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">Queue Overview</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">Monitor current queue pressure and estimated processing wait for your tenant.</p>
            </Card>

            {showAlertBanner ? (
              <Card
                className={`rounded-xl p-4 ${
                  overview.alert_level === "critical"
                    ? "border-red-200 bg-red-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <h2 className={`text-lg font-semibold ${overview.alert_level === "critical" ? "text-red-700" : "text-amber-700"}`}>
                  {overview.alert_level === "critical" ? "Queue Alert: Critical" : "Queue Alert: Warning"}
                </h2>
                <div className="mt-2 space-y-1 text-sm text-[var(--color-text-soft)]">
                  {overview.alerts.map((item, index) => (
                    <p key={`${index}-${item}`}>- {item}</p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void handleAcknowledge()} disabled={actionLoading}>Acknowledge</Button>
                  <Button variant="outline" onClick={() => void handleSnooze(15)} disabled={actionLoading}>Snooze 15m</Button>
                  <Button variant="outline" onClick={() => void handleSnooze(30)} disabled={actionLoading}>Snooze 30m</Button>
                  <Button variant="outline" onClick={() => void handleSnooze(60)} disabled={actionLoading}>Snooze 60m</Button>
                </div>
              </Card>
            ) : null}

            <Card className="rounded-xl p-4">
              <h2 className="text-xl font-semibold text-[var(--color-heading)]">Queue Alert History</h2>
              <div className="mt-2 space-y-2">
                {history.length ? (
                  history.map((item) => (
                    <div key={item.id} className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-soft)]">
                      [{new Date(item.timestamp).toLocaleString()}] {item.page.toUpperCase()} {item.level.toUpperCase()}
                      {item.messages[0] ? ` - ${item.messages[0]}` : ""}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--color-text-soft)]">No alert history yet.</p>
                )}
              </div>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Window</label>
                  <select
                    value={windowHours}
                    onChange={(e) => setWindowHours(Number(e.target.value))}
                    className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
                  >
                    <option value={1}>1h</option>
                    <option value={6}>6h</option>
                    <option value={24}>24h</option>
                    <option value={72}>72h</option>
                    <option value={168}>7d</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-soft)]">
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
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Pending</p>
                  <p className="text-2xl font-bold text-[var(--color-heading)]">{overview.total_pending}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Running</p>
                  <p className="text-2xl font-bold text-[var(--color-heading)]">{overview.total_running}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Total ETA</p>
                  <p className="text-2xl font-bold text-[var(--color-warn-text)]">{Math.round(totalEta)}s</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Generated At</p>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{formatDate(overview.generated_at)}</p>
                </div>
              </div>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
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
                      <tr key={item.queue_name} className="border-b border-[var(--color-border-soft)]">
                        <td className="py-2"><Badge className={queueTone(item.queue_name)}>{item.queue_name}</Badge></td>
                        <td className="py-2 text-[var(--color-text)]">{item.pending_jobs}</td>
                        <td className="py-2 text-[var(--color-text)]">{item.running_jobs}</td>
                        <td className="py-2 text-[var(--color-text)]">{item.completed_window}</td>
                        <td className="py-2 text-[var(--color-text)]">{item.failed_window}</td>
                        <td className="py-2 text-[var(--color-text)]">{item.avg_processing_seconds}s</td>
                        <td className="py-2 text-[var(--color-warn-text)]">{Math.round(item.estimated_wait_seconds)}s</td>
                        <td className="py-2 text-[var(--color-text-soft)]">{formatDate(item.last_completed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </main>
      </div>
      {error ? (
        <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error}
        </div>
      ) : null}
      {toast ? (
        <div className="fixed bottom-4 left-4 max-w-[420px] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
          <p className="font-semibold">{toast.title}</p>
          <p className="mt-1">{toast.message}</p>
        </div>
      ) : null}
    </div>
  );
}
