import { authenticatedJson } from "@/lib/auth";

export type QueueAlertPreference = {
  scope: string;
  scope_key: string;
  snooze_until: string | null;
  acknowledged_signature: string | null;
  updated_at: string;
};

type QueueAlertPreferenceUpdateRequest = {
  snooze_minutes?: number;
  clear_snooze?: boolean;
  acknowledged_signature?: string | null;
};

export async function fetchQueueAlertPreference(
  apiBase: string,
  accessToken: string,
  page: "tenant" | "superadmin",
): Promise<QueueAlertPreference> {
  const path = page === "superadmin" ? "/admin/queues/alert-preferences" : "/queues/alert-preferences";
  return authenticatedJson<QueueAlertPreference>(apiBase, path, accessToken);
}

export async function updateQueueAlertPreference(
  apiBase: string,
  accessToken: string,
  page: "tenant" | "superadmin",
  payload: QueueAlertPreferenceUpdateRequest,
): Promise<QueueAlertPreference> {
  const path = page === "superadmin" ? "/admin/queues/alert-preferences" : "/queues/alert-preferences";
  return authenticatedJson<QueueAlertPreference>(apiBase, path, accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
