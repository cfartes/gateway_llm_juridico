"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useI18n } from "@/hooks/use-i18n";
import { authenticatedJson } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type TenantUser = {
  id: string;
  tenant_id: string;
  full_name: string | null;
  email: string;
  role: "admin" | "analyst" | "viewer" | "superadmin";
  is_active: boolean;
  email_verified_at: string | null;
  must_change_password: boolean;
  created_at: string;
};

type UserMe = { role: string };
type UpdatePayload = { full_name?: string; role?: "admin" | "analyst" | "viewer"; is_active?: boolean };

export default function UsersPage() {
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();
  const [me, setMe] = useState<UserMe | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "analyst" | "viewer">("analyst");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowSavingId, setRowSavingId] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "analyst" | "viewer">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [emailFilter, setEmailFilter] = useState<"all" | "confirmed" | "pending">("all");
  const [offset, setOffset] = useState(0);
  const pageSize = 10;
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canManage = me ? me.role === "admin" || me.role === "superadmin" : false;

  const load = useCallback(async (accessToken: string, nextOffset: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter === "active") params.set("is_active", "true");
      if (statusFilter === "inactive") params.set("is_active", "false");
      if (emailFilter === "confirmed") params.set("email_confirmed", "true");
      if (emailFilter === "pending") params.set("email_confirmed", "false");
      params.set("limit", String(pageSize));
      params.set("offset", String(Math.max(0, nextOffset)));
      const [meData, userData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<TenantUser[]>(API_BASE, `/users?${params.toString()}`, accessToken),
      ]);
      setMe(meData);
      setUsers(userData);
      setOffset(Math.max(0, nextOffset));
      setHasNextPage(userData.length === pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [emailFilter, query, roleFilter, statusFilter]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(token, 0);
  }, [token, load]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!token || !canManage) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<TenantUser>(API_BASE, "/users", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          role,
        }),
      });
      setFullName("");
      setEmail("");
      setRole("analyst");
      setSuccess(t("users.created"));
      await load(token, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function patchUser(userId: string, payload: UpdatePayload, successMessage: string) {
    if (!token || !canManage) return;
    setRowSavingId(userId);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<TenantUser>(API_BASE, `/users/${userId}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSuccess(successMessage);
      await load(token, offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setRowSavingId("");
    }
  }

  async function resendInvite(userId: string) {
    if (!token || !canManage) return;
    setRowSavingId(userId);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<TenantUser>(API_BASE, `/users/${userId}/resend-invite`, token, {
        method: "POST",
      });
      setSuccess("Invitation email resent and temporary password reset to Mudar@123.");
      await load(token, offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend invitation");
    } finally {
      setRowSavingId("");
    }
  }

  async function resetTemporaryPassword(userId: string) {
    if (!token || !canManage) return;
    setRowSavingId(userId);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<TenantUser>(API_BASE, `/users/${userId}/reset-temp-password`, token, {
        method: "POST",
      });
      setSuccess("Temporary password reset to Mudar@123. User must change password on next login.");
      await load(token, offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset temporary password");
    } finally {
      setRowSavingId("");
    }
  }

  if (!ready || !token) return <div className="min-h-screen grid place-items-center">{t("common.preparing")}</div>;

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">{t("users.title")}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">{t("users.subtitle")}</p>
            </Card>

            <form onSubmit={createUser}>
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">{t("users.create")}</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!canManage} required />
                  <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canManage} required />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "admin" | "analyst" | "viewer")}
                    className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
                    disabled={!canManage}
                  >
                    <option value="analyst">Analyst</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button type="submit" disabled={!canManage || saving}>
                    {saving ? `${t("users.create")}...` : t("users.create")}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">Temporary password: <code>Mudar@123</code>. User can login only after email confirmation.</p>
              </Card>
            </form>

            <Card className="rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">{t("users.list")}</h2>
                <Button variant="outline" onClick={() => token && load(token, offset)} disabled={loading}>
                  {loading ? "Refreshing..." : t("common.refresh")}
                </Button>
              </div>
              <div className="mb-3 grid gap-2 md:grid-cols-5">
                <Input placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "all" | "admin" | "analyst" | "viewer")} className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm">
                  <option value="all">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="analyst">Analyst</option>
                  <option value="viewer">Viewer</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")} className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm">
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select value={emailFilter} onChange={(e) => setEmailFilter(e.target.value as "all" | "confirmed" | "pending")} className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm">
                  <option value="all">All email states</option>
                  <option value="confirmed">Email confirmed</option>
                  <option value="pending">Email pending</option>
                </select>
                <Button type="button" variant="outline" onClick={() => token && load(token, 0)} disabled={loading}>
                  Apply Filters
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                      <th className="py-2">Name</th>
                      <th className="py-2">Email</th>
                      <th className="py-2">Role</th>
                      <th className="py-2">Email Confirmed</th>
                      <th className="py-2">First Access</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--color-border-soft)]">
                        <td className="py-2 text-[var(--color-text)]">{item.full_name || "-"}</td>
                        <td className="py-2 text-[var(--color-text)]">{item.email}</td>
                        <td className="py-2 text-[var(--color-text)]">
                          {item.role === "superadmin" ? (
                            <span>SUPERADMIN</span>
                          ) : (
                            <select
                              value={item.role}
                              onChange={(e) => void patchUser(item.id, { role: e.target.value as "admin" | "analyst" | "viewer" }, "User role updated.")}
                              className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-xs"
                              disabled={!canManage || rowSavingId === item.id}
                            >
                              <option value="analyst">Analyst</option>
                              <option value="viewer">Viewer</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                        </td>
                        <td className="py-2 text-[var(--color-text-soft)]">{item.email_verified_at ? "Yes" : "Pending"}</td>
                        <td className="py-2 text-[var(--color-text-soft)]">{item.must_change_password ? "Pending" : "Completed"}</td>
                        <td className="py-2 text-[var(--color-text-soft)]">{item.is_active ? "Active" : "Inactive"}</td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void patchUser(item.id, { is_active: !item.is_active }, item.is_active ? "User disabled." : "User enabled.")}
                              disabled={!canManage || rowSavingId === item.id}
                            >
                              {item.is_active ? "Disable" : "Enable"}
                            </Button>
                            {!item.email_verified_at ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void resendInvite(item.id)}
                                disabled={!canManage || rowSavingId === item.id}
                              >
                                Resend Invite
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void resetTemporaryPassword(item.id)}
                              disabled={!canManage || rowSavingId === item.id}
                            >
                              Reset Temp Password
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!users.length ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-[var(--color-text-soft)]">No users found for this tenant.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => token && load(token, Math.max(0, offset - pageSize))}
                  disabled={loading || offset === 0}
                >
                  Previous
                </Button>
                <span className="text-xs text-[var(--color-text-muted)]">Offset {offset}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => token && load(token, offset + pageSize)}
                  disabled={loading || !hasNextPage}
                >
                  Next
                </Button>
              </div>
            </Card>
          </div>
        </main>
      </div>
      {error ? <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t("common.error")}: {error}</div> : null}
      {success ? <div className="fixed bottom-4 left-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
    </div>
  );
}
