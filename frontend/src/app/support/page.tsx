"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { authenticatedJson } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type SupportTicket = {
  id: string;
  tenant_id: string;
  requester_user_id: string | null;
  subject: string;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  description: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type SupportTicketMessage = {
  id: string;
  ticket_id: string;
  tenant_id: string;
  author_user_id: string | null;
  author_role: string;
  message: string;
  is_internal: boolean;
  created_at: string;
};

type SupportTicketAttachment = {
  id: string;
  ticket_id: string;
  tenant_id: string;
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

export default function SupportPage() {
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<UserMe | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState<SupportTicket["priority"]>("medium");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [thread, setThread] = useState<SupportTicketMessage[]>([]);
  const [attachments, setAttachments] = useState<SupportTicketAttachment[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canCreate = me ? (me.role === "superadmin" || me.role === "admin" || me.role === "analyst") : false;

  useEffect(() => {
    if (!token) return;
    void load(token);
  }, [token]);

  async function load(accessToken: string) {
    setLoading(true);
    setError("");
    try {
      const [meData, ticketData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<SupportTicket[]>(API_BASE, "/support/tickets", accessToken),
      ]);
      setMe(meData);
      setTickets(ticketData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }

  async function openTicket(event: FormEvent) {
    event.preventDefault();
    if (!token || !canCreate) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<SupportTicket>(API_BASE, "/support/tickets", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          category: category.trim(),
          priority,
          description: description.trim(),
        }),
      });
      setSubject("");
      setCategory("general");
      setPriority("medium");
      setDescription("");
      setSuccess("Support ticket opened successfully.");
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open support ticket");
    } finally {
      setSaving(false);
    }
  }

  async function loadThread(ticketId: string) {
    if (!token) return;
    setSelectedTicketId(ticketId);
    setError("");
    try {
      const items = await authenticatedJson<SupportTicketMessage[]>(API_BASE, `/support/tickets/${ticketId}/messages`, token);
      const att = await authenticatedJson<SupportTicketAttachment[]>(API_BASE, `/support/tickets/${ticketId}/attachments`, token);
      setThread(items);
      setAttachments(att);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket thread");
    }
  }

  async function sendThreadMessage() {
    if (!token || !selectedTicketId || !newMessage.trim()) return;
    setSendingMessage(true);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<SupportTicketMessage>(API_BASE, `/support/tickets/${selectedTicketId}/messages`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newMessage.trim(), is_internal: false }),
      });
      setNewMessage("");
      setSuccess("Message sent.");
      await loadThread(selectedTicketId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSendingMessage(false);
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
      const response = await fetch(`${API_BASE}/support/tickets/${selectedTicketId}/attachments`, {
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
      const response = await fetch(`${API_BASE}/support/tickets/${selectedTicketId}/attachments/${attachmentId}/download`, {
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

  if (!ready || !token) return <div className="min-h-screen grid place-items-center">Preparing your workspace...</div>;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[#213552]">Support Tickets</h1>
              <p className="mt-1 text-sm text-[#667896]">Open and track operational incidents from your tenant.</p>
            </Card>

            <form onSubmit={openTicket} className="space-y-4">
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[#213552]">Open New Ticket</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" disabled={!canCreate} />
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" disabled={!canCreate} />
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as SupportTicket["priority"])}
                    className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm"
                    disabled={!canCreate}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <div />
                </div>
                <textarea
                  className="mt-3 h-28 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue, impact, and steps to reproduce."
                  disabled={!canCreate}
                />
                <div className="mt-3 flex gap-2">
                  <Button type="submit" disabled={!canCreate || saving}>
                    {saving ? "Opening..." : "Open Ticket"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => token && load(token)} disabled={loading}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
              </Card>
            </form>

            <Card className="rounded-xl p-4">
              <h2 className="text-lg font-semibold text-[#213552]">My Tenant Tickets</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                      <th className="py-2">Created</th>
                      <th className="py-2">Subject</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Priority</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Admin Note</th>
                      <th className="py-2">Thread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((item) => (
                      <tr key={item.id} className="border-b border-[#eff3f8]">
                        <td className="py-2 text-[#4f6386]">{new Date(item.created_at).toLocaleString()}</td>
                        <td className="py-2 text-[#334766]">{item.subject}</td>
                        <td className="py-2 text-[#334766]">{item.category}</td>
                        <td className="py-2 text-[#334766]">{item.priority.toUpperCase()}</td>
                        <td className="py-2 text-[#334766]">{item.status.toUpperCase()}</td>
                        <td className="py-2 text-[#4f6386]">{item.admin_note || "-"}</td>
                        <td className="py-2">
                          <Button variant="outline" onClick={() => void loadThread(item.id)}>
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!tickets.length ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-[#7586a3]">No support tickets found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            {selectedTicketId ? (
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[#213552]">Ticket Thread</h2>
                <p className="mt-1 text-xs text-[#667896]">Ticket: {selectedTicketId}</p>
                <div className="mt-3 space-y-2">
                  {thread.map((msg) => (
                    <div key={msg.id} className="rounded-lg border border-[#e6edf8] bg-white p-3">
                      <p className="text-xs text-[#6f80a0]">
                        {new Date(msg.created_at).toLocaleString()} | {msg.author_role}
                      </p>
                      <p className="mt-1 text-sm text-[#2f4667] whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  ))}
                  {!thread.length ? (
                    <div className="rounded-lg border border-dashed border-[#d9e4f5] bg-[#fbfdff] px-3 py-4 text-center text-sm text-[#7586a3]">
                      No messages yet.
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 rounded-lg border border-[#e6edf8] bg-[#fbfdff] p-3">
                  <h3 className="text-sm font-semibold text-[#2c3f5f]">Attachments</h3>
                  <div className="mt-2 space-y-2">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between rounded border border-[#e8edf6] bg-white px-3 py-2 text-sm">
                        <span className="text-[#334766]">{att.original_name} ({Math.round(att.size_bytes / 1024)} KB)</span>
                        <Button type="button" variant="outline" onClick={() => void downloadAttachment(att.id, att.original_name)}>
                          Download
                        </Button>
                      </div>
                    ))}
                    {!attachments.length ? <p className="text-xs text-[#7586a3]">No attachments yet.</p> : null}
                  </div>
                  <div className="mt-3">
                    <input type="file" onChange={uploadAttachment} disabled={!canCreate || uploadingAttachment} />
                    <p className="mt-1 text-xs text-[#6f80a0]">Allowed formats follow secure upload policy. Max 20MB per attachment.</p>
                  </div>
                </div>
                <textarea
                  className="mt-3 h-24 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm"
                  placeholder="Write a reply"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={!canCreate}
                />
                <div className="mt-2 flex gap-2">
                  <Button type="button" onClick={() => void sendThreadMessage()} disabled={!canCreate || sendingMessage}>
                    {sendingMessage ? "Sending..." : "Send Message"}
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
