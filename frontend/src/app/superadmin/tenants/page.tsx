"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthGuard } from "@/hooks/use-auth-guard";
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
  created_at: string;
  total_users: number;
  total_documents: number;
  total_scans: number;
  active_api_tokens: number;
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
  const [me, setMe] = useState<UserMe | null>(null);
  const [tenants, setTenants] = useState<SuperAdminTenant[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<TenantPlan>("starter");
  const [selectedActive, setSelectedActive] = useState(true);
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
      const [meData, tenantData] = await Promise.all([
        authenticatedJson<UserMe>(API_BASE, "/auth/me", accessToken),
        authenticatedJson<SuperAdminTenant[]>(API_BASE, "/admin/tenants", accessToken),
      ]);
      setMe(meData);
      setTenants(tenantData);
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
      setSuccess("Tenant updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tenant");
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

  const isSuperAdmin = me ? me.role === "superadmin" : true;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px] space-y-4">
            <Card className="rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-[#213552]">SuperAdmin Tenant Management</h1>
                  <p className="mt-1 text-sm text-[#667896]">
                    Global controls to manage tenant plan and account status across the SaaS platform.
                  </p>
                </div>
                <Button variant="outline" onClick={refreshTenants} disabled={loading}>
                  Refresh
                </Button>
              </div>
            </Card>

            {!isSuperAdmin ? (
              <Card className="rounded-xl border-red-200 bg-red-50 p-4">
                <h2 className="text-lg font-semibold text-red-700">Access denied</h2>
                <p className="mt-1 text-sm text-red-700">This page is available only for global superadmin users.</p>
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <Card className="rounded-xl p-4">
                  <h2 className="mb-3 text-xl font-semibold text-[#213552]">Tenants</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#e8edf5] text-[#6f80a0]">
                          <th className="py-2">Tenant</th>
                          <th className="py-2">Slug</th>
                          <th className="py-2">Plan</th>
                          <th className="py-2">Status</th>
                          <th className="py-2">Users</th>
                          <th className="py-2">Documents</th>
                          <th className="py-2">Scans</th>
                          <th className="py-2">API Tokens</th>
                          <th className="py-2">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.map((tenant) => (
                          <tr
                            key={tenant.id}
                            className={`cursor-pointer border-b border-[#eff3f8] ${selectedId === tenant.id ? "bg-[#f4f8ff]" : ""}`}
                            onClick={() => {
                              setSelectedId(tenant.id);
                              setSelectedPlan(tenant.plan);
                              setSelectedActive(tenant.is_active);
                            }}
                          >
                            <td className="py-2 text-[#2c3f5f]">{tenant.name}</td>
                            <td className="py-2 text-[#4f6386]">{tenant.slug}</td>
                            <td className="py-2">
                              <Badge className={planTone(tenant.plan)}>{tenant.plan.toUpperCase()}</Badge>
                            </td>
                            <td className="py-2">
                              <Badge className={tenant.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                                {tenant.is_active ? "ACTIVE" : "INACTIVE"}
                              </Badge>
                            </td>
                            <td className="py-2 text-[#334766]">{tenant.total_users}</td>
                            <td className="py-2 text-[#334766]">{tenant.total_documents}</td>
                            <td className="py-2 text-[#334766]">{tenant.total_scans}</td>
                            <td className="py-2 text-[#334766]">{tenant.active_api_tokens}</td>
                            <td className="py-2 text-[#4f6386]">{formatDate(tenant.created_at)}</td>
                          </tr>
                        ))}
                        {!tenants.length ? (
                          <tr>
                            <td colSpan={9} className="py-6 text-center text-[#7586a3]">
                              No tenants found.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="rounded-xl p-4">
                  <h2 className="mb-3 text-xl font-semibold text-[#213552]">Tenant Controls</h2>
                  {!selectedTenant ? (
                    <p className="text-sm text-[#5f7393]">Select one tenant to edit.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-[#e5ecf6] bg-[#f9fbff] p-3">
                        <p className="text-sm font-semibold text-[#29415f]">{selectedTenant.name}</p>
                        <p className="mt-1 text-xs text-[#5f7393]">Slug: {selectedTenant.slug}</p>
                        <p className="mt-1 text-xs text-[#5f7393]">Created: {formatDate(selectedTenant.created_at)}</p>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-[#324a6f]">Plan</label>
                        <select
                          value={selectedPlan}
                          onChange={(e) => setSelectedPlan(e.target.value as TenantPlan)}
                          className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                        >
                          <option value="starter">Starter</option>
                          <option value="growth">Growth</option>
                          <option value="business">Business</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                      </div>

                      <label className="flex items-center gap-2 rounded-lg border border-[#e4ebf7] bg-[#fbfcff] px-3 py-2 text-sm text-[#324a6f]">
                        <input
                          type="checkbox"
                          checked={selectedActive}
                          onChange={(e) => setSelectedActive(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Tenant is active
                      </label>

                      <Button onClick={saveTenant} disabled={saving}>
                        {saving ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
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
