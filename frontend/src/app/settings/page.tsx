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
  smtp: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    from_email: string;
    use_tls: boolean;
    use_ssl: boolean;
    timeout_seconds: number;
    password_configured: boolean;
    source: "database" | "env_fallback";
  } | null;
  crawl: {
    internal_links_enabled: boolean;
    max_pages: number;
    max_depth: number;
    timeout_seconds: number;
    source: "database" | "env_fallback";
  } | null;
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
  max_file_size_mb: number;
  max_daily_jobs: number;
  max_monthly_jobs: number;
  current_running_jobs: number;
  current_pending_jobs: number;
  current_inflight_jobs: number;
  current_daily_jobs: number;
  current_monthly_jobs: number;
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
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_use_tls: boolean;
  smtp_use_ssl: boolean;
  smtp_timeout_seconds: string;
  smtp_clear_password: boolean;
  crawl_internal_links_enabled: boolean;
  crawl_max_pages: string;
  crawl_max_depth: string;
  crawl_timeout_seconds: string;
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
  smtp_enabled: false,
  smtp_host: "",
  smtp_port: "587",
  smtp_username: "",
  smtp_password: "",
  smtp_from_email: "",
  smtp_use_tls: true,
  smtp_use_ssl: false,
  smtp_timeout_seconds: "10",
  smtp_clear_password: false,
  crawl_internal_links_enabled: true,
  crawl_max_pages: "40",
  crawl_max_depth: "3",
  crawl_timeout_seconds: "90",
};

