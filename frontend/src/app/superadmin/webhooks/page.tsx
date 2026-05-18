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

type UserMe = {
  id: string;
  role: string;
  email: string;
};

type WebhookDelivery = {
  id: string;
  tenant_id: string;
  scan_job_id: string | null;
  document_id: string | null;
  callback_url: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_http_status: number | null;
  last_error: string | null;
  last_response_preview: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  delivered_at: string | null;
  discarded_at: string | null;
  alert_last_sent_at: string | null;
  alert_count: number;
  created_at: string;
  updated_at: string;
};

type WebhookDeliveryAttempt = {
  id: string;
  attempt_number: number;
  http_status: number | null;
  error_message: string | null;
  response_preview: string | null;
  duration_ms: number | null;
  created_at: string;
};

type DeliveryListResponse = {
  items: WebhookDelivery[];
  total: number;
  total_dead_letter: number;
  total_delivered: number;
  total_discarded: number;
};

type DeliveryDetailResponse = {
  delivery: WebhookDelivery;
  attempts: WebhookDeliveryAttempt[];
};

type RetryResponse = {
  delivery: WebhookDelivery;
  retried_attempts: number;
};

type RetryCycleResponse = {
  queued: boolean;
  task_id: string;
};

type DeliveryMetrics = {
  window_days: number;
  total_events: number;
  delivered_events: number;
  dead_letter_events: number;
  discarded_events: number;
  success_rate_percent: number;
  avg_attempts_per_event: number;
  avg_attempt_duration_ms: number;
  top_failed_callbacks: { callback_url: string; dead_letter_count: number }[];
  top_failed_tenants: { tenant_id: string; dead_letter_count: number }[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "dead_letter") return "bg-red-100 text-red-700";
  if (normalized === "delivered") return "bg-emerald-100 text-emerald-700";
  if (normalized === "discarded") return "bg-slate-200 text-slate-700";
  return "bg-blue-100 text-blue-700";
}

