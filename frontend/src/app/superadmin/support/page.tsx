"use client";

import { useCallback, useEffect, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { authenticatedJson } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type Ticket = {
  id: string;
  tenant_id: string;
  subject: string;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  admin_note: string | null;
  created_at: string;
};

type UserMe = { role: string };

export default function SuperAdminSupportPage() {
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<UserMe | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      if (tenantFilter.trim()) params.set("tenant_id", tenantFilter.trim());
      const [meData, ticketData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<Ticket[]>(API_BASE, `/admin/support/tickets?${params.toString()}`, accessToken),
      ]);
      setMe(meData);
      setTickets(ticketData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, tenantFilter]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(token);
  }, [token, load]);

  async function updateStatus(ticketId: string, status: Ticket["status"]) {
    if (!token) return;
    setSavingId(ticketId);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<Ticket>(API_BASE, `/admin/support/tickets/${ticketId}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_note: note.trim() || null, assigned_to_user_id: null }),
      });
      setSuccess(`Ticket ${status}.`);
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    } finally {
      setSavingId("");
    }
  }

  const isSuperAdmin = me ? me.role === "superadmin" : true;
  if (!ready || !token) return <div className="min-h-screen grid place-items-center">Preparing your workspace...</div>;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[#213552]">SuperAdmin Support Desk</h1>
              <p className="mt-1 text-sm text-[#667896]">Triage and resolve customer support tickets.</p>
            </Card>
            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4 text-red-700">Access denied.</Card>
            ) : (
              <Card className="rounded-xl p-4">
                <div className="mb-3 grid gap-2 md:grid-cols-4">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <Input placeholder="Tenant ID filter" value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} />
                  <Input placeholder="Admin note for actions" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button variant="outline" onClick={() => token && load(token)} disabled={loading}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                        <th className="py-2">Created</th>
                        <th className="py-2">Tenant</th>
                        <th className="py-2">Subject</th>
                        <th className="py-2">Priority</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((t) => (
                        <tr key={t.id} className="border-b border-[#eff3f8]">
                          <td className="py-2 text-[#4f6386]">{new Date(t.created_at).toLocaleString()}</td>
                          <td className="py-2 text-[#334766]">{t.tenant_id}</td>
                          <td className="py-2 text-[#334766]">{t.subject}</td>
                          <td className="py-2 text-[#334766]">{t.priority.toUpperCase()}</td>
                          <td className="py-2 text-[#334766]">{t.status.toUpperCase()}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => void updateStatus(t.id, "in_progress")} disabled={savingId === t.id}>
                                In Progress
                              </Button>
                              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void updateStatus(t.id, "resolved")} disabled={savingId === t.id}>
                                Resolve
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!tickets.length ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-[#7586a3]">No tickets found.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </main>
      </div>
      {error ? <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Error: {error}</div> : null}
      {success ? <div className="fixed bottom-4 left-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
    </div>
  );
}
