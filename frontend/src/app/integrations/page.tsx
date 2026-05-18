"use client";

import { FormEvent, useEffect, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useI18n } from "@/hooks/use-i18n";
import { authenticatedJson } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type IntegrationConfig = {
  webhook: {
    enabled: boolean;
    url: string | null;
    secret_configured: boolean;
    auth_bearer_configured: boolean;
  };
  siem: {
    enabled: boolean;
    provider: string | null;
    endpoint: string | null;
    auth_token_configured: boolean;
  };
  slack: {
    enabled: boolean;
    webhook_url: string | null;
    channel: string | null;
    bot_token_configured: boolean;
  };
  ops_alerts: {
    enabled: boolean;
    webhook_enabled: boolean;
    webhook_url: string | null;
    webhook_auth_bearer_configured: boolean;
    slack_enabled: boolean;
    teams_enabled: boolean;
    teams_webhook_url: string | null;
    email_enabled: boolean;
    email_recipients: string[];
  };
};

type UserMe = {
  role: string;
};

type TestAlertResponse = {
  status: string;
  event_type: string;
  tenant_id: string;
  channels: Record<string, boolean>;
};

type FormState = {
  webhook_enabled: boolean;
  webhook_url: string;
  webhook_secret: string;
  webhook_clear_secret: boolean;
  webhook_auth_bearer: string;
  webhook_clear_auth_bearer: boolean;
  siem_enabled: boolean;
  siem_provider: string;
  siem_endpoint: string;
  siem_auth_token: string;
  siem_clear_auth_token: boolean;
  slack_enabled: boolean;
  slack_webhook_url: string;
  slack_channel: string;
  slack_bot_token: string;
  slack_clear_bot_token: boolean;
  ops_alerts_enabled: boolean;
  ops_alert_webhook_enabled: boolean;
  ops_alert_webhook_url: string;
  ops_alert_webhook_auth_bearer: string;
  ops_alert_clear_webhook_auth_bearer: boolean;
  ops_alert_slack_enabled: boolean;
  ops_alert_teams_enabled: boolean;
  ops_alert_teams_webhook_url: string;
  ops_alert_email_enabled: boolean;
  ops_alert_email_recipients: string;
};

const INITIAL_FORM: FormState = {
  webhook_enabled: false,
  webhook_url: "",
  webhook_secret: "",
  webhook_clear_secret: false,
  webhook_auth_bearer: "",
  webhook_clear_auth_bearer: false,
  siem_enabled: false,
  siem_provider: "",
  siem_endpoint: "",
  siem_auth_token: "",
  siem_clear_auth_token: false,
  slack_enabled: false,
  slack_webhook_url: "",
  slack_channel: "",
  slack_bot_token: "",
  slack_clear_bot_token: false,
  ops_alerts_enabled: false,
  ops_alert_webhook_enabled: false,
  ops_alert_webhook_url: "",
  ops_alert_webhook_auth_bearer: "",
  ops_alert_clear_webhook_auth_bearer: false,
  ops_alert_slack_enabled: false,
  ops_alert_teams_enabled: false,
  ops_alert_teams_webhook_url: "",
  ops_alert_email_enabled: false,
  ops_alert_email_recipients: "",
};

