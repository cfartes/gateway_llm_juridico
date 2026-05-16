"use client";

import { FormEvent, useEffect, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { authenticatedJson } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type SettingsResponse = {
  security: {
    quarantine_threshold: number;
    block_threshold: number;
    auto_block_enabled: boolean;
  };
  retention: {
    reports_days: number;
    files_days: number;
  };
  notifications: {
    emails: string[];
    notify_on_warning: boolean;
    notify_on_critical: boolean;
    notify_on_dead_letter: boolean;
  };
};

type QueuePolicyResponse = {
  plan: "starter" | "growth" | "business" | "enterprise";
  max_inflight_jobs: number;
  max_pending_jobs: number;
  burst_per_minute: number;
  sync_requests_per_minute: number;
  async_requests_per_minute: number;
  url_requests_per_minute: number;
  max_files_per_batch: number;
  current_running_jobs: number;
  current_pending_jobs: number;
  current_inflight_jobs: number;
  inflight_usage_percent: number;
  pending_usage_percent: number;
  upgrade_recommended: boolean;
  recommended_plan: "starter" | "growth" | "business" | "enterprise" | null;
  upgrade_reasons: string[];
};

type UpgradeRequestStatus = "pending" | "approved" | "rejected";

type TenantUpgradeRequest = {
  id: string;
  tenant_id: string;
  requested_by_user_id: string | null;
  current_plan: "starter" | "growth" | "business" | "enterprise";
  requested_plan: "starter" | "growth" | "business" | "enterprise";
  status: UpgradeRequestStatus;
  reason: string | null;
  admin_note: string | null;
  processed_by_user_id: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserMe = {
  role: string;
};

type FormState = {
  quarantine_threshold: string;
  block_threshold: string;
  auto_block_enabled: boolean;
  reports_days: string;
  files_days: string;
  emails: string;
  notify_on_warning: boolean;
  notify_on_critical: boolean;
  notify_on_dead_letter: boolean;
};

const INITIAL_FORM: FormState = {
  quarantine_threshold: "55",
  block_threshold: "80",
  auto_block_enabled: false,
  reports_days: "30",
  files_days: "30",
  emails: "",
  notify_on_warning: true,
  notify_on_critical: true,
  notify_on_dead_letter: true,
};

export default function SettingsPage() {
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<UserMe | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queuePolicy, setQueuePolicy] = useState<QueuePolicyResponse | null>(null);
  const [upgradeRequests, setUpgradeRequests] = useState<TenantUpgradeRequest[]>([]);
  const [upgradeReason, setUpgradeReason] = useState("");
  const [requestingUpgrade, setRequestingUpgrade] = useState(false);
  const [smtpRecipient, setSmtpRecipient] = useState("");
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canEdit = me ? (me.role === "admin" || me.role === "superadmin") : false;

  useEffect(() => {
    if (!token) return;
    void load(token);
  }, [token]);

  async function load(accessToken: string) {
    setLoading(true);
    setError("");
    try {
      const [meData, data, policyData, upgradeData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<SettingsResponse>(API_BASE, "/settings/current", accessToken),
        authenticatedJson<QueuePolicyResponse>(API_BASE, "/tenants/current/queue-policy", accessToken),
        authenticatedJson<TenantUpgradeRequest[]>(API_BASE, "/tenants/current/upgrade-requests", accessToken),
      ]);
      setMe(meData);
      setQueuePolicy(policyData);
      setUpgradeRequests(upgradeData);
      setForm({
        quarantine_threshold: String(data.security.quarantine_threshold),
        block_threshold: String(data.security.block_threshold),
        auto_block_enabled: data.security.auto_block_enabled,
        reports_days: String(data.retention.reports_days),
        files_days: String(data.retention.files_days),
        emails: data.notifications.emails.join("\n"),
        notify_on_warning: data.notifications.notify_on_warning,
        notify_on_critical: data.notifications.notify_on_critical,
        notify_on_dead_letter: data.notifications.notify_on_dead_letter,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !canEdit) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const emails = form.emails
        .split(/\r?\n|,/g)
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = {
        security: {
          quarantine_threshold: Number(form.quarantine_threshold),
          block_threshold: Number(form.block_threshold),
          auto_block_enabled: form.auto_block_enabled,
        },
        retention: {
          reports_days: Number(form.reports_days),
          files_days: Number(form.files_days),
        },
        notifications: {
          emails,
          notify_on_warning: form.notify_on_warning,
          notify_on_critical: form.notify_on_critical,
          notify_on_dead_letter: form.notify_on_dead_letter,
        },
      };

      await authenticatedJson<SettingsResponse>(API_BASE, "/settings/current", token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSuccess("Settings updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setSaving(false);
    }
  }

  async function createUpgradeRequest() {
    if (!token || !canEdit || !queuePolicy?.recommended_plan) return;
    setRequestingUpgrade(true);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<TenantUpgradeRequest>(API_BASE, "/tenants/current/upgrade-requests", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_plan: queuePolicy.recommended_plan,
          reason: upgradeReason.trim() || null,
        }),
      });
      setUpgradeReason("");
      setSuccess(`Upgrade request sent for plan ${queuePolicy.recommended_plan.toUpperCase()}.`);
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request plan upgrade");
    } finally {
      setRequestingUpgrade(false);
    }
  }

  async function testSmtp() {
    if (!token || !canEdit) return;
    setTestingSmtp(true);
    setError("");
    setSuccess("");
    try {
      const result = await authenticatedJson<{ sent: boolean; message: string }>(API_BASE, "/settings/test-smtp", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_email: smtpRecipient.trim() || null,
        }),
      });
      setSuccess(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send SMTP test");
    } finally {
      setTestingSmtp(false);
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (!ready || !token) {
    return <div className="min-h-screen grid place-items-center">Preparing your workspace...</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">Settings</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                Configure security thresholds, retention policy e notificações do tenant.
              </p>
            </Card>

            {queuePolicy ? (
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">Current Plan Limits</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Plan</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.plan.toUpperCase()}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Sync req/min</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.sync_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Async req/min</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.async_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">URL req/min</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.url_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Max files/batch</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.max_files_per_batch}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">In-flight usage</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">
                      {queuePolicy.current_inflight_jobs}/{queuePolicy.max_inflight_jobs}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                  Pending queue: {queuePolicy.current_pending_jobs}/{queuePolicy.max_pending_jobs} ({queuePolicy.pending_usage_percent}%) | In-flight usage: {queuePolicy.inflight_usage_percent}% | Burst/min: {queuePolicy.burst_per_minute}
                </p>
                {queuePolicy.upgrade_recommended ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-semibold">
                      Upgrade suggested: {queuePolicy.recommended_plan?.toUpperCase()}
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {queuePolicy.upgrade_reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <textarea
                      className="mt-3 h-20 w-full rounded-md border border-amber-200 bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-warn-text)]"
                      placeholder="Optional business justification for this upgrade request"
                      value={upgradeReason}
                      onChange={(e) => setUpgradeReason(e.target.value)}
                      disabled={!canEdit}
                    />
                    <div className="mt-2">
                      <Button type="button" onClick={() => void createUpgradeRequest()} disabled={!canEdit || requestingUpgrade}>
                        {requestingUpgrade ? "Sending request..." : "Request Plan Upgrade"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            ) : null}

            <Card className="rounded-xl p-4">
              <h2 className="text-lg font-semibold text-[var(--color-heading)]">Upgrade Requests</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                      <th className="py-2">Created</th>
                      <th className="py-2">From</th>
                      <th className="py-2">To</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Reason</th>
                      <th className="py-2">Admin Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upgradeRequests.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--color-border-soft)]">
                        <td className="py-2 text-[var(--color-text-soft)]">{new Date(item.created_at).toLocaleString()}</td>
                        <td className="py-2 text-[var(--color-text)]">{item.current_plan.toUpperCase()}</td>
                        <td className="py-2 text-[var(--color-text)]">{item.requested_plan.toUpperCase()}</td>
                        <td className="py-2">
                          <span className={`rounded px-2 py-1 text-xs ${
                            item.status === "approved"
                              ? "bg-emerald-100 text-emerald-700"
                              : item.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                          }`}>
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 text-[var(--color-text-soft)]">{item.reason || "-"}</td>
                        <td className="py-2 text-[var(--color-text-soft)]">{item.admin_note || "-"}</td>
                      </tr>
                    ))}
                    {!upgradeRequests.length ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-[var(--color-text-soft)]">
                          No upgrade requests yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            <form onSubmit={onSubmit} className="space-y-4">
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">Security</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Quarantine threshold"
                    value={form.quarantine_threshold}
                    onChange={(e) => update("quarantine_threshold", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Block threshold"
                    value={form.block_threshold}
                    onChange={(e) => update("block_threshold", e.target.value)}
                    disabled={!canEdit}
                  />
                  <label className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.auto_block_enabled}
                      onChange={(e) => update("auto_block_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    Auto-block high risk
                  </label>
                </div>
              </Card>

              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">Retention</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    placeholder="Reports retention days"
                    value={form.reports_days}
                    onChange={(e) => update("reports_days", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    placeholder="Files retention days"
                    value={form.files_days}
                    onChange={(e) => update("files_days", e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </Card>

              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">Notifications</h2>
                <div className="mt-3 space-y-3">
                  <textarea
                    className="h-28 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                    placeholder="One email per line, or comma-separated"
                    value={form.emails}
                    onChange={(e) => update("emails", e.target.value)}
                    disabled={!canEdit}
                  />
                  <div className="grid gap-2 md:grid-cols-3 text-sm text-[var(--color-text-soft)]">
                    <label>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={form.notify_on_warning}
                        onChange={(e) => update("notify_on_warning", e.target.checked)}
                        disabled={!canEdit}
                      />
                      Notify on warning
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={form.notify_on_critical}
                        onChange={(e) => update("notify_on_critical", e.target.checked)}
                        disabled={!canEdit}
                      />
                      Notify on critical
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={form.notify_on_dead_letter}
                        onChange={(e) => update("notify_on_dead_letter", e.target.checked)}
                        disabled={!canEdit}
                      />
                      Notify on dead-letter
                    </label>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                  <p className="text-sm font-semibold text-[var(--color-text)]">SMTP Test</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">Send a test email using current SMTP backend settings.</p>
                  <div className="mt-2 flex flex-col gap-2 md:flex-row">
                    <Input
                      type="email"
                      placeholder="Recipient email (optional: current user will be used)"
                      value={smtpRecipient}
                      onChange={(e) => setSmtpRecipient(e.target.value)}
                      disabled={!canEdit}
                    />
                    <Button type="button" variant="outline" onClick={() => void testSmtp()} disabled={!canEdit || testingSmtp}>
                      {testingSmtp ? "Sending..." : "Send SMTP Test"}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={saving || !canEdit}>
                    {saving ? "Saving..." : "Save Settings"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => token && load(token)} disabled={loading}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
              </Card>
            </form>
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
