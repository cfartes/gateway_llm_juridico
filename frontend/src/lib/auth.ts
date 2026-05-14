export const AUTH_TOKEN_KEY = "nexus_access_token";

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

export function setSessionTokens(accessToken: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
}

export function clearSessionTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function refreshAccessToken(apiBase: string): Promise<string | null> {
  const response = await fetch(`${apiBase}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    clearSessionTokens();
    return null;
  }

  const data = (await response.json()) as { access_token: string };
  setSessionTokens(data.access_token);
  return data.access_token;
}

export async function ensureAccessToken(apiBase: string): Promise<string | null> {
  const accessToken = getAccessToken();
  if (accessToken) return accessToken;
  return refreshAccessToken(apiBase);
}

export async function authenticatedJson<T>(
  apiBase: string,
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const makeRequest = (token: string) =>
    fetch(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

  let response = await makeRequest(accessToken);
  if (response.status === 401) {
    const refreshedAccess = await refreshAccessToken(apiBase);
    if (!refreshedAccess) {
      throw new Error("Session expired. Please sign in again.");
    }
    response = await makeRequest(refreshedAccess);
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}
