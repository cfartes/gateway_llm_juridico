"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function confirm() {
      const token = new URLSearchParams(window.location.search).get("token") ?? "";
      if (!token) {
        setError("Verification token not found.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API_BASE}/auth/email-confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verification_token: token }),
        });
        if (!response.ok) throw new Error(await response.text());
        setSuccess("Email confirmed. You can now login with the temporary password.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to confirm email");
      } finally {
        setLoading(false);
      }
    }
    void confirm();
  }, []);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,var(--color-bg-app)_0%,var(--color-surface)_100%)] p-4">
      <div className="mx-auto flex min-h-[92vh] w-full max-w-[980px] items-center justify-center">
        <Card className="w-full max-w-[520px] rounded-2xl p-7">
          <h1 className="text-2xl font-semibold text-[var(--color-heading)]">Email Confirmation</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            We are validating your invitation link.
          </p>
          {loading ? <p className="mt-4 text-sm text-[var(--color-text-soft)]">Confirming...</p> : null}
          {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
          {success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</p> : null}
          <div className="mt-5">
            <Button type="button" onClick={() => router.replace("/login")}>Go to Login</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
