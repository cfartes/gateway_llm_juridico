"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ensureAccessToken, setSessionTokens } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export default function FirstAccessPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function bootstrap() {
      const access = await ensureAccessToken(API_BASE);
      if (!access) {
        router.replace("/login");
        return;
      }
      setToken(access);
      const meResponse = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: { Authorization: `Bearer ${access}` },
      });
      if (!meResponse.ok) {
        router.replace("/login");
        return;
      }
      const me = (await meResponse.json()) as { must_change_password?: boolean };
      if (!me.must_change_password) {
        router.replace("/");
      }
    }
    void bootstrap();
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (newPassword !== confirmPassword) {
      setError("New password confirmation does not match.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${API_BASE}/auth/first-access/change-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as { access_token: string };
      setSessionTokens(data.access_token);
      setSuccess("Password changed successfully. Redirecting...");
      setTimeout(() => router.replace("/"), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,var(--color-bg-app)_0%,var(--color-surface)_100%)] p-4">
      <div className="mx-auto flex min-h-[92vh] w-full max-w-[980px] items-center justify-center">
        <Card className="w-full max-w-[520px] rounded-2xl p-7">
          <h1 className="text-2xl font-semibold text-[var(--color-heading)]">First Access Password Update</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Your account uses a temporary password. Set a new password to continue.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            <Input type="password" placeholder="Current temporary password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Change Password"}
            </Button>
          </form>
          {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
          {success ? <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</p> : null}
        </Card>
      </div>
    </div>
  );
}
