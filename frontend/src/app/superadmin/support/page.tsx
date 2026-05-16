"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";

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

type TicketMessage = {
  id: string;
  ticket_id: string;
  tenant_id: string;
  author_user_id: string | null;
  author_role: string;
  message: string;
  is_internal: boolean;
  created_at: string;
};

type TicketAttachment = {
  id: string;
  ticket_id: string;
  tenant_id: string;
  message_id: string | null;
  uploaded_by_user_id: string | null;
  uploaded_by_role: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  is_internal: boolean;
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
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [threadMessage, setThreadMessage] = useState("");
  const [attachmentMessageId, setAttachmentMessageId] = useState("");
  const [threadInternal, setThreadInternal] = useState(false);
  const [sendingThread, setSendingThread] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
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

  async function loadThread(ticketId: string) {
    if (!token) return;
    setSelectedTicketId(ticketId);
    setError("");
    try {
      const data = await authenticatedJson<TicketMessage[]>(API_BASE, `/admin/support/tickets/${ticketId}/messages`, token);
      const att = await authenticatedJson<TicketAttachment[]>(API_BASE, `/admin/support/tickets/${ticketId}/attachments`, token);
      setThread(data);
      setAttachments(att);
      setAttachmentMessageId(data.length ? data[data.length - 1].id : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load thread");
    }
  }

  async function sendThreadMessage() {
    if (!token || !selectedTicketId || !threadMessage.trim()) return;
    setSendingThread(true);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<TicketMessage>(API_BASE, `/admin/support/tickets/${selectedTicketId}/messages`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: threadMessage.trim(), is_internal: threadInternal }),
      });
      setThreadMessage("");
      setThreadInternal(false);
      setSuccess("Message posted.");
      await loadThread(selectedTicketId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post message");
    } finally {
      setSendingThread(false);
    }
  }

  async function uploadAttachment(event: ChangeEvent<HTMLInputElement>) {
    if (!token || !selectedTicketId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingAttachment(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("is_internal", threadInternal ? "true" : "false");
      if (attachmentMessageId) formData.append("message_id", attachmentMessageId);
      const response = await fetch(`${API_BASE}/admin/support/tickets/${selectedTicketId}/attachments`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) throw new Error(await response.text());
      setSuccess("Attachment uploaded.");
      await loadThread(selectedTicketId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload attachment");
    } finally {
      event.target.value = "";
      setUploadingAttachment(false);
    }
  }

  async function downloadAttachment(attachmentId: string, filename: string) {
    if (!token || !selectedTicketId) return;
    setError("");
    try {
      const response = await fetch(`${API_BASE}/admin/support/tickets/${selectedTicketId}/attachments/${attachmentId}/download`, {
        method: "GET",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download attachment");
    }
  }

  const isSuperAdmin = me ? me.role === "superadmin" : true;
  if (!ready || !token) return <div className="min-h-screen grid place-items-center">Preparing your workspace...</div>;

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">SuperAdmin Support Desk</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">Triage and resolve customer support tickets.</p>
            </Card>
            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4 text-red-700">Access denied.</Card>
            ) : (
              <Card className="rounded-xl p-4">
                <div className="mb-3 grid gap-2 md:grid-cols-4">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
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
                      <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                        <th className="py-2">Created</th>
                        <th className="py-2">Tenant</th>
                        <th className="py-2">Subject</th>
                        <th className="py-2">Priority</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Action</th>
                        <th className="py-2">Thread</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((t) => (
                        <tr key={t.id} className="border-b border-[var(--color-border-soft)]">
                          <td className="py-2 text-[var(--color-text-soft)]">{new Date(t.created_at).toLocaleString()}</td>
                          <td className="py-2 text-[var(--color-text)]">{t.tenant_id}</td>
                          <td className="py-2 text-[var(--color-text)]">{t.subject}</td>
                          <td className="py-2 text-[var(--color-text)]">{t.priority.toUpperCase()}</td>
                          <td className="py-2 text-[var(--color-text)]">{t.status.toUpperCase()}</td>
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
                          <td className="py-2">
                            <Button variant="outline" onClick={() => void loadThread(t.id)}>
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!tickets.length ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-[var(--color-text-soft)]">No tickets found.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {isSuperAdmin && selectedTicketId ? (
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">Ticket Thread</h2>
                <p className="mt-1 text-xs text-[var(--color-text-soft)]">Ticket: {selectedTicketId}</p>
                <div className="mt-3 space-y-2">
                  {thread.map((msg) => (
                    <div key={msg.id} className={`rounded-lg border p-3 ${msg.is_internal ? "border-amber-200 bg-amber-50" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {new Date(msg.created_at).toLocaleString()} | {msg.author_role}
                        {msg.is_internal ? " | internal" : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text)]">{msg.message}</p>
                    </div>
                  ))}
                  {!thread.length ? (
                    <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-4 text-center text-sm text-[var(--color-text-soft)]">
                      No messages yet.
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">Attachments</h3>
                  <div className="mt-2 space-y-2">
                    {attachments.map((att) => (
                      <div key={att.id} className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${att.is_internal ? "border-amber-200 bg-amber-50" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
                        <span className="text-[var(--color-text)]">
                          {att.original_name} ({Math.round(att.size_bytes / 1024)} KB)
                          {att.is_internal ? " [internal]" : ""}
                          {att.message_id ? ` | linked to message ${att.message_id.slice(0, 8)}` : ""}
                        </span>
                        <Button type="button" variant="outline" onClick={() => void downloadAttachment(att.id, att.original_name)}>
                          Download
                        </Button>
                      </div>
                    ))}
                    {!attachments.length ? <p className="text-xs text-[var(--color-text-soft)]">No attachments yet.</p> : null}
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Link attachment to message (optional)</label>
                    <select
                      value={attachmentMessageId}
                      onChange={(e) => setAttachmentMessageId(e.target.value)}
                      className="mb-2 h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
                    >
                      <option value="">No message link</option>
                      {thread.map((msg) => (
                        <option key={msg.id} value={msg.id}>
                          {new Date(msg.created_at).toLocaleString()} | {msg.author_role} | {msg.message.slice(0, 48)}
                        </option>
                      ))}
                    </select>
                    <input type="file" onChange={uploadAttachment} disabled={uploadingAttachment} />
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">Internal flag follows checkbox below when uploading.</p>
                  </div>
                </div>
                <textarea
                  className="mt-3 h-24 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  placeholder="Write a reply"
                  value={threadMessage}
                  onChange={(e) => setThreadMessage(e.target.value)}
                />
                <label className="mt-2 inline-flex items-center text-sm text-[var(--color-text-soft)]">
                  <input type="checkbox" className="mr-2" checked={threadInternal} onChange={(e) => setThreadInternal(e.target.checked)} />
                  Internal note (hidden from tenant)
                </label>
                <div className="mt-2 flex gap-2">
                  <Button type="button" onClick={() => void sendThreadMessage()} disabled={sendingThread}>
                    {sendingThread ? "Sending..." : "Send Message"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void loadThread(selectedTicketId)}>
                    Refresh Thread
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        </main>
      </div>
      {error ? <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Error: {error}</div> : null}
      {success ? <div className="fixed bottom-4 left-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
    </div>
  );
}
