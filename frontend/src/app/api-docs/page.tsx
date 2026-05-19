"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useI18n } from "@/hooks/use-i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/i, "");
const SWAGGER_URL = `${API_ORIGIN}/docs`;
const OPENAPI_URL = `${API_ORIGIN}/openapi.json`;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type MethodFilter = "ALL" | HttpMethod;

type OpenApiSpec = {
  paths?: Record<string, Record<string, unknown>>;
  tags?: Array<{ name?: string; description?: string }>;
};

type EndpointItem = {
  id: string;
  tag: string;
  method: HttpMethod;
  path: string;
  summary: string;
  operationId: string;
};

type TagGroup = {
  name: string;
  description: string;
  endpoints: EndpointItem[];
};

const METHODS: MethodFilter[] = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"];

function methodTone(method: HttpMethod): string {
  if (method === "GET") return "text-emerald-600";
  if (method === "POST") return "text-blue-600";
  if (method === "PUT") return "text-amber-600";
  if (method === "PATCH") return "text-orange-600";
  return "text-red-600";
}

function buildPythonSnippet(ep: EndpointItem): string {
  const body = ep.method === "GET" ? "" : ",\n    json={\n        # TODO: payload\n    }";
  return `import requests

base = "${API_BASE}"
token = "<JWT_OR_API_TOKEN>"
headers = {"Authorization": f"Bearer {token}"}

resp = requests.${ep.method.toLowerCase()}(
    f"{base}${ep.path}",
    headers=headers${body}
)
resp.raise_for_status()
print(resp.json())`;
}

function buildJsSnippet(ep: EndpointItem): string {
  const body =
    ep.method === "GET"
      ? ""
      : `,
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${token}\`
  },
  body: JSON.stringify({
    // TODO: payload
  })`;
  const headers =
    ep.method === "GET"
      ? `,
  headers: { Authorization: \`Bearer \${token}\` }`
      : "";
  return `const base = "${API_BASE}";
const token = "<JWT_OR_API_TOKEN>";

const response = await fetch(\`\${base}${ep.path}\`, {
  method: "${ep.method}"${ep.method === "GET" ? headers : body}
});

if (!response.ok) throw new Error(await response.text());
const data = await response.json();
console.log(data);`;
}

function buildCSharpSnippet(ep: EndpointItem): string {
  if (ep.method === "GET") {
    return `using System.Net.Http.Headers;

var baseUrl = "${API_BASE}";
var token = "<JWT_OR_API_TOKEN>";
using var http = new HttpClient();
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

var response = await http.GetAsync($"{baseUrl}${ep.path}");
response.EnsureSuccessStatusCode();
var json = await response.Content.ReadAsStringAsync();
Console.WriteLine(json);`;
  }

  return `using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

var baseUrl = "${API_BASE}";
var token = "<JWT_OR_API_TOKEN>";
using var http = new HttpClient();
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

var payload = JsonSerializer.Serialize(new {
    // TODO = "payload"
});
var request = new HttpRequestMessage(HttpMethod.${ep.method}, $"{baseUrl}${ep.path}") {
    Content = new StringContent(payload, Encoding.UTF8, "application/json")
};
var response = await http.SendAsync(request);
response.EnsureSuccessStatusCode();
var json = await response.Content.ReadAsStringAsync();
Console.WriteLine(json);`;
}

function SnippetBlock({ title, content }: { title: string; content: string }) {
  return (
    <details className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)]">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--color-heading)]">
        {title}
      </summary>
      <div className="border-t border-[var(--color-border-soft)] p-3">
        <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--color-code-bg)] p-3 text-xs text-[var(--color-code-text)]">
{content}
        </pre>
      </div>
    </details>
  );
}

