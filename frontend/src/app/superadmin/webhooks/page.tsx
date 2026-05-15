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
  delivered_at: string | null;
  discarded_at: string | null;
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
  const [me, setMe] = useState<UserMe | null>(null);
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
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [discarding, setDiscarding] = useState(false);
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

      const [meData, deliveries] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<DeliveryListResponse>(
          API_BASE,
          `/admin/webhooks/deliveries?${params.toString()}`,
          accessToken,
        ),
      ]);
      setMe(meData);
      setListData(deliveries);
      setSelectedId((prev) => {
        if (prev && deliveries.items.some((item) => item.id === prev)) return prev;
        return deliveries.items[0]?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhook deliveries");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, tenantFilter]);

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
              <h1 className="text-2xl font-semibold text-[#213552]">SuperAdmin Webhook Dead-Letter</h1>
              <p className="mt-1 text-sm text-[#667896]">
                Monitor callback failures, inspect attempts, and trigger manual replay.
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
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Dead-letter</p>
                      <p className="text-2xl font-bold text-red-600">{listData.total_dead_letter}</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Delivered</p>
                      <p className="text-2xl font-bold text-emerald-600">{listData.total_delivered}</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Discarded</p>
                      <p className="text-2xl font-bold text-slate-700">{listData.total_discarded}</p>
                    </div>
                    <div className="rounded-lg border border-[#e5ecf7] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">Visible rows</p>
                      <p className="text-2xl font-bold text-[#1f3f72]">{listData.total}</p>
                    </div>
                  </div>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
                  <Card className="rounded-xl p-4">
                    <div className="mb-3 flex flex-wrap items-end gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[#4f6386]">Status</label>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm"
                        >
                          <option value="dead_letter">Dead-letter</option>
                          <option value="delivered">Delivered</option>
                          <option value="discarded">Discarded</option>
                          <option value="all">All</option>
                        </select>
                      </div>
                      <div className="min-w-[220px] flex-1">
                        <label className="mb-1 block text-xs font-semibold text-[#4f6386]">Tenant ID (optional)</label>
                        <Input
                          value={tenantFilter}
                          onChange={(e) => setTenantFilter(e.target.value)}
                          placeholder="Filter by tenant UUID"
                        />
                      </div>
                      <Button variant="outline" onClick={refreshAll} disabled={loading}>
                        {loading ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[860px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                            <th className="py-2">Status</th>
                            <th className="py-2">Tenant</th>
                            <th className="py-2">Scan</th>
                            <th className="py-2">Attempts</th>
                            <th className="py-2">HTTP</th>
                            <th className="py-2">Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {listData.items.map((item) => (
                            <tr
                              key={item.id}
                              className={`cursor-pointer border-b border-[#eff3f8] ${selectedId === item.id ? "bg-[#f4f8ff]" : ""}`}
                              onClick={() => setSelectedId(item.id)}
                            >
                              <td className="py-2">
                                <Badge className={statusTone(item.status)}>{item.status.toUpperCase()}</Badge>
                              </td>
                              <td className="py-2 text-[#4f6386]">{item.tenant_id}</td>
                              <td className="py-2 text-[#4f6386]">{item.scan_job_id ?? "-"}</td>
                              <td className="py-2 text-[#334766]">{item.attempt_count} / {item.max_attempts}</td>
                              <td className="py-2 text-[#334766]">{item.last_http_status ?? "-"}</td>
                              <td className="py-2 text-[#4f6386]">{formatDate(item.updated_at)}</td>
                            </tr>
                          ))}
                          {!listData.items.length ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-[#7586a3]">
                                No webhook delivery records found for this filter.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card className="rounded-xl p-4">
                    <h2 className="text-xl font-semibold text-[#213552]">Delivery Detail</h2>
                    {!selected ? (
                      <p className="mt-2 text-sm text-[#667896]">Select one delivery to inspect attempts.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <div className="rounded-lg border border-[#e5ecf7] bg-[#f9fbff] p-3 text-xs text-[#5f7393]">
                          <p><span className="font-semibold">ID:</span> {selected.id}</p>
                          <p className="mt-1"><span className="font-semibold">Callback:</span> {selected.callback_url}</p>
                          <p className="mt-1"><span className="font-semibold">Last Error:</span> {selected.last_error ?? "-"}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={retrySelected}
                            disabled={retrying || discarding || selected.status === "discarded"}
                          >
                            {retrying ? "Retrying..." : "Retry Now"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={discardSelected}
                            disabled={discarding || retrying || selected.status === "discarded"}
                          >
                            {discarding ? "Discarding..." : "Discard"}
                          </Button>
                        </div>

                        <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border border-[#e8edf5] bg-white p-2">
                          {loadingDetail ? (
                            <p className="px-2 py-4 text-sm text-[#667896]">Loading attempts...</p>
                          ) : null}
                          {!loadingDetail && detail?.attempts.length ? (
                            detail.attempts.map((attempt) => (
                              <div key={attempt.id} className="rounded-lg border border-[#edf2f9] bg-[#fbfdff] p-2 text-xs">
                                <p className="font-semibold text-[#25416a]">
                                  Attempt #{attempt.attempt_number} - HTTP {attempt.http_status ?? "N/A"}
                                </p>
                                <p className="mt-1 text-[#5f7393]">
                                  Duration: {attempt.duration_ms ?? "-"} ms | {formatDate(attempt.created_at)}
                                </p>
                                <p className="mt-1 text-[#5f7393]">Error: {attempt.error_message ?? "-"}</p>
                                <p className="mt-1 text-[#5f7393]">
                                  Response: {(attempt.response_preview ?? "-").slice(0, 180)}
                                </p>
                              </div>
                            ))
                          ) : null}
                          {!loadingDetail && !detail?.attempts.length ? (
                            <p className="px-2 py-4 text-sm text-[#667896]">No attempt history available.</p>
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
