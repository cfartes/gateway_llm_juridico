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

type AuditLogItem = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_user_email: string | null;
  actor_api_token_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  source_ip: string | null;
  details: Record<string, unknown>;
  details_json: string | null;
};

type AuditLogResponse = {
  items: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
};

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

function toneForAction(action: string): string {
  if (action.includes("delete") || action.includes("discard") || action.includes("block")) {
    return "bg-red-100 text-red-700";
  }
  if (action.includes("retry") || action.includes("update")) {
    return "bg-amber-100 text-amber-700";
  }
  if (action.includes("create") || action.includes("approve")) {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-blue-100 text-blue-700";
}

export default function AuditLogPage() {
  const { token, ready } = useAuthGuard();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(100);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [sourceIp, setSourceIp] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const load = useCallback(async (accessToken: string, nextOffset: number = offset) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(nextOffset));
      if (q.trim()) params.set("q", q.trim());
      if (action.trim()) params.set("action", action.trim());
      if (resourceType.trim()) params.set("resource_type", resourceType.trim());
      if (sourceIp.trim()) params.set("source_ip", sourceIp.trim());

      const data = await authenticatedJson<AuditLogResponse>(
        API_BASE,
        `/audit-logs?${params.toString()}`,
        accessToken,
      );
      setItems(data.items);
      setTotal(data.total);
      setOffset(data.offset);
      setSelectedId((prev) => (prev && data.items.some((item) => item.id === prev) ? prev : (data.items[0]?.id ?? "")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [action, limit, offset, q, resourceType, sourceIp]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(token, 0);
  }, [token, load]);

  function nextPage() {
    if (!token) return;
    const nextOffset = offset + limit;
    if (nextOffset >= total) return;
    void load(token, nextOffset);
  }

  function prevPage() {
    if (!token) return;
    const nextOffset = Math.max(0, offset - limit);
    void load(token, nextOffset);
  }

  async function exportCsv() {
    if (!token) return;
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (action.trim()) params.set("action", action.trim());
      if (resourceType.trim()) params.set("resource_type", resourceType.trim());
      if (sourceIp.trim()) params.set("source_ip", sourceIp.trim());

      const response = await fetch(`${API_BASE}/audit-logs/export.csv?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = match?.[1] ?? "audit-log-export.csv";

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export CSV");
    } finally {
      setExporting(false);
    }
  }

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
              <h1 className="text-2xl font-semibold text-[#213552]">Audit Log</h1>
              <p className="mt-1 text-sm text-[#667896]">
                Track all tenant actions with actor, source IP, resource and operation details.
              </p>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="grid gap-2 md:grid-cols-6">
                <Input placeholder="Search (q)" value={q} onChange={(e) => setQ(e.target.value)} />
                <Input placeholder="Action" value={action} onChange={(e) => setAction(e.target.value)} />
                <Input placeholder="Resource type" value={resourceType} onChange={(e) => setResourceType(e.target.value)} />
                <Input placeholder="Source IP" value={sourceIp} onChange={(e) => setSourceIp(e.target.value)} />
                <Button onClick={() => token && load(token, 0)} disabled={loading}>
                  {loading ? "Loading..." : "Apply Filters"}
                </Button>
                <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting}>
                  {exporting ? "Exporting..." : "Export CSV"}
                </Button>
              </div>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                      <th className="py-2">Time</th>
                      <th className="py-2">Action</th>
                      <th className="py-2">Resource</th>
                      <th className="py-2">Actor</th>
                      <th className="py-2">Source IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer border-b border-[#eff3f8] ${selectedId === item.id ? "bg-[#f4f8ff]" : ""}`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <td className="py-2 text-[#4f6386]">{formatDate(item.created_at)}</td>
                        <td className="py-2"><Badge className={toneForAction(item.action)}>{item.action}</Badge></td>
                        <td className="py-2 text-[#334766]">{item.resource_type}</td>
                        <td className="py-2 text-[#334766]">{item.actor_user_email ?? item.actor_user_id ?? "system"}</td>
                        <td className="py-2 text-[#4f6386]">{item.source_ip ?? "-"}</td>
                      </tr>
                    ))}
                    {!items.length ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-[#7586a3]">
                          No audit logs found for this filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-[#5f7393]">
                <p>Total: {total} | Showing {offset + 1}-{Math.min(offset + items.length, total || 0)}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={prevPage} disabled={offset <= 0}>Previous</Button>
                  <Button variant="outline" onClick={nextPage} disabled={offset + limit >= total}>Next</Button>
                </div>
              </div>
            </Card>

            <Card className="rounded-xl p-4">
              <h2 className="text-lg font-semibold text-[#213552]">Details</h2>
              {selected ? (
                <div className="mt-2 space-y-2 text-sm text-[#4f6386]">
                  <p><span className="font-semibold text-[#213552]">Action:</span> {selected.action}</p>
                  <p><span className="font-semibold text-[#213552]">Resource:</span> {selected.resource_type} ({selected.resource_id ?? "-"})</p>
                  <p><span className="font-semibold text-[#213552]">Actor User:</span> {selected.actor_user_email ?? selected.actor_user_id ?? "-"}</p>
                  <p><span className="font-semibold text-[#213552]">Actor API Token:</span> {selected.actor_api_token_id ?? "-"}</p>
                  <p><span className="font-semibold text-[#213552]">Source IP:</span> {selected.source_ip ?? "-"}</p>
                  <pre className="overflow-x-auto rounded-lg bg-[#0f1729] p-3 text-xs text-[#d4e0ff]">
                    {JSON.stringify(selected.details ?? {}, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[#667896]">Select one item to inspect details.</p>
              )}
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
