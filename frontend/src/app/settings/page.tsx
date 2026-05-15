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
      const [meData, data, policyData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<SettingsResponse>(API_BASE, "/settings/current", accessToken),
        authenticatedJson<QueuePolicyResponse>(API_BASE, "/tenants/current/queue-policy", accessToken),
      ]);
      setMe(meData);
      setQueuePolicy(policyData);
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

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
              <h1 className="text-2xl font-semibold text-[#213552]">Settings</h1>
              <p className="mt-1 text-sm text-[#667896]">
                Configure security thresholds, retention policy e notificações do tenant.
              </p>
            </Card>

            {queuePolicy ? (
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[#213552]">Current Plan Limits</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-[#e5ecf7] bg-[#fbfdff] p-3">
                    <p className="text-xs text-[#6f80a0]">Plan</p>
                    <p className="text-lg font-semibold text-[#1f3f72]">{queuePolicy.plan.toUpperCase()}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5ecf7] bg-[#fbfdff] p-3">
                    <p className="text-xs text-[#6f80a0]">Sync req/min</p>
                    <p className="text-lg font-semibold text-[#1f3f72]">{queuePolicy.sync_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5ecf7] bg-[#fbfdff] p-3">
                    <p className="text-xs text-[#6f80a0]">Async req/min</p>
                    <p className="text-lg font-semibold text-[#1f3f72]">{queuePolicy.async_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5ecf7] bg-[#fbfdff] p-3">
                    <p className="text-xs text-[#6f80a0]">URL req/min</p>
                    <p className="text-lg font-semibold text-[#1f3f72]">{queuePolicy.url_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5ecf7] bg-[#fbfdff] p-3">
                    <p className="text-xs text-[#6f80a0]">Max files/batch</p>
                    <p className="text-lg font-semibold text-[#1f3f72]">{queuePolicy.max_files_per_batch}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5ecf7] bg-[#fbfdff] p-3">
                    <p className="text-xs text-[#6f80a0]">In-flight usage</p>
                    <p className="text-lg font-semibold text-[#1f3f72]">
                      {queuePolicy.current_inflight_jobs}/{queuePolicy.max_inflight_jobs}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[#6f80a0]">
                  Pending queue: {queuePolicy.current_pending_jobs}/{queuePolicy.max_pending_jobs} | Burst/min: {queuePolicy.burst_per_minute}
                </p>
              </Card>
            ) : null}

            <form onSubmit={onSubmit} className="space-y-4">
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[#213552]">Security</h2>
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
                  <label className="rounded-lg border border-[#e4ebf7] bg-[#fbfcff] px-3 py-2 text-sm text-[#324a6f]">
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
                <h2 className="text-lg font-semibold text-[#213552]">Retention</h2>
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
                <h2 className="text-lg font-semibold text-[#213552]">Notifications</h2>
                <div className="mt-3 space-y-3">
                  <textarea
                    className="h-28 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm"
                    placeholder="One email per line, or comma-separated"
                    value={form.emails}
                    onChange={(e) => update("emails", e.target.value)}
                    disabled={!canEdit}
                  />
                  <div className="grid gap-2 md:grid-cols-3 text-sm text-[#324a6f]">
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
