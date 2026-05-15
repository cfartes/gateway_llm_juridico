export type QueueAlertLevel = "normal" | "warning" | "critical";

export type QueueAlertEvent = {
  id: string;
  timestamp: string;
  page: "tenant" | "superadmin";
  level: QueueAlertLevel;
  tenantId: string | null;
  windowHours: number;
  messages: string[];
};

const STORAGE_KEY = "nexus_queue_alert_history";
const MAX_EVENTS = 120;

function parseHistory(raw: string | null): QueueAlertEvent[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as QueueAlertEvent[];
    if (!Array.isArray(data)) return [];
    return data.filter((item) => item && typeof item.id === "string");
  } catch {
    return [];
  }
}

export function readQueueAlertHistory(): QueueAlertEvent[] {
  if (typeof window === "undefined") return [];
  return parseHistory(window.localStorage.getItem(STORAGE_KEY));
}

export function appendQueueAlertEvent(event: QueueAlertEvent): QueueAlertEvent[] {
  if (typeof window === "undefined") return [event];
  const current = readQueueAlertHistory();
  const next = [event, ...current].slice(0, MAX_EVENTS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function isCriticalEscalation(prev: string | null, next: string | null): boolean {
  const prevLevel = (prev ?? "normal").toLowerCase();
  const nextLevel = (next ?? "normal").toLowerCase();
  return nextLevel === "critical" && prevLevel !== "critical";
}

