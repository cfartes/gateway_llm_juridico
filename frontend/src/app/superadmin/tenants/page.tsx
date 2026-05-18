"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useI18n } from "@/hooks/use-i18n";
import { authenticatedJson } from "@/lib/auth";

type UserMe = {
  id: string;
  role: string;
  email: string;
};

type TenantPlan = "starter" | "growth" | "business" | "enterprise";

type SuperAdminTenant = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  plan: TenantPlan;
  cnpj: string | null;
  legal_name: string | null;
  postal_code: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  invoice_email: string | null;
  created_at: string;
  total_users: number;
  total_documents: number;
  total_scans: number;
  active_api_tokens: number;
};

type UpgradeRequest = {
  id: string;
  tenant_id: string;
  requested_by_user_id: string | null;
  current_plan: TenantPlan;
  requested_plan: TenantPlan;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  admin_note: string | null;
  processed_by_user_id: string | null;
  processed_at: string | null;
  created_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function formatDate(input?: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

function planTone(plan: TenantPlan): string {
  switch (plan) {
    case "enterprise":
      return "bg-emerald-100 text-emerald-700";
    case "business":
      return "bg-blue-100 text-blue-700";
    case "growth":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function SuperAdminTenantsPage() {
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();
  const [me, setMe] = useState<UserMe | null>(null);
  const [tenants, setTenants] = useState<SuperAdminTenant[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<TenantPlan>("starter");
  const [selectedActive, setSelectedActive] = useState(true);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [decisionNote, setDecisionNote] = useState("");
  const [processingRequestId, setProcessingRequestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedId) ?? null,
    [tenants, selectedId],
  );

  const bootstrap = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const [meData, tenantData, upgradeData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<SuperAdminTenant[]>(API_BASE, "/admin/tenants", accessToken),
        authenticatedJson<UpgradeRequest[]>(API_BASE, "/admin/tenants/upgrade-requests/list?status=pending", accessToken),
      ]);
      setMe(meData);
      setTenants(tenantData);
      setUpgradeRequests(upgradeData);
      const nextSelectedId = selectedId && tenantData.some((tenant) => tenant.id === selectedId)
        ? selectedId
        : (tenantData[0]?.id || "");
      setSelectedId(nextSelectedId);
      const selectedTenantFromResponse = tenantData.find((tenant) => tenant.id === nextSelectedId);
      if (selectedTenantFromResponse) {
        setSelectedPlan(selectedTenantFromResponse.plan);
        setSelectedActive(selectedTenantFromResponse.is_active);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load superadmin tenant data");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void bootstrap(token);
  }, [token, bootstrap]);

  async function refreshTenants() {
    if (!token) return;
    await bootstrap(token);
  }

  async function saveTenant() {
    if (!token || !selectedTenant) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await authenticatedJson<SuperAdminTenant>(
        API_BASE,
        `/admin/tenants/${selectedTenant.id}`,
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: selectedPlan, is_active: selectedActive }),
        },
      );
      setTenants((prev) => prev.map((tenant) => (tenant.id === updated.id ? updated : tenant)));
      setSuccess(t("common.tenantUpdated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tenant");
    } finally {
      setSaving(false);
    }
  }

  async function processUpgradeRequest(requestId: string, decision: "approved" | "rejected") {
    if (!token) return;
    setProcessingRequestId(requestId);
    setError("");
    setSuccess("");
    try {
      await authenticatedJson<UpgradeRequest>(API_BASE, `/admin/tenants/upgrade-requests/${requestId}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          admin_note: decisionNote.trim() || null,
          apply_plan_change: true,
        }),
      });
      setDecisionNote("");
      setSuccess(t("common.upgradeRequestProcessed"));
      await bootstrap(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process upgrade request");
    } finally {
      setProcessingRequestId("");
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-[var(--color-heading)]">{t("superadmin.tenants.title")}</h1>
                  <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                    {t("superadmin.tenants.subtitle")}
                  </p>
                </div>
                <Button variant="outline" onClick={refreshTenants} disabled={loading}>
                  {t("common.refresh")}
                </Button>
              </div>
            </Card>

            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4">
                <h2 className="text-lg font-semibold text-red-700">{t("common.error")}</h2>
                <p className="mt-1 text-sm text-red-700">{t("superadmin.accessDenied")}</p>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <Card className="rounded-xl p-4">
                  <h2 className="mb-3 text-xl font-semibold text-[var(--color-heading)]">{t("common.tenants")}</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                          <th className="py-2">{t("common.tenant")}</th>
                          <th className="py-2">CNPJ</th>
                          <th className="py-2">{t("common.slug")}</th>
                          <th className="py-2">{t("common.plan")}</th>
                          <th className="py-2">{t("common.status")}</th>
                          <th className="py-2">{t("common.users")}</th>
                          <th className="py-2">{t("common.documents")}</th>
                          <th className="py-2">Scans</th>
                          <th className="py-2">API Tokens</th>
                          <th className="py-2">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.map((tenant) => (
                          <tr
                            key={tenant.id}
                            className={`cursor-pointer border-b border-[var(--color-border-soft)] ${selectedId === tenant.id ? "bg-[var(--color-surface-alt)]" : ""}`}
                            onClick={() => {
                              setSelectedId(tenant.id);
                              setSelectedPlan(tenant.plan);
                              setSelectedActive(tenant.is_active);
                            }}
                          >
                            <td className="py-2 text-[var(--color-text)]">{tenant.name}</td>
                            <td className="py-2 text-[var(--color-text-soft)]">{tenant.cnpj || "-"}</td>
                            <td className="py-2 text-[var(--color-text-soft)]">{tenant.slug}</td>
                            <td className="py-2">
                              <Badge className={planTone(tenant.plan)}>{tenant.plan.toUpperCase()}</Badge>
                            </td>
                            <td className="py-2">
                              <Badge className={tenant.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                                {tenant.is_active ? "ACTIVE" : "INACTIVE"}
                              </Badge>
                            </td>
                            <td className="py-2 text-[var(--color-text)]">{tenant.total_users}</td>
                            <td className="py-2 text-[var(--color-text)]">{tenant.total_documents}</td>
                            <td className="py-2 text-[var(--color-text)]">{tenant.total_scans}</td>
                            <td className="py-2 text-[var(--color-text)]">{tenant.active_api_tokens}</td>
                            <td className="py-2 text-[var(--color-text-soft)]">{formatDate(tenant.created_at)}</td>
                          </tr>
                        ))}
                        {!tenants.length ? (
                          <tr>
                            <td colSpan={10} className="py-6 text-center text-[var(--color-text-soft)]">
                              {t("common.noData")}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="mb-3 text-xl font-semibold text-[var(--color-heading)]">{t("common.tenantControls")}</h2>
                  {!selectedTenant ? (
                    <p className="text-sm text-[var(--color-text-soft)]">{t("common.selectTenantToEdit")}</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{selectedTenant.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">Slug: {selectedTenant.slug}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">CNPJ: {selectedTenant.cnpj || "-"}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">Razão Social: {selectedTenant.legal_name || "-"}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">E-mail NF: {selectedTenant.invoice_email || "-"}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                          Endereço: {selectedTenant.address_line || "-"}, {selectedTenant.address_number || "-"} {selectedTenant.address_complement || ""}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                          Bairro/Cidade/CEP: {selectedTenant.district || "-"} / {selectedTenant.city || "-"} / {selectedTenant.postal_code || "-"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">Created: {formatDate(selectedTenant.created_at)}</p>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--color-text-soft)]">{t("common.plan")}</label>
                        <select
                          value={selectedPlan}
                          onChange={(e) => setSelectedPlan(e.target.value as TenantPlan)}
                          className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                        >
                          <option value="starter">Starter</option>
                          <option value="growth">Growth</option>
                          <option value="business">Business</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                      </div>

                      <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-soft)]">
                        <input
                          type="checkbox"
                          checked={selectedActive}
                          onChange={(e) => setSelectedActive(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Tenant is active
                      </label>

                      <Button onClick={saveTenant} disabled={saving}>
                        {saving ? t("common.saving") : t("common.saveChanges")}
                      </Button>
                    </div>
                  )}
                </Card>
                </div>

                <Card className="rounded-xl p-4">
                <h2 className="mb-3 text-xl font-semibold text-[var(--color-heading)]">{t("common.pendingUpgradeRequestsTitle")}</h2>
                <div className="mb-3">
                  <textarea
                    className="h-20 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                    placeholder={t("common.optionalAdminNote")}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border-soft)] text-[var(--color-text-muted)]">
                        <th className="py-2">{t("common.tenant")} ID</th>
                        <th className="py-2">{t("common.from")}</th>
                        <th className="py-2">{t("common.to")}</th>
                        <th className="py-2">{t("common.reason")}</th>
                        <th className="py-2">{t("common.created")}</th>
                        <th className="py-2">{t("common.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upgradeRequests.map((item) => (
                        <tr key={item.id} className="border-b border-[var(--color-border-soft)]">
                          <td className="py-2 text-[var(--color-text)]">{item.tenant_id}</td>
                          <td className="py-2 text-[var(--color-text)]">{item.current_plan.toUpperCase()}</td>
                          <td className="py-2 text-[var(--color-text)]">{item.requested_plan.toUpperCase()}</td>
                          <td className="py-2 text-[var(--color-text-soft)]">{item.reason || "-"}</td>
                          <td className="py-2 text-[var(--color-text-soft)]">{formatDate(item.created_at)}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <Button
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => void processUpgradeRequest(item.id, "approved")}
                                disabled={processingRequestId === item.id}
                              >
                                {t("common.approve")}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => void processUpgradeRequest(item.id, "rejected")}
                                disabled={processingRequestId === item.id}
                              >
                                {t("common.reject")}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!upgradeRequests.length ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-[var(--color-text-soft)]">
                            {t("common.noData")}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                </Card>
              </>
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