export default function ApiDocsPage() {
  const { token, ready } = useAuthGuard();
  const { t } = useI18n();

  const [groups, setGroups] = useState<TagGroup[]>([]);
  const [endpointCount, setEndpointCount] = useState(0);
  const [tagCount, setTagCount] = useState(0);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("ALL");

  useEffect(() => {
    async function load() {
      setLoadingMeta(true);
      try {
        const response = await fetch(OPENAPI_URL, { method: "GET", credentials: "include" });
        if (!response.ok) {
          setGroups([]);
          setEndpointCount(0);
          setTagCount(0);
          return;
        }
        const data = (await response.json()) as OpenApiSpec;
        const paths = data.paths ?? {};
        const tagDescriptions = new Map<string, string>();
        (data.tags ?? []).forEach((tag) => {
          if (tag.name) tagDescriptions.set(tag.name, tag.description ?? "");
        });

        const bucket = new Map<string, EndpointItem[]>();
        let count = 0;
        Object.entries(paths).forEach(([path, methods]) => {
          Object.entries(methods).forEach(([method, raw]) => {
            const normalized = method.toUpperCase() as HttpMethod;
            if (!METHODS.includes(normalized)) return;
            count += 1;
            const operation = raw as { tags?: string[]; summary?: string; operationId?: string };
            const tag = operation.tags?.[0] ?? "untagged";
            const endpoint: EndpointItem = {
              id: `${normalized}:${path}`,
              tag,
              method: normalized,
              path,
              summary: operation.summary ?? "-",
              operationId: operation.operationId ?? "-",
            };
            if (!bucket.has(tag)) bucket.set(tag, []);
            bucket.get(tag)?.push(endpoint);
          });
        });

        const builtGroups = Array.from(bucket.entries())
          .map(([name, endpoints]) => ({
            name,
            description: tagDescriptions.get(name) ?? "",
            endpoints: endpoints.sort((a, b) => a.path.localeCompare(b.path)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setGroups(builtGroups);
        setEndpointCount(count);
        setTagCount((data.tags ?? []).length);
      } catch {
        setGroups([]);
        setEndpointCount(0);
        setTagCount(0);
      } finally {
        setLoadingMeta(false);
      }
    }
    void load();
  }, []);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .map((group) => {
        const groupMatches = q ? group.name.toLowerCase().includes(q) : true;
        const endpoints = group.endpoints.filter((ep) => {
          const methodMatches = methodFilter === "ALL" || ep.method === methodFilter;
          if (!methodMatches) return false;
          if (!q) return true;
          return (
            groupMatches ||
            ep.path.toLowerCase().includes(q) ||
            ep.summary.toLowerCase().includes(q) ||
            ep.operationId.toLowerCase().includes(q)
          );
        });
        return { ...group, endpoints };
      })
      .filter((group) => group.endpoints.length > 0);
  }, [groups, search, methodFilter]);

  const filteredCount = useMemo(
    () => filteredGroups.reduce((acc, group) => acc + group.endpoints.length, 0),
    [filteredGroups],
  );

  if (!ready || !token) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-app)] grid place-items-center text-[var(--color-text-soft)]">
        {t("common.preparing")}
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
              <h1 className="text-2xl font-semibold text-[var(--color-heading)]">API Docs</h1>
              <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                Documentação no padrão Swagger para as APIs do Nexus Gateway LLM Shield.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Base URL</p>
                  <p className="mt-1 text-sm font-semibold break-all">{API_BASE}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Endpoints</p>
                  <p className="mt-1 text-sm font-semibold">{loadingMeta ? "..." : endpointCount}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Tags</p>
                  <p className="mt-1 text-sm font-semibold">{loadingMeta ? "..." : tagCount}</p>
                </div>
              </div>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">Explorador Interativo</h2>
                <a href={SWAGGER_URL} target="_blank" rel="noreferrer" className="text-sm text-[var(--color-primary)] underline">
                  Abrir Swagger (Try it out)
                </a>
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-soft)]">
                O Swagger abre em nova aba por política de segurança de frame do backend.
              </p>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por tag, path, resumo ou operation id"
                />
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
                  className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m === "ALL" ? "Todos os métodos" : m}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                {filteredCount} endpoint(s) após filtros.
              </p>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="space-y-3 max-h-[72vh] overflow-auto pr-1">
                {filteredGroups.map((group) => (
                  <details key={group.name} className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)]" open>
                    <summary className="cursor-pointer px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-heading)]">{group.name}</p>
                          {group.description ? (
                            <p className="text-xs text-[var(--color-text-soft)]">{group.description}</p>
                          ) : null}
                        </div>
                        <span className="text-xs text-[var(--color-text-muted)]">{group.endpoints.length} endpoint(s)</span>
                      </div>
                    </summary>
                    <div className="space-y-2 border-t border-[var(--color-border-soft)] p-3">
                      {group.endpoints.map((ep) => (
                        <details key={ep.id} className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)]">
                          <summary className="cursor-pointer px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[var(--color-heading)]">
                                  <span className={methodTone(ep.method)}>{ep.method}</span> {ep.path}
                                </p>
                                <p className="truncate text-xs text-[var(--color-text-soft)]">{ep.summary}</p>
                              </div>
                              <span className="text-xs text-[var(--color-primary)]">Snippets (ocultar/mostrar)</span>
                            </div>
                          </summary>
                          <div className="space-y-2 border-t border-[var(--color-border-soft)] p-3">
                            <SnippetBlock title="Python" content={buildPythonSnippet(ep)} />
                            <SnippetBlock title="JavaScript" content={buildJsSnippet(ep)} />
                            <SnippetBlock title="C#" content={buildCSharpSnippet(ep)} />
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
                {!filteredGroups.length && !loadingMeta ? (
                  <p className="text-sm text-[var(--color-text-soft)]">
                    Nenhum endpoint encontrado com os filtros atuais.
                  </p>
                ) : null}
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