export default function IntegrationsPage() {
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();
  const [me, setMe] = useState<UserMe | null>(null);
  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
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
      const [meData, configData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<IntegrationConfig>(API_BASE, "/integrations/current", accessToken),
      ]);
      setMe(meData);
      setConfig(configData);
      setForm({
        ...INITIAL_FORM,
        webhook_enabled: configData.webhook.enabled,
        webhook_url: configData.webhook.url ?? "",
        siem_enabled: configData.siem.enabled,
        siem_provider: configData.siem.provider ?? "",
        siem_endpoint: configData.siem.endpoint ?? "",
        slack_enabled: configData.slack.enabled,
        slack_webhook_url: configData.slack.webhook_url ?? "",
        slack_channel: configData.slack.channel ?? "",
        ops_alerts_enabled: configData.ops_alerts.enabled,
        ops_alert_webhook_enabled: configData.ops_alerts.webhook_enabled,
        ops_alert_webhook_url: configData.ops_alerts.webhook_url ?? "",
        ops_alert_slack_enabled: configData.ops_alerts.slack_enabled,
        ops_alert_teams_enabled: configData.ops_alerts.teams_enabled,
        ops_alert_teams_webhook_url: configData.ops_alerts.teams_webhook_url ?? "",
        ops_alert_email_enabled: configData.ops_alerts.email_enabled,
        ops_alert_email_recipients: (configData.ops_alerts.email_recipients ?? []).join(", "),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
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
      const payload = {
        webhook: {
          enabled: form.webhook_enabled,
          url: form.webhook_url.trim() || null,
          secret: form.webhook_secret.trim() || null,
          clear_secret: form.webhook_clear_secret,
          auth_bearer: form.webhook_auth_bearer.trim() || null,
          clear_auth_bearer: form.webhook_clear_auth_bearer,
        },
        siem: {
          enabled: form.siem_enabled,
          provider: form.siem_provider.trim() || null,
          endpoint: form.siem_endpoint.trim() || null,
          auth_token: form.siem_auth_token.trim() || null,
          clear_auth_token: form.siem_clear_auth_token,
        },
        slack: {
          enabled: form.slack_enabled,
          webhook_url: form.slack_webhook_url.trim() || null,
          channel: form.slack_channel.trim() || null,
          bot_token: form.slack_bot_token.trim() || null,
          clear_bot_token: form.slack_clear_bot_token,
        },
        ops_alerts: {
          enabled: form.ops_alerts_enabled,
          webhook_enabled: form.ops_alert_webhook_enabled,
          webhook_url: form.ops_alert_webhook_url.trim() || null,
          webhook_auth_bearer: form.ops_alert_webhook_auth_bearer.trim() || null,
          clear_webhook_auth_bearer: form.ops_alert_clear_webhook_auth_bearer,
          slack_enabled: form.ops_alert_slack_enabled,
          teams_enabled: form.ops_alert_teams_enabled,
          teams_webhook_url: form.ops_alert_teams_webhook_url.trim() || null,
          email_enabled: form.ops_alert_email_enabled,
          email_recipients: form.ops_alert_email_recipients
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      };
      const updated = await authenticatedJson<IntegrationConfig>(API_BASE, "/integrations/current", token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setConfig(updated);
      setForm((prev) => ({
        ...prev,
        webhook_secret: "",
        webhook_auth_bearer: "",
        siem_auth_token: "",
        slack_bot_token: "",
        ops_alert_webhook_auth_bearer: "",
        webhook_clear_secret: false,
        webhook_clear_auth_bearer: false,
        siem_clear_auth_token: false,
        slack_clear_bot_token: false,
        ops_alert_clear_webhook_auth_bearer: false,
      }));
      setSuccess(t("integrations.updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update integrations");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestAlert() {
    if (!token || !canEdit) return;
    setTestingAlert(true);
    setError("");
    setSuccess("");
    try {
      const result = await authenticatedJson<TestAlertResponse>(API_BASE, "/integrations/test-alert", token, {
        method: "POST",
      });
      const activeChannels = Object.entries(result.channels)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(", ");
      setSuccess(`Test alert queued successfully (${activeChannels || "no active channel"}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test alert");
    } finally {
      setTestingAlert(false);
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (!ready || !token) {
    return <div className="min-h-screen grid place-items-center">{t("common.preparing")}</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">{t("integrations.title")}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                {t("integrations.subtitle")}
              </p>
            </Card>

            <form onSubmit={onSubmit} className="space-y-4">
              <Card className="rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Webhook</h2>
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.webhook_enabled}
                      onChange={(e) => update("webhook_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    {t("common.enabled")}
                  </label>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Webhook URL"
                    value={form.webhook_url}
                    onChange={(e) => update("webhook_url", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    placeholder="Webhook Secret (new value)"
                    value={form.webhook_secret}
                    onChange={(e) => update("webhook_secret", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    placeholder="Webhook Bearer Token (new value)"
                    value={form.webhook_auth_bearer}
                    onChange={(e) => update("webhook_auth_bearer", e.target.value)}
                    disabled={!canEdit}
                  />
                  <div className="flex gap-4 text-sm text-[var(--color-text-soft)]">
                    <label>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={form.webhook_clear_secret}
                        onChange={(e) => update("webhook_clear_secret", e.target.checked)}
                        disabled={!canEdit}
                      />
                      Clear Secret
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={form.webhook_clear_auth_bearer}
                        onChange={(e) => update("webhook_clear_auth_bearer", e.target.checked)}
                        disabled={!canEdit}
                      />
                      Clear Bearer
                    </label>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-soft)]">
                  Secret configured: {config?.webhook.secret_configured ? "yes" : "no"} | Bearer configured: {config?.webhook.auth_bearer_configured ? "yes" : "no"}
                </p>
              </Card>

              <Card className="rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">SIEM</h2>
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.siem_enabled}
                      onChange={(e) => update("siem_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    {t("common.enabled")}
                  </label>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Provider (Splunk, Sentinel, Elastic...)"
                    value={form.siem_provider}
                    onChange={(e) => update("siem_provider", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    placeholder="SIEM Endpoint URL"
                    value={form.siem_endpoint}
                    onChange={(e) => update("siem_endpoint", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    placeholder="SIEM Auth Token (new value)"
                    value={form.siem_auth_token}
                    onChange={(e) => update("siem_auth_token", e.target.value)}
                    disabled={!canEdit}
                  />
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.siem_clear_auth_token}
                      onChange={(e) => update("siem_clear_auth_token", e.target.checked)}
                      disabled={!canEdit}
                    />
                    Clear SIEM token
                  </label>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-soft)]">
                  Auth token configured: {config?.siem.auth_token_configured ? "yes" : "no"}
                </p>
              </Card>

              <Card className="rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Slack / ChatOps</h2>
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.slack_enabled}
                      onChange={(e) => update("slack_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    {t("common.enabled")}
                  </label>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Slack Webhook URL"
                    value={form.slack_webhook_url}
                    onChange={(e) => update("slack_webhook_url", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    placeholder="Slack Channel (#soc-alerts)"
                    value={form.slack_channel}
                    onChange={(e) => update("slack_channel", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    placeholder="Slack Bot Token (new value)"
                    value={form.slack_bot_token}
                    onChange={(e) => update("slack_bot_token", e.target.value)}
                    disabled={!canEdit}
                  />
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.slack_clear_bot_token}
                      onChange={(e) => update("slack_clear_bot_token", e.target.checked)}
                      disabled={!canEdit}
                    />
                    Clear bot token
                  </label>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-soft)]">
                  Bot token configured: {config?.slack.bot_token_configured ? "yes" : "no"}
                </p>
              </Card>

              <Card className="rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Ops Alerts (Tenant)</h2>
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.ops_alerts_enabled}
                      onChange={(e) => update("ops_alerts_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    {t("common.enabled")}
                  </label>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                  Alertas operacionais do tenant (SLO breach/recovery e webhook dead-letter).
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.ops_alert_webhook_enabled}
                      onChange={(e) => update("ops_alert_webhook_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    Send to webhook
                  </label>
                  <Input
                    placeholder="Ops alert webhook URL"
                    value={form.ops_alert_webhook_url}
                    onChange={(e) => update("ops_alert_webhook_url", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    placeholder="Ops alert webhook bearer (new value)"
                    value={form.ops_alert_webhook_auth_bearer}
                    onChange={(e) => update("ops_alert_webhook_auth_bearer", e.target.value)}
                    disabled={!canEdit}
                  />
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.ops_alert_clear_webhook_auth_bearer}
                      onChange={(e) => update("ops_alert_clear_webhook_auth_bearer", e.target.checked)}
                      disabled={!canEdit}
                    />
                    Clear webhook bearer
                  </label>
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.ops_alert_slack_enabled}
                      onChange={(e) => update("ops_alert_slack_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    Send to Slack (uses Slack webhook above)
                  </label>
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.ops_alert_teams_enabled}
                      onChange={(e) => update("ops_alert_teams_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    Send to Teams
                  </label>
                  <Input
                    placeholder="Teams webhook URL"
                    value={form.ops_alert_teams_webhook_url}
                    onChange={(e) => update("ops_alert_teams_webhook_url", e.target.value)}
                    disabled={!canEdit}
                  />
                  <label className="text-sm text-[var(--color-text-soft)]">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={form.ops_alert_email_enabled}
                      onChange={(e) => update("ops_alert_email_enabled", e.target.checked)}
                      disabled={!canEdit}
                    />
                    Send to email
                  </label>
                  <Input
                    placeholder="Email recipients (comma separated)"
                    value={form.ops_alert_email_recipients}
                    onChange={(e) => update("ops_alert_email_recipients", e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-soft)]">
                  Webhook bearer configured: {config?.ops_alerts.webhook_auth_bearer_configured ? "yes" : "no"}
                </p>
              </Card>

              <Card className="rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={saving || !canEdit}>
                    {saving ? t("common.saving") : t("integrations.save")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void sendTestAlert()} disabled={testingAlert || !canEdit}>
                    {testingAlert ? t("common.sending") : "Send Test Alert"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => token && load(token)} disabled={loading}>
                    {loading ? t("common.refreshing") : t("common.refresh")}
                  </Button>
                </div>
              </Card>
            </form>
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