export default function SettingsPage() {
  const { token, ready, role } = useAuthGuard();
  const { t, locale } = useI18n();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queuePolicy, setQueuePolicy] = useState<QueuePolicyResponse | null>(null);
  const [upgradeRequests, setUpgradeRequests] = useState<TenantUpgradeRequest[]>([]);
  const [upgradeReason, setUpgradeReason] = useState("");
  const [requestingUpgrade, setRequestingUpgrade] = useState(false);
  const [smtpRecipient, setSmtpRecipient] = useState("");
  const [smtpPasswordConfigured, setSmtpPasswordConfigured] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canEdit = role === "superadmin";
  const uiText = {
    "pt-BR": {
      smtpTitle: "SMTP",
      smtpSubtitle: "Configure o envio de e-mail no nível da aplicação (somente SuperAdmin).",
      smtpEnabled: "SMTP habilitado",
      passwordConfigured: "Senha configurada",
      yes: "Sim",
      no: "Não",
      smtpHost: "Host SMTP",
      smtpPort: "Porta SMTP",
      smtpUsername: "Usuário SMTP",
      smtpPassword: "Senha SMTP (deixe em branco para manter a atual)",
      smtpFrom: "E-mail remetente",
      smtpTimeout: "Timeout em segundos",
      useTls: "Usar TLS",
      useSsl: "Usar SSL",
      clearStoredPassword: "Limpar senha SMTP salva",
      crawlTitle: "Crawler de Wiki (URL)",
      crawlSubtitle: "Controle global para rastrear links internos automaticamente na análise por URL.",
      crawlInternalLinks: "Rastrear links internos da wiki",
      crawlMaxPages: "Máximo de páginas por análise",
      crawlMaxDepth: "Profundidade máxima de links",
      crawlTimeout: "Timeout total do crawl (segundos)",
      planLabel: "Plano",
      syncRpm: "Sync req/min",
      asyncRpm: "Async req/min",
      urlRpm: "URL req/min",
      maxFilesBatch: "Máx. arquivos/lote",
      inflightUsage: "Uso em execução",
      maxFileSize: "Tamanho máx. arquivo",
      dailyJobs: "Jobs diários",
      monthlyJobs: "Jobs mensais",
      pendingQueue: "Fila pendente",
      inflightUsageShort: "Uso em execução",
      burstPerMin: "Burst/min",
      upgradeSuggested: "Upgrade sugerido",
      optionalUpgradeReason: "Justificativa opcional de negócio para solicitação de upgrade",
      requestPlanUpgrade: "Solicitar upgrade de plano",
      sendingRequest: "Enviando solicitação...",
      created: "Criado",
      from: "De",
      to: "Para",
      status: "Status",
      reason: "Motivo",
      adminNote: "Nota admin",
      quarantineThreshold: "Limiar de quarentena",
      blockThreshold: "Limiar de bloqueio",
      autoBlock: "Bloquear automaticamente alto risco",
      reportsRetention: "Dias de retenção de relatórios",
      filesRetention: "Dias de retenção de arquivos",
      oneEmailPerLine: "Um e-mail por linha, ou separado por vírgula",
      notifyWarning: "Notificar em warning",
      notifyCritical: "Notificar em crítico",
      notifyDeadLetter: "Notificar em dead-letter",
      recipientOptional: "E-mail destinatário (opcional: usuário atual será usado)",
      refreshLoading: "Atualizando...",
      settingsUpdated: "Configurações atualizadas com sucesso.",
      smtpTestFailed: "Falha ao enviar teste SMTP",
      loadFailed: "Falha ao carregar configurações",
      updateFailed: "Falha ao atualizar configurações",
      upgradeFailed: "Falha ao solicitar upgrade de plano",
    },
    "en-US": {
      smtpTitle: "SMTP",
      smtpSubtitle: "Configure outgoing email at application level (SuperAdmin only).",
      smtpEnabled: "SMTP Enabled",
      passwordConfigured: "Password configured",
      yes: "Yes",
      no: "No",
      smtpHost: "SMTP host",
      smtpPort: "SMTP port",
      smtpUsername: "SMTP username",
      smtpPassword: "SMTP password (leave blank to keep current)",
      smtpFrom: "From email",
      smtpTimeout: "Timeout seconds",
      useTls: "Use TLS",
      useSsl: "Use SSL",
      clearStoredPassword: "Clear stored SMTP password",
      crawlTitle: "Wiki Crawler (URL)",
      crawlSubtitle: "Global control to automatically follow internal wiki links during URL analysis.",
      crawlInternalLinks: "Follow internal wiki links",
      crawlMaxPages: "Max pages per analysis",
      crawlMaxDepth: "Max link depth",
      crawlTimeout: "Total crawl timeout (seconds)",
      planLabel: "Plan",
      syncRpm: "Sync req/min",
      asyncRpm: "Async req/min",
      urlRpm: "URL req/min",
      maxFilesBatch: "Max files/batch",
      inflightUsage: "In-flight usage",
      maxFileSize: "Max file size",
      dailyJobs: "Daily jobs",
      monthlyJobs: "Monthly jobs",
      pendingQueue: "Pending queue",
      inflightUsageShort: "In-flight usage",
      burstPerMin: "Burst/min",
      upgradeSuggested: "Upgrade suggested",
      optionalUpgradeReason: "Optional business justification for this upgrade request",
      requestPlanUpgrade: "Request Plan Upgrade",
      sendingRequest: "Sending request...",
      created: "Created",
      from: "From",
      to: "To",
      status: "Status",
      reason: "Reason",
      adminNote: "Admin Note",
      quarantineThreshold: "Quarantine threshold",
      blockThreshold: "Block threshold",
      autoBlock: "Auto-block high risk",
      reportsRetention: "Reports retention days",
      filesRetention: "Files retention days",
      oneEmailPerLine: "One email per line, or comma-separated",
      notifyWarning: "Notify on warning",
      notifyCritical: "Notify on critical",
      notifyDeadLetter: "Notify on dead-letter",
      recipientOptional: "Recipient email (optional: current user will be used)",
      refreshLoading: "Refreshing...",
      settingsUpdated: "Settings updated successfully.",
      smtpTestFailed: "Failed to send SMTP test",
      loadFailed: "Failed to load settings",
      updateFailed: "Failed to update settings",
      upgradeFailed: "Failed to request plan upgrade",
    },
    "es-ES": {
      smtpTitle: "SMTP",
      smtpSubtitle: "Configura el envío de correos a nivel de la aplicación (solo SuperAdmin).",
      smtpEnabled: "SMTP habilitado",
      passwordConfigured: "Contraseña configurada",
      yes: "Sí",
      no: "No",
      smtpHost: "Host SMTP",
      smtpPort: "Puerto SMTP",
      smtpUsername: "Usuario SMTP",
      smtpPassword: "Contraseña SMTP (déjalo vacío para mantener la actual)",
      smtpFrom: "Email remitente",
      smtpTimeout: "Timeout en segundos",
      useTls: "Usar TLS",
      useSsl: "Usar SSL",
      clearStoredPassword: "Limpiar contraseña SMTP guardada",
      crawlTitle: "Crawler de Wiki (URL)",
      crawlSubtitle: "Control global para rastrear enlaces internos automáticamente en análisis por URL.",
      crawlInternalLinks: "Rastrear enlaces internos de la wiki",
      crawlMaxPages: "Máximo de páginas por análisis",
      crawlMaxDepth: "Profundidad máxima de enlaces",
      crawlTimeout: "Timeout total del rastreo (segundos)",
      planLabel: "Plan",
      syncRpm: "Sync req/min",
      asyncRpm: "Async req/min",
      urlRpm: "URL req/min",
      maxFilesBatch: "Máx. archivos/lote",
      inflightUsage: "Uso en ejecución",
      maxFileSize: "Tamaño máx. archivo",
      dailyJobs: "Jobs diarios",
      monthlyJobs: "Jobs mensuales",
      pendingQueue: "Cola pendiente",
      inflightUsageShort: "Uso en ejecución",
      burstPerMin: "Burst/min",
      upgradeSuggested: "Upgrade sugerido",
      optionalUpgradeReason: "Justificación opcional para esta solicitud de upgrade",
      requestPlanUpgrade: "Solicitar upgrade de plan",
      sendingRequest: "Enviando solicitud...",
      created: "Creado",
      from: "De",
      to: "Para",
      status: "Estado",
      reason: "Motivo",
      adminNote: "Nota admin",
      quarantineThreshold: "Umbral de cuarentena",
      blockThreshold: "Umbral de bloqueo",
      autoBlock: "Bloquear automáticamente alto riesgo",
      reportsRetention: "Días de retención de reportes",
      filesRetention: "Días de retención de archivos",
      oneEmailPerLine: "Un email por línea, o separado por coma",
      notifyWarning: "Notificar en warning",
      notifyCritical: "Notificar en crítico",
      notifyDeadLetter: "Notificar en dead-letter",
      recipientOptional: "Email destinatario (opcional: se usará el usuario actual)",
      refreshLoading: "Actualizando...",
      settingsUpdated: "Configuración actualizada correctamente.",
      smtpTestFailed: "Error al enviar prueba SMTP",
      loadFailed: "Error al cargar configuración",
      updateFailed: "Error al actualizar configuración",
      upgradeFailed: "Error al solicitar upgrade de plan",
    },
  }[locale];

  useEffect(() => {
    if (!token || role !== "superadmin") return;
    void load(token);
  }, [token, role]);

  async function load(accessToken: string) {
    setLoading(true);
    setError("");
    try {
      const [data, policyData, upgradeData] = await Promise.all([
        authenticatedJson<SettingsResponse>(API_BASE, "/settings/current", accessToken),
        authenticatedJson<QueuePolicyResponse>(API_BASE, "/tenants/current/queue-policy", accessToken),
        authenticatedJson<TenantUpgradeRequest[]>(API_BASE, "/tenants/current/upgrade-requests", accessToken),
      ]);
      setQueuePolicy(policyData);
      setUpgradeRequests(upgradeData);
      setSmtpPasswordConfigured(Boolean(data.smtp?.password_configured));
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
        smtp_enabled: data.smtp?.enabled ?? false,
        smtp_host: data.smtp?.host ?? "",
        smtp_port: String(data.smtp?.port ?? 587),
        smtp_username: data.smtp?.username ?? "",
        smtp_password: "",
        smtp_from_email: data.smtp?.from_email ?? "",
        smtp_use_tls: data.smtp?.use_tls ?? true,
        smtp_use_ssl: data.smtp?.use_ssl ?? false,
        smtp_timeout_seconds: String(data.smtp?.timeout_seconds ?? 10),
        smtp_clear_password: false,
        crawl_internal_links_enabled: data.crawl?.internal_links_enabled ?? true,
        crawl_max_pages: String(data.crawl?.max_pages ?? 40),
        crawl_max_depth: String(data.crawl?.max_depth ?? 3),
        crawl_timeout_seconds: String(data.crawl?.timeout_seconds ?? 90),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : uiText.loadFailed);
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
        smtp: {
          enabled: form.smtp_enabled,
          host: form.smtp_host.trim(),
          port: Number(form.smtp_port),
          username: form.smtp_username.trim(),
          from_email: form.smtp_from_email.trim(),
          use_tls: form.smtp_use_tls,
          use_ssl: form.smtp_use_ssl,
          timeout_seconds: Number(form.smtp_timeout_seconds),
          password: form.smtp_password.trim() ? form.smtp_password : null,
          clear_password: form.smtp_clear_password,
        },
        crawl: {
          internal_links_enabled: form.crawl_internal_links_enabled,
          max_pages: Number(form.crawl_max_pages),
          max_depth: Number(form.crawl_max_depth),
          timeout_seconds: Number(form.crawl_timeout_seconds),
        },
      };

      const updated = await authenticatedJson<SettingsResponse>(API_BASE, "/settings/current", token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSmtpPasswordConfigured(Boolean(updated.smtp?.password_configured));
      setForm((prev) => ({ ...prev, smtp_password: "", smtp_clear_password: false }));
      setSuccess(uiText.settingsUpdated);
    } catch (err) {
      setError(err instanceof Error ? err.message : uiText.updateFailed);
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
      setError(err instanceof Error ? err.message : uiText.upgradeFailed);
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
      setError(err instanceof Error ? err.message : uiText.smtpTestFailed);
    } finally {
      setTestingSmtp(false);
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (!ready || !token) {
    return <div className="min-h-screen grid place-items-center">{t("common.preparing")}</div>;
  }
  if (!role) {
    return <div className="min-h-screen grid place-items-center">{t("common.preparing")}</div>;
  }
  if (role !== "superadmin") {
    return (
      <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-4 lg:p-5">
            <div className="mx-auto w-full max-w-[860px]">
              <Card className="rounded-xl border-red-200 bg-red-50 p-4 text-red-700">
                {t("superadmin.accessDenied")}
              </Card>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">{t("settings.title")}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                {t("settings.subtitle")}
              </p>
            </Card>

            <Card className="rounded-xl p-4">
              <p className="text-sm font-semibold text-[var(--color-text)]">{uiText.smtpTitle}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {uiText.smtpSubtitle}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-soft)]">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={form.smtp_enabled}
                    onChange={(e) => update("smtp_enabled", e.target.checked)}
                    disabled={!canEdit}
                  />
                  {uiText.smtpEnabled}
                </label>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                  {uiText.passwordConfigured}: {form.smtp_clear_password ? uiText.no : smtpPasswordConfigured ? uiText.yes : uiText.no}
                </div>
                <Input
                  placeholder={uiText.smtpHost}
                  value={form.smtp_host}
                  onChange={(e) => update("smtp_host", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  placeholder={uiText.smtpPort}
                  value={form.smtp_port}
                  onChange={(e) => update("smtp_port", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  placeholder={uiText.smtpUsername}
                  value={form.smtp_username}
                  onChange={(e) => update("smtp_username", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  type="password"
                  placeholder={uiText.smtpPassword}
                  value={form.smtp_password}
                  onChange={(e) => update("smtp_password", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  type="email"
                  placeholder={uiText.smtpFrom}
                  value={form.smtp_from_email}
                  onChange={(e) => update("smtp_from_email", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  type="number"
                  min={1}
                  max={120}
                  placeholder={uiText.smtpTimeout}
                  value={form.smtp_timeout_seconds}
                  onChange={(e) => update("smtp_timeout_seconds", e.target.value)}
                  disabled={!canEdit}
                />
                <label className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-soft)]">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={form.smtp_use_tls}
                    onChange={(e) => update("smtp_use_tls", e.target.checked)}
                    disabled={!canEdit}
                  />
                  {uiText.useTls}
                </label>
                <label className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-soft)]">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={form.smtp_use_ssl}
                    onChange={(e) => update("smtp_use_ssl", e.target.checked)}
                    disabled={!canEdit}
                  />
                  {uiText.useSsl}
                </label>
                <label className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-soft)] md:col-span-2">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={form.smtp_clear_password}
                    onChange={(e) => update("smtp_clear_password", e.target.checked)}
                    disabled={!canEdit}
                  />
                  {uiText.clearStoredPassword}
                </label>
              </div>
              <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                <p className="text-sm font-semibold text-[var(--color-text)]">{t("settings.smtpTest")}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t("settings.smtpTestDesc")}</p>
                <div className="mt-2 flex flex-col gap-2 md:flex-row">
                  <Input
                    type="email"
                    placeholder={uiText.recipientOptional}
                    value={smtpRecipient}
                    onChange={(e) => setSmtpRecipient(e.target.value)}
                    disabled={!canEdit}
                  />
                  <Button type="button" variant="outline" onClick={() => void testSmtp()} disabled={!canEdit || testingSmtp}>
                    {testingSmtp ? `${t("common.saving").replace("...", "")}...` : t("settings.sendTest")}
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="rounded-xl p-4">
              <p className="text-sm font-semibold text-[var(--color-text)]">{uiText.crawlTitle}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{uiText.crawlSubtitle}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-soft)] md:col-span-2">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={form.crawl_internal_links_enabled}
                    onChange={(e) => update("crawl_internal_links_enabled", e.target.checked)}
                    disabled={!canEdit}
                  />
                  {uiText.crawlInternalLinks}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  placeholder={uiText.crawlMaxPages}
                  value={form.crawl_max_pages}
                  onChange={(e) => update("crawl_max_pages", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  type="number"
                  min={0}
                  max={10}
                  placeholder={uiText.crawlMaxDepth}
                  value={form.crawl_max_depth}
                  onChange={(e) => update("crawl_max_depth", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  type="number"
                  min={5}
                  max={600}
                  placeholder={uiText.crawlTimeout}
                  value={form.crawl_timeout_seconds}
                  onChange={(e) => update("crawl_timeout_seconds", e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </Card>

            {queuePolicy ? (
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">{t("settings.planLimits")}</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.planLabel}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.plan.toUpperCase()}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.syncRpm}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.sync_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.asyncRpm}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.async_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.urlRpm}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.url_requests_per_minute}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.maxFilesBatch}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.max_files_per_batch}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.inflightUsage}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">
                      {queuePolicy.current_inflight_jobs}/{queuePolicy.max_inflight_jobs}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.maxFileSize}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">{queuePolicy.max_file_size_mb} MB</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.dailyJobs}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">
                      {queuePolicy.current_daily_jobs}/{queuePolicy.max_daily_jobs}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">{uiText.monthlyJobs}</p>
                    <p className="text-lg font-semibold text-[var(--color-heading)]">
                      {queuePolicy.current_monthly_jobs}/{queuePolicy.max_monthly_jobs}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                  {uiText.pendingQueue}: {queuePolicy.current_pending_jobs}/{queuePolicy.max_pending_jobs} ({queuePolicy.pending_usage_percent}%) | {uiText.inflightUsageShort}: {queuePolicy.inflight_usage_percent}% | {uiText.burstPerMin}: {queuePolicy.burst_per_minute}
                </p>
                {queuePolicy.upgrade_recommended ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-semibold">
                      {uiText.upgradeSuggested}: {queuePolicy.recommended_plan?.toUpperCase()}
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {queuePolicy.upgrade_reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <textarea
                      className="mt-3 h-20 w-full rounded-md border border-amber-200 bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-warn-text)]"
                      placeholder={uiText.optionalUpgradeReason}
                      value={upgradeReason}
                      onChange={(e) => setUpgradeReason(e.target.value)}
                      disabled={!canEdit}
                    />
                    <div className="mt-2">
                      <Button type="button" onClick={() => void createUpgradeRequest()} disabled={!canEdit || requestingUpgrade}>
                        {requestingUpgrade ? uiText.sendingRequest : uiText.requestPlanUpgrade}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            ) : null}

            <Card className="rounded-xl p-4">
              <h2 className="text-lg font-semibold text-[var(--color-heading)]">{t("settings.upgradeRequests")}</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                      <th className="py-2">{uiText.created}</th>
                      <th className="py-2">{uiText.from}</th>
                      <th className="py-2">{uiText.to}</th>
                      <th className="py-2">{uiText.status}</th>
                      <th className="py-2">{uiText.reason}</th>
                      <th className="py-2">{uiText.adminNote}</th>
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
                          {t("settings.noUpgradeRequests")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            <form onSubmit={onSubmit} className="space-y-4">
              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">{t("settings.security")}</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder={uiText.quarantineThreshold}
                    value={form.quarantine_threshold}
                    onChange={(e) => update("quarantine_threshold", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder={uiText.blockThreshold}
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
                    {uiText.autoBlock}
                  </label>
                </div>
              </Card>

              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">{t("settings.retention")}</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    placeholder={uiText.reportsRetention}
                    value={form.reports_days}
                    onChange={(e) => update("reports_days", e.target.value)}
                    disabled={!canEdit}
                  />
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    placeholder={uiText.filesRetention}
                    value={form.files_days}
                    onChange={(e) => update("files_days", e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </Card>

              <Card className="rounded-xl p-4">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">{t("settings.notifications")}</h2>
                <div className="mt-3 space-y-3">
                  <textarea
                    className="h-28 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                    placeholder={uiText.oneEmailPerLine}
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
                      {uiText.notifyWarning}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={form.notify_on_critical}
                        onChange={(e) => update("notify_on_critical", e.target.checked)}
                        disabled={!canEdit}
                      />
                      {uiText.notifyCritical}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={form.notify_on_dead_letter}
                        onChange={(e) => update("notify_on_dead_letter", e.target.checked)}
                        disabled={!canEdit}
                      />
                      {uiText.notifyDeadLetter}
                    </label>
                  </div>
                </div>
              </Card>

              <Card className="rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={saving || !canEdit}>
                    {saving ? t("common.saving") : t("settings.save")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => token && load(token)} disabled={loading}>
                    {loading ? uiText.refreshLoading : t("common.refresh")}
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
