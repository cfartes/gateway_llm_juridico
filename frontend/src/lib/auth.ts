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
  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    clearSessionTokens();
    return null;
  }

  if (!response.ok) {
    clearSessionTokens();
    return null;
  }

  const data = (await response.json()) as { access_token: string; must_change_password?: boolean };
  setSessionTokens(data.access_token);
  return data.access_token;
}

export async function ensureAccessToken(apiBase: string): Promise<string | null> {
  const accessToken = getAccessToken();
  if (accessToken) return accessToken;
  try {
    return await refreshAccessToken(apiBase);
  } catch {
    clearSessionTokens();
    return null;
  }
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
    if (response.status === 403) {
      const bodyText = await response.text();
      if (bodyText.includes("Password change required") && typeof window !== "undefined") {
        window.location.href = "/first-access";
        throw new Error("Password change required");
      }
      throw new Error(bodyText);
    }
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}
