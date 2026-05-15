"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { authenticatedJson } from "@/lib/auth";

type Delivery = {
  id: string;
  callback_url: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_http_status: number | null;
  last_error: string | null;
  updated_at: string;
};

type DeliveryListResponse = {
  items: Delivery[];
  total: number;
  total_dead_letter: number;
  total_delivered: number;
  total_discarded: number;
};

type DeliveryDetailResponse = {
  delivery: Delivery;
  attempts: {
    id: string;
    attempt_number: number;
    http_status: number | null;
    error_message: string | null;
    duration_ms: number | null;
    created_at: string;
  }[];
};

type RetryResponse = {
  delivery: Delivery;
  retried_attempts: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString();
}

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "dead_letter") return "bg-red-100 text-red-700";
  if (s === "delivered") return "bg-emerald-100 text-emerald-700";
  if (s === "discarded") return "bg-slate-100 text-slate-700";
  return "bg-blue-100 text-blue-700";
}

export default function WebhooksPage() {
  const { token, ready } = useAuthGuard();
  const [status, setStatus] = useState("all");
  const [data, setData] = useState<DeliveryListResponse>({
    items: [],
    total: 0,
    total_dead_letter: 0,
    total_delivered: 0,
    total_discarded: 0,
  });
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<DeliveryDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(() => data.items.find((item) => item.id === selectedId) ?? null, [data.items, selectedId]);

  const loadList = useCallback(async (activeToken: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await authenticatedJson<DeliveryListResponse>(
        API_BASE,
        `/webhooks/deliveries?status=${status}&limit=150`,
        activeToken,
      );
      setData(res);
      setSelectedId((prev) => (prev && res.items.some((item) => item.id === prev) ? prev : (res.items[0]?.id ?? "")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhook deliveries");
    } finally {
      setLoading(false);
    }
  }, [status]);

  const loadDetail = useCallback(async (activeToken: string, id: string) => {
    try {
      const res = await authenticatedJson<DeliveryDetailResponse>(API_BASE, `/webhooks/deliveries/${id}`, activeToken);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load delivery detail");
    }
  }, []);

  async function retrySelected() {
    if (!token || !selectedId) return;
    setRetrying(true);
    setError("");
    try {
      await authenticatedJson<RetryResponse>(API_BASE, `/webhooks/deliveries/${selectedId}/retry`, token, { method: "POST" });
      await loadList(token);
      if (selectedId) await loadDetail(token, selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry");
    } finally {
      setRetrying(false);
    }
  }

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
              <h1 className="text-2xl font-semibold text-[#213552]">Webhook Deliveries</h1>
              <p className="mt-1 text-sm text-[#667896]">Tenant-level callback delivery tracking and manual retry.</p>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="mb-3 flex items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#4f6386]">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="dead_letter">Dead-letter</option>
                    <option value="delivered">Delivered</option>
                    <option value="discarded">Discarded</option>
                  </select>
                </div>
                <Button variant="outline" onClick={() => token && loadList(token)} disabled={loading}>
                  {loading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                      <th className="py-2">Status</th>
                      <th className="py-2">Callback</th>
                      <th className="py-2">Attempts</th>
                      <th className="py-2">Last HTTP</th>
                      <th className="py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer border-b border-[#eff3f8] ${selectedId === item.id ? "bg-[#f4f8ff]" : ""}`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <td className="py-2"><Badge className={statusTone(item.status)}>{item.status.toUpperCase()}</Badge></td>
                        <td className="py-2 text-[#4f6386]">{item.callback_url}</td>
                        <td className="py-2 text-[#334766]">{item.attempt_count}/{item.max_attempts}</td>
                        <td className="py-2 text-[#334766]">{item.last_http_status ?? "-"}</td>
                        <td className="py-2 text-[#4f6386]">{formatDate(item.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#213552]">Delivery Detail</h2>
                <Button
                  onClick={() => void retrySelected()}
                  disabled={!selected || retrying || selected.status === "discarded"}
                >
                  {retrying ? "Retrying..." : "Retry Now"}
                </Button>
              </div>
              <div className="mt-3 text-sm text-[#5f7393]">
                {selected ? (
                  <>
                    <p><span className="font-semibold">ID:</span> {selected.id}</p>
                    <p><span className="font-semibold">Last error:</span> {selected.last_error ?? "-"}</p>
                  </>
                ) : (
                  <p>Select one delivery.</p>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {detail?.attempts?.map((attempt) => (
                  <div key={attempt.id} className="rounded-lg border border-[#edf2f9] bg-[#fbfdff] p-2 text-xs">
                    Attempt #{attempt.attempt_number} | HTTP {attempt.http_status ?? "-"} | {attempt.duration_ms ?? "-"} ms | {formatDate(attempt.created_at)}
                  </div>
                ))}
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
    </div>
  );
}
