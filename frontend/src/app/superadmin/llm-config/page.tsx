"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { authenticatedJson } from "@/lib/auth";

type UserMe = {
  id: string;
  role: string;
  email: string;
};

type TenantCurrent = {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "growth" | "business" | "enterprise";
};

type TenantQueuePolicy = {
  plan: TenantCurrent["plan"];
  max_inflight_jobs: number;
  max_pending_jobs: number;
  burst_per_minute: number;
  current_running_jobs: number;
  current_pending_jobs: number;
  current_inflight_jobs: number;
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
  const [me, setMe] = useState<UserMe | null>(null);
  const [tenant, setTenant] = useState<TenantCurrent | null>(null);
  const [queuePolicy, setQueuePolicy] = useState<TenantQueuePolicy | null>(null);
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
  const [savingPlan, setSavingPlan] = useState(false);
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

  useEffect(() => {
    if (!token) return;
    void bootstrap(token);
  }, [token]);

  useEffect(() => {
    if (!selectedProvider) return;
    const existing = configs[selectedProvider.key];

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

  async function bootstrap(accessToken: string) {
    setLoading(true);
    setError("");

    try {
      const [meData, tenantData, queuePolicyData, providersData, configsData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<TenantCurrent>(API_BASE, "/tenants/current", accessToken),
        authenticatedJson<TenantQueuePolicy>(API_BASE, "/tenants/current/queue-policy", accessToken),
        authenticatedJson<LLMProviderInfo[]>(API_BASE, "/admin/llm-config/providers", accessToken),
        authenticatedJson<LLMConfigOut[]>(API_BASE, "/admin/llm-config/configs", accessToken),
      ]);

      setMe(meData);
      setTenant(tenantData);
      setQueuePolicy(queuePolicyData);
      setProviders(providersData);

      const byProvider = configsData.reduce<Record<string, LLMConfigOut>>((acc, row) => {
        acc[row.provider_key] = row;
        return acc;
      }, {});
      setConfigs(byProvider);

      if (!selectedProviderKey && providersData.length > 0) {
        setSelectedProviderKey(providersData[0].key);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SuperAdmin settings");
    } finally {
      setLoading(false);
    }
  }

  async function saveTenantPlan(plan: TenantCurrent["plan"]) {
    if (!token || !tenant) return;

    setSavingPlan(true);
    setError("");
    setSuccess("");
    try {
      const updated = await authenticatedJson<TenantCurrent>(API_BASE, "/tenants/current/plan", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const policy = await authenticatedJson<TenantQueuePolicy>(API_BASE, "/tenants/current/queue-policy", token);
      setTenant(updated);
      setQueuePolicy(policy);
      setSuccess(`Tenant plan updated to ${updated.plan}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tenant plan");
    } finally {
      setSavingPlan(false);
    }
  }

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
      setSuccess(`${data.models.length} model(s) loaded.`);
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
      setSuccess("Provider configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider configuration");
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !token) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f7f9fc] text-[#4c5f82]">
        Preparing your workspace...
      </div>
    );
  }

  const isAdmin = me ? me.role === "admin" : true;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <h1 className="text-2xl font-semibold text-[#213552]">SuperAdmin LLM Configuration</h1>
              <p className="mt-1 text-sm text-[#667896]">
                Configure provider token, endpoint, model selection, and activation app-wide.
              </p>
              {tenant ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#e7edf8] bg-[#f8fbff] p-3">
                  <div className="min-w-[220px]">
                    <p className="text-xs text-[#5d7194]">Tenant</p>
                    <p className="text-sm font-semibold text-[#213552]">{tenant.name}</p>
                  </div>
                  <div className="min-w-[180px]">
                    <p className="text-xs text-[#5d7194]">Current Plan</p>
                    <select
                      value={tenant.plan}
                      onChange={(e) => {
                        const nextPlan = e.target.value as TenantCurrent["plan"];
                        void saveTenantPlan(nextPlan);
                      }}
                      className="mt-1 h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                      disabled={savingPlan}
                    >
                      <option value="starter">Starter</option>
                      <option value="growth">Growth</option>
                      <option value="business">Business</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  {savingPlan ? <Badge className="bg-amber-100 text-amber-700">Saving plan...</Badge> : null}
                </div>
              ) : null}
              {queuePolicy ? (
                <div className="mt-3 grid gap-2 rounded-lg border border-[#e7edf8] bg-white p-3 text-xs text-[#4f6386] md:grid-cols-3">
                  <div>
                    <p className="text-[#7789a7]">Inflight</p>
                    <p className="font-semibold text-[#213552]">
                      {queuePolicy.current_inflight_jobs} / {queuePolicy.max_inflight_jobs}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#7789a7]">Pending Queue</p>
                    <p className="font-semibold text-[#213552]">
                      {queuePolicy.current_pending_jobs} / {queuePolicy.max_pending_jobs}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#7789a7]">Burst (60s)</p>
                    <p className="font-semibold text-[#213552]">{queuePolicy.burst_per_minute}</p>
                  </div>
                </div>
              ) : null}
            </Card>

            {!isAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4">
                <h2 className="text-lg font-semibold text-red-700">Access denied</h2>
                <p className="mt-1 text-sm text-red-700">
                  This page is available only for app admins/superadmins.
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.7fr]">
                <Card className="rounded-xl p-4">
                  <h2 className="text-xl font-semibold text-[#213552]">Providers</h2>
                  <p className="mt-1 text-sm text-[#667896]">
                    Select an LLM provider to configure.
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
                              ? "border-[var(--color-primary)] bg-[#edf3ff]"
                              : "border-[#e5ecf7] bg-white hover:bg-[#f8fbff]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#213552]">{provider.label}</p>
                            <Badge className={providerGroupTone(provider.family)}>{provider.family}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-[#6f80a0]">{provider.default_base_url}</p>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <Badge
                              className={
                                providerConfig?.is_enabled
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-700"
                              }
                            >
                              {providerConfig?.is_enabled ? "Enabled" : "Disabled"}
                            </Badge>
                            <Badge
                              className={
                                providerConfig?.token_configured
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 text-slate-700"
                              }
                            >
                              {providerConfig?.token_configured ? "Token configured" : "No token"}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}

                    {!providers.length && !loading ? (
                      <p className="rounded-lg border border-dashed border-[#dbe5f4] px-3 py-6 text-center text-sm text-[#7182a1]">
                        No providers found.
                      </p>
                    ) : null}
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold text-[#213552]">
                      {selectedProvider ? selectedProvider.label : "Provider details"}
                    </h2>
                    {selectedProvider ? (
                      <Badge className="bg-[#eef4ff] text-[#32558f]">{selectedProvider.key}</Badge>
                    ) : null}
                  </div>

                  {selectedProvider ? (
                    <div className="space-y-3">
                      <p className="rounded-lg border border-[#e7edf8] bg-[#f9fbff] px-3 py-2 text-xs text-[#607392]">
                        {selectedProvider.notes}
                      </p>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[#324a6f]">Provider label</label>
                        <Input
                          value={form.provider_label}
                          onChange={(e) => setForm((prev) => ({ ...prev, provider_label: e.target.value }))}
                          placeholder="Provider display name"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[#324a6f]">Base URL</label>
                        <Input
                          value={form.base_url}
                          onChange={(e) => setForm((prev) => ({ ...prev, base_url: e.target.value }))}
                          placeholder="https://api.provider.com/v1"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[#324a6f]">
                          {selectedProvider.token_label}
                        </label>
                        <Input
                          type="password"
                          value={form.api_token}
                          onChange={(e) => setForm((prev) => ({ ...prev, api_token: e.target.value }))}
                          placeholder="Enter token/API key"
                        />
                        <p className="mt-1 text-xs text-[#7084a5]">
                          Leave blank to keep the stored token. Current: {selectedConfig?.token_preview ?? "none"}
                        </p>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[#324a6f]">Selected model</label>
                        <select
                          value={form.selected_model}
                          onChange={(e) => setForm((prev) => ({ ...prev, selected_model: e.target.value }))}
                          className="h-11 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                        >
                          <option value="">Select a model</option>
                          {models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                            </option>
                          ))}
                        </select>
                        {selectedConfig?.selected_model ? (
                          <p className="mt-1 text-xs text-[#7084a5]">
                            Current model: <span className="font-semibold">{selectedConfig.selected_model}</span>
                          </p>
                        ) : null}
                      </div>

                      <label className="flex items-center gap-2 rounded-lg border border-[#e4ebf7] bg-[#fbfcff] px-3 py-2 text-sm text-[#324a6f]">
                        <input
                          type="checkbox"
                          checked={form.is_enabled}
                          onChange={(e) => setForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
                          className="h-4 w-4"
                        />
                        Enable this provider for app-wide analysis workflows
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={fetchModels}
                          disabled={loadingModels || saving || !form.base_url}
                        >
                          {loadingModels ? "Fetching models..." : "Fetch available models"}
                        </Button>
                        <Button type="button" onClick={saveConfig} disabled={saving || loadingModels}>
                          {saving ? "Saving..." : "Save provider configuration"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-[#dbe5f4] px-3 py-10 text-center text-sm text-[#7182a1]">
                      Select a provider to start configuration.
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
