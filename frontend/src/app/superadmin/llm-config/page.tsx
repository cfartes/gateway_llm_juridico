"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useI18n } from "@/hooks/use-i18n";
import { authenticatedJson } from "@/lib/auth";

type UserMe = {
  id: string;
  role: string;
  email: string;
};

type LLMProviderInfo = {
  key: string;
  label: string;
  family: string;
  default_base_url: string;
  token_label: string;
  notes: string;
};

type LLMConfigOut = {
  id: string;
  provider_key: string;
  provider_label: string;
  base_url: string;
  selected_model: string | null;
  is_enabled: boolean;
  token_configured: boolean;
  token_preview: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderModel = {
  id: string;
  label: string;
};

type ModelsResponse = {
  provider_key: string;
  models: ProviderModel[];
};

type FormState = {
  provider_label: string;
  base_url: string;
  selected_model: string;
  is_enabled: boolean;
  api_token: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function providerGroupTone(family: string): string {
  switch (family) {
    case "openai":
      return "bg-blue-100 text-blue-700";
    case "anthropic":
      return "bg-orange-100 text-orange-700";
    case "gemini":
      return "bg-emerald-100 text-emerald-700";
    case "manus":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function LLMConfigPage() {
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();
  const [me, setMe] = useState<UserMe | null>(null);
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [configs, setConfigs] = useState<Record<string, LLMConfigOut>>({});
  const [selectedProviderKey, setSelectedProviderKey] = useState("");
  const [form, setForm] = useState<FormState>({
    provider_label: "",
    base_url: "",
    selected_model: "",
    is_enabled: false,
    api_token: "",
  });
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedProvider = useMemo(
    () => providers.find((item) => item.key === selectedProviderKey) ?? null,
    [providers, selectedProviderKey],
  );

  const selectedConfig = useMemo(
    () => (selectedProviderKey ? configs[selectedProviderKey] : undefined),
    [configs, selectedProviderKey],
  );

  const bootstrap = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");

    try {
      const [meData, providersData, configsData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<LLMProviderInfo[]>(API_BASE, "/admin/llm-config/providers", accessToken),
        authenticatedJson<LLMConfigOut[]>(API_BASE, "/admin/llm-config/configs", accessToken),
      ]);

      setMe(meData);
      setProviders(providersData);

      const byProvider = configsData.reduce<Record<string, LLMConfigOut>>((acc, row) => {
        acc[row.provider_key] = row;
        return acc;
      }, {});
      setConfigs(byProvider);
      setSelectedProviderKey((prev) => prev || providersData[0]?.key || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SuperAdmin settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void bootstrap(token);
  }, [token, bootstrap]);

  useEffect(() => {
    if (!selectedProvider) return;
    const existing = configs[selectedProvider.key];

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      provider_label: existing?.provider_label ?? selectedProvider.label,
      base_url: existing?.base_url ?? selectedProvider.default_base_url,
      selected_model: existing?.selected_model ?? "",
      is_enabled: existing?.is_enabled ?? false,
      api_token: "",
    });
    setModels([]);
    setError("");
    setSuccess("");
  }, [selectedProvider, configs]);

  async function fetchModels() {
    if (!token || !selectedProvider) return;

    setLoadingModels(true);
    setError("");
    setSuccess("");
    try {
      const data = await authenticatedJson<ModelsResponse>(
        API_BASE,
        `/admin/llm-config/configs/${selectedProvider.key}/fetch-models`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base_url: form.base_url || null,
            api_token: form.api_token.trim() ? form.api_token.trim() : null,
          }),
        },
      );

      setModels(data.models);
      if (data.models.length > 0 && !form.selected_model) {
        setForm((prev) => ({ ...prev, selected_model: data.models[0].id }));
      }
      setSuccess(`${data.models.length} ${t("common.modelsLoaded")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch models");
    } finally {
      setLoadingModels(false);
    }
  }

  async function saveConfig() {
    if (!token || !selectedProvider) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        provider_label: form.provider_label,
        base_url: form.base_url,
        selected_model: form.selected_model || null,
        is_enabled: form.is_enabled,
        api_token: form.api_token.trim() ? form.api_token.trim() : null,
      };

      const updated = await authenticatedJson<LLMConfigOut>(
        API_BASE,
        `/admin/llm-config/configs/${selectedProvider.key}`,
        token,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      setConfigs((prev) => ({ ...prev, [updated.provider_key]: updated }));
      setForm((prev) => ({ ...prev, api_token: "" }));
      setSuccess(t("common.saveProviderConfig"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider configuration");
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !token) {
    return (
        <div className="min-h-screen grid place-items-center bg-[var(--color-bg-app)] text-[var(--color-text-soft)]">
        {t("common.preparing")}
      </div>
    );
  }

  const isSuperAdmin = me ? me.role === "superadmin" : true;

  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">{t("superadmin.llm.title")}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                {t("superadmin.llm.subtitle")}
              </p>
            </Card>

            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4">
                <h2 className="text-lg font-semibold text-red-700">{t("common.error")}</h2>
                <p className="mt-1 text-sm text-red-700">
                  {t("superadmin.accessDenied")}
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.7fr]">
                <Card className="rounded-xl p-4">
                  <h2 className="text-xl font-semibold text-[var(--color-heading)]">{t("common.providers")}</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                    {t("common.selectProviderConfigure")}
                  </p>

                  <div className="mt-3 space-y-2">
                    {providers.map((provider) => {
                      const active = provider.key === selectedProviderKey;
                      const providerConfig = configs[provider.key];
                      return (
                        <button
                          type="button"
                          key={provider.key}
                          onClick={() => setSelectedProviderKey(provider.key)}
                          className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                            active
                              ? "border-[var(--color-primary)] bg-[var(--color-surface-alt)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-alt)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[var(--color-heading)]">{provider.label}</p>
                            <Badge className={providerGroupTone(provider.family)}>{provider.family}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{provider.default_base_url}</p>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <Badge
                              className={
                                providerConfig?.is_enabled
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-700"
                              }
                            >
                              {providerConfig?.is_enabled ? t("common.enabled") : t("common.disabled")}
                            </Badge>
                            <Badge
                              className={
                                providerConfig?.token_configured
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 text-slate-700"
                              }
                            >
                              {providerConfig?.token_configured ? t("common.tokenConfigured") : t("common.noToken")}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}

                    {!providers.length && !loading ? (
                      <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-sm text-[var(--color-text-soft)]">
                        {t("common.noData")}
                      </p>
                    ) : null}
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold text-[var(--color-heading)]">
                      {selectedProvider ? selectedProvider.label : t("common.providerDetails")}
                    </h2>
                    {selectedProvider ? (
                      <Badge className="bg-[var(--color-surface-alt)] text-[var(--color-primary)]">{selectedProvider.key}</Badge>
                    ) : null}
                  </div>

                  {selectedProvider ? (
                    <div className="space-y-3">
                      <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-xs text-[var(--color-text-soft)]">
                        {selectedProvider.notes}
                      </p>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--color-text-soft)]">{t("common.providerLabel")}</label>
                        <Input
                          value={form.provider_label}
                          onChange={(e) => setForm((prev) => ({ ...prev, provider_label: e.target.value }))}
                          placeholder={t("common.providerLabel")}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--color-text-soft)]">{t("common.baseUrl")}</label>
                        <Input
                          value={form.base_url}
                          onChange={(e) => setForm((prev) => ({ ...prev, base_url: e.target.value }))}
                          placeholder={t("common.baseUrl")}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--color-text-soft)]">
                          {selectedProvider.token_label}
                        </label>
                        <Input
                          type="password"
                          value={form.api_token}
                          onChange={(e) => setForm((prev) => ({ ...prev, api_token: e.target.value }))}
                          placeholder={t("common.enterToken")}
                        />
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                          {t("common.keepStoredToken")} {selectedConfig?.token_preview ?? "none"}
                        </p>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--color-text-soft)]">{t("common.selectedModel")}</label>
                        <select
                          value={form.selected_model}
                          onChange={(e) => setForm((prev) => ({ ...prev, selected_model: e.target.value }))}
                          className="h-11 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                        >
                          <option value="">{t("common.selectModel")}</option>
                          {models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                            </option>
                          ))}
                        </select>
                        {selectedConfig?.selected_model ? (
                          <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                            {t("common.currentModel")}: <span className="font-semibold">{selectedConfig.selected_model}</span>
                          </p>
                        ) : null}
                      </div>

                      <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-soft)]">
                        <input
                          type="checkbox"
                          checked={form.is_enabled}
                          onChange={(e) => setForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
                          className="h-4 w-4"
                        />
                        {t("common.enableProvider")}
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={fetchModels}
                          disabled={loadingModels || saving || !form.base_url}
                        >
                          {loadingModels ? t("common.fetchingModels") : t("common.fetchAvailableModels")}
                        </Button>
                        <Button type="button" onClick={saveConfig} disabled={saving || loadingModels}>
                          {saving ? t("common.saving") : t("common.saveProviderConfig")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-10 text-center text-sm text-[var(--color-text-soft)]">
                      {t("common.selectProviderToStart")}
                    </p>
                  )}
                </Card>
              </div>
            )}
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
