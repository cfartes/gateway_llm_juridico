"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ensureAccessToken, setSessionTokens } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("admin@acme.com");
  const [password, setPassword] = useState("StrongPass#2026");

  const [legalName, setLegalName] = useState("Acme Corporation LTDA");
  const [cnpj, setCnpj] = useState("12.345.678/0001-95");
  const [postalCode, setPostalCode] = useState("01001-000");
  const [addressLine, setAddressLine] = useState("");
  const [addressNumber, setAddressNumber] = useState("100");
  const [addressComplement, setAddressComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("financeiro@acme.com");
  const [plan, setPlan] = useState<"starter" | "growth" | "business" | "enterprise">("starter");
  const [fullName, setFullName] = useState("Acme Admin");

  useEffect(() => {
    async function checkSession() {
      const token = await ensureAccessToken(API_BASE);
      if (token) {
        router.replace("/");
      }
    }
    void checkSession();
  }, [router]);

  function onlyDigits(value: string): string {
    return value.replace(/\D/g, "");
  }

  async function lookupCep() {
    const cep = onlyDigits(postalCode);
    if (cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) return;
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
      };
      if (data.erro) return;
      if (data.logradouro) setAddressLine(data.logradouro);
      if (data.bairro) setDistrict(data.bairro);
      if (data.localidade) setCity(data.localidade);
    } catch {
      // Optional helper lookup; ignore network errors.
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? { email, password }
          : {
              tenant_name: legalName,
              legal_name: legalName,
              cnpj,
              postal_code: postalCode,
              address_line: addressLine,
              address_number: addressNumber,
              address_complement: addressComplement || null,
              district,
              city,
              invoice_email: invoiceEmail,
              plan,
              email,
              full_name: fullName,
              password,
            };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { access_token: string; must_change_password?: boolean };
      setSessionTokens(data.access_token);
      if (data.must_change_password) {
        router.replace("/first-access");
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f9ff_0%,#fdfefe_100%)] p-4">
      <div className="mx-auto flex min-h-[92vh] w-full max-w-[1080px] items-center justify-center">
        <Card className="grid w-full max-w-[880px] grid-cols-1 overflow-hidden p-0 md:grid-cols-[1.05fr_1fr]">
          <div className="bg-[linear-gradient(145deg,#2f6fff,#1748bb)] p-8 text-white">
            <p className="text-3xl font-extrabold">NEXUS</p>
            <p className="text-sm font-semibold text-blue-100">GATEWAY LLM SHIELD</p>
            <h1 className="mt-10 text-3xl font-bold">Secure AI Document Pipeline</h1>
            <p className="mt-3 text-sm text-blue-100">
              Authenticate with your user email and start scanning files for prompt injections, hidden instructions, and exfiltration attempts.
            </p>
          </div>

          <div className="p-7">
            <div className="mb-5 flex gap-2">
              <Button
                variant={mode === "login" ? "default" : "outline"}
                className="h-9"
                onClick={() => setMode("login")}
              >
                Login
              </Button>
              <Button
                variant={mode === "register" ? "default" : "outline"}
                className="h-9"
                onClick={() => setMode("register")}
              >
                Register
              </Button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === "register" ? (
                <Input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Razão Social"
                  required
                />
              ) : null}

              {mode === "register" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="CNPJ"
                    required
                  />
                  <Input
                    type="email"
                    value={invoiceEmail}
                    onChange={(e) => setInvoiceEmail(e.target.value)}
                    placeholder="E-mail NF"
                    required
                  />
                </div>
              ) : null}

              {mode === "register" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    onBlur={() => void lookupCep()}
                    placeholder="CEP"
                    required
                  />
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as "starter" | "growth" | "business" | "enterprise")}
                    className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm"
                  >
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="business">Business</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              ) : null}

              {mode === "register" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    placeholder="Endereço"
                    required
                  />
                  <Input
                    value={addressNumber}
                    onChange={(e) => setAddressNumber(e.target.value)}
                    placeholder="Nro"
                    required
                  />
                  <Input
                    value={addressComplement}
                    onChange={(e) => setAddressComplement(e.target.value)}
                    placeholder="Complemento"
                  />
                  <Input
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Bairro"
                    required
                  />
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Cidade"
                    required
                  />
                </div>
              ) : null}

              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
              />

              {mode === "register" ? (
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  required
                />
              ) : null}

              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />

              <Button type="submit" className="h-10 w-full" disabled={loading}>
                {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create tenant and sign in"}
              </Button>
            </form>

            {error ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