export default function SuperAdminWebhooksPage() {
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();
  const [me, setMe] = useState<UserMe | null>(null);
  const [windowDays, setWindowDays] = useState(7);
  const [statusFilter, setStatusFilter] = useState("dead_letter");
  const [tenantFilter, setTenantFilter] = useState("");
  const [listData, setListData] = useState<DeliveryListResponse>({
    items: [],
    total: 0,
    total_dead_letter: 0,
    total_delivered: 0,
    total_discarded: 0,
  });
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<DeliveryDetailResponse | null>(null);
  const [metrics, setMetrics] = useState<DeliveryMetrics>({
    window_days: 7,
    total_events: 0,
    delivered_events: 0,
    dead_letter_events: 0,
    discarded_events: 0,
    success_rate_percent: 0,
    avg_attempts_per_event: 0,
    avg_attempt_duration_ms: 0,
    top_failed_callbacks: [],
    top_failed_tenants: [],
  });
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selected = useMemo(
    () => listData.items.find((item) => item.id === selectedId) ?? null,
    [listData.items, selectedId],
  );

  const loadList = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      params.set("limit", "150");
      if (tenantFilter.trim()) params.set("tenant_id", tenantFilter.trim());
      const metricsParams = new URLSearchParams();
      metricsParams.set("window_days", String(windowDays));
      if (tenantFilter.trim()) metricsParams.set("tenant_id", tenantFilter.trim());

      const [meData, deliveries, metricsData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<DeliveryListResponse>(
          API_BASE,
          `/admin/webhooks/deliveries?${params.toString()}`,
          accessToken,
        ),
        authenticatedJson<DeliveryMetrics>(
          API_BASE,
          `/admin/webhooks/deliveries/metrics?${metricsParams.toString()}`,
          accessToken,
        ),
      ]);
      setMe(meData);
      setListData(deliveries);
      setMetrics(metricsData);
      setSelectedId((prev) => {
        if (prev && deliveries.items.some((item) => item.id === prev)) return prev;
        return deliveries.items[0]?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhook deliveries");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, tenantFilter, windowDays]);

  const loadDetail = useCallback(async (accessToken: string, deliveryId: string) => {
    if (!deliveryId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setError("");
    try {
      const data = await authenticatedJson<DeliveryDetailResponse>(
        API_BASE,
        `/admin/webhooks/deliveries/${deliveryId}`,
        accessToken,
      );
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhook delivery detail");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList(token);
  }, [token, loadList]);

  useEffect(() => {
    if (!token || !selectedId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDetail(token, selectedId);
  }, [token, selectedId, loadDetail]);

  async function refreshAll() {
    if (!token) return;
    setSuccess("");
    await loadList(token);
    if (selectedId) await loadDetail(token, selectedId);
  }

  async function retrySelected() {
    if (!token || !selectedId) return;
    setRetrying(true);
    setError("");
    setSuccess("");
    try {
      const data = await authenticatedJson<RetryResponse>(
        API_BASE,
        `/admin/webhooks/deliveries/${selectedId}/retry`,
        token,
        { method: "POST" },
      );
      setSuccess(`Retry finished with ${data.retried_attempts} attempt(s). Status: ${data.delivery.status}.`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry webhook delivery");
    } finally {
      setRetrying(false);
    }
  }

  async function discardSelected() {
    if (!token || !selectedId) return;
    setDiscarding(true);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<WebhookDelivery>(
        API_BASE,
        `/admin/webhooks/deliveries/${selectedId}/discard`,
        token,
        { method: "POST" },
      );
      setSuccess("Delivery moved to discarded state.");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard delivery");
    } finally {
      setDiscarding(false);
    }
  }

  async function runDeadLetterCycle() {
    if (!token) return;
    setRunningCycle(true);
    setError("");
    setSuccess("");
    try {
      const result = await authenticatedJson<RetryCycleResponse>(
        API_BASE,
        "/admin/webhooks/deliveries/retry-dead-letter/run",
        token,
        { method: "POST" },
      );
      setSuccess(`Dead-letter retry cycle queued. Task ID: ${result.task_id}`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start dead-letter retry cycle");
    } finally {
      setRunningCycle(false);
    }
  }

  if (!ready || !token) {
    return (
        <div className="min-h-screen grid place-items-center bg-[var(--color-bg-app)] text-[var(--color-text-soft)]">
        {t("common.preparing")}
      </div>
    );
  }

  const isSuperAdmin = me ? me.role === "superadmin" : true;

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">{t("superadmin.webhooks.title")}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                {t("superadmin.webhooks.subtitle")}
              </p>
            </Card>

            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4">
                <h2 className="text-lg font-semibold text-red-700">{t("common.error")}</h2>
                <p className="mt-1 text-sm text-red-700">{t("superadmin.accessDenied")}</p>
              </Card>
            ) : (
              <>
                <Card className="rounded-xl p-4">
                  <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Dead-letter</p>
                      <p className="text-2xl font-bold text-red-600">{listData.total_dead_letter}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Delivered</p>
                      <p className="text-2xl font-bold text-emerald-600">{listData.total_delivered}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Discarded</p>
                      <p className="text-2xl font-bold text-slate-700">{listData.total_discarded}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Visible rows</p>
                      <p className="text-2xl font-bold text-[var(--color-heading)]">{listData.total}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Success Rate ({metrics.window_days}d)</p>
                      <p className="text-2xl font-bold text-emerald-700">{metrics.success_rate_percent}%</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Avg Attempt Duration</p>
                      <p className="text-2xl font-bold text-[var(--color-heading)]">{metrics.avg_attempt_duration_ms} ms</p>
                    </div>
                  </div>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
                  <Card className="rounded-xl p-4">
                    <div className="mb-3 flex flex-wrap items-end gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Status</label>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
                        >
                          <option value="dead_letter">Dead-letter</option>
                          <option value="delivered">Delivered</option>
                          <option value="discarded">Discarded</option>
                          <option value="all">{t("quarantine.filter.all")}</option>
                        </select>
                      </div>
                      <div className="min-w-[220px] flex-1">
                        <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Tenant ID (optional)</label>
                        <Input
                          value={tenantFilter}
                          onChange={(e) => setTenantFilter(e.target.value)}
                          placeholder={t("common.tenantIdFilter")}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">{t("common.metricsWindow")}</label>
                        <select
                          value={windowDays}
                          onChange={(e) => setWindowDays(Number(e.target.value))}
                          className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
                        >
                          <option value={1}>1 day</option>
                          <option value={7}>7 days</option>
                          <option value={30}>30 days</option>
                          <option value={90}>90 days</option>
                        </select>
                      </div>
                      <Button variant="outline" onClick={refreshAll} disabled={loading}>
                        {loading ? t("common.refreshing") : t("common.refresh")}
                      </Button>
                      <Button onClick={runDeadLetterCycle} disabled={runningCycle}>
                        {runningCycle ? t("common.queueing") : t("common.runRetryCycle")}
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[860px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                            <th className="py-2">{t("common.status")}</th>
                            <th className="py-2">{t("common.tenant")}</th>
                            <th className="py-2">Scan</th>
                            <th className="py-2">Attempts</th>
                            <th className="py-2">Next Retry</th>
                            <th className="py-2">HTTP</th>
                            <th className="py-2">Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {listData.items.map((item) => (
                            <tr
                              key={item.id}
                              className={`cursor-pointer border-b border-[var(--color-border-soft)] ${selectedId === item.id ? "bg-[var(--color-surface-alt)]" : ""}`}
                              onClick={() => setSelectedId(item.id)}
                            >
                              <td className="py-2">
                                <Badge className={statusTone(item.status)}>{item.status.toUpperCase()}</Badge>
                              </td>
                              <td className="py-2 text-[var(--color-text-soft)]">{item.tenant_id}</td>
                              <td className="py-2 text-[var(--color-text-soft)]">{item.scan_job_id ?? "-"}</td>
                              <td className="py-2 text-[var(--color-text)]">{item.attempt_count} / {item.max_attempts}</td>
                              <td className="py-2 text-[var(--color-text-soft)]">{formatDate(item.next_retry_at)}</td>
                              <td className="py-2 text-[var(--color-text)]">{item.last_http_status ?? "-"}</td>
                              <td className="py-2 text-[var(--color-text-soft)]">{formatDate(item.updated_at)}</td>
                            </tr>
                          ))}
                          {!listData.items.length ? (
                            <tr>
                              <td colSpan={7} className="py-6 text-center text-[var(--color-text-soft)]">
                                {t("common.noData")}
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card className="rounded-xl p-4">
                    <h2 className="text-xl font-semibold text-[var(--color-heading)]">Delivery Detail</h2>
                    <div className="mb-3 mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-2 text-xs text-[var(--color-text-soft)]">
                      <p className="font-semibold text-[var(--color-text)]">Top Failed Callbacks ({metrics.window_days}d)</p>
                      {metrics.top_failed_callbacks.length ? (
                        metrics.top_failed_callbacks.map((item) => (
                          <p key={item.callback_url} className="mt-1 truncate">
                            {item.dead_letter_count}x - {item.callback_url}
                          </p>
                        ))
                      ) : (
                      <p className="mt-1">{t("common.noData")}</p>
                      )}
                    </div>
                    {!selected ? (
                      <p className="mt-2 text-sm text-[var(--color-text-soft)]">{t("common.details")}</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-xs text-[var(--color-text-soft)]">
                          <p><span className="font-semibold">ID:</span> {selected.id}</p>
                          <p className="mt-1"><span className="font-semibold">Callback:</span> {selected.callback_url}</p>
                          <p className="mt-1"><span className="font-semibold">Last Error:</span> {selected.last_error ?? "-"}</p>
                          <p className="mt-1"><span className="font-semibold">Next Retry:</span> {formatDate(selected.next_retry_at)}</p>
                          <p className="mt-1"><span className="font-semibold">Alerts Sent:</span> {selected.alert_count}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={retrySelected}
                            disabled={retrying || discarding || selected.status === "discarded"}
                          >
                            {retrying ? t("common.retrying") : t("common.retryNow")}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={discardSelected}
                            disabled={discarding || retrying || selected.status === "discarded"}
                          >
                            {discarding ? t("common.discarding") : t("common.discard")}
                          </Button>
                        </div>

                        <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-2">
                          {loadingDetail ? (
                            <p className="px-2 py-4 text-sm text-[var(--color-text-soft)]">{t("common.loadingAttempts")}</p>
                          ) : null}
                          {!loadingDetail && detail?.attempts.length ? (
                            detail.attempts.map((attempt) => (
                              <div key={attempt.id} className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-2 text-xs">
                                <p className="font-semibold text-[var(--color-text)]">
                                  Attempt #{attempt.attempt_number} - HTTP {attempt.http_status ?? "N/A"}
                                </p>
                                <p className="mt-1 text-[var(--color-text-soft)]">
                                  Duration: {attempt.duration_ms ?? "-"} ms | {formatDate(attempt.created_at)}
                                </p>
                                <p className="mt-1 text-[var(--color-text-soft)]">Error: {attempt.error_message ?? "-"}</p>
                                <p className="mt-1 text-[var(--color-text-soft)]">
                                  Response: {(attempt.response_preview ?? "-").slice(0, 180)}
                                </p>
                              </div>
                            ))
                          ) : null}
                          {!loadingDetail && !detail?.attempts.length ? (
                            <p className="px-2 py-4 text-sm text-[var(--color-text-soft)]">{t("common.noAttemptHistory")}</p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
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
