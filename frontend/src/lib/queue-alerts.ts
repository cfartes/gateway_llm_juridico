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
const CONTROL_KEY = "nexus_queue_alert_controls";
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

type AlertControl = {
  snoozeUntil: string | null;
  acknowledgedSignature: string | null;
};

function parseControl(raw: string | null): Record<string, AlertControl> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Record<string, AlertControl>;
    if (!data || typeof data !== "object") return {};
    return data;
  } catch {
    return {};
  }
}

function controlKey(userId: string, page: "tenant" | "superadmin"): string {
  return `${userId}:${page}`;
}

function readControlMap(): Record<string, AlertControl> {
  if (typeof window === "undefined") return {};
  return parseControl(window.localStorage.getItem(CONTROL_KEY));
}

function writeControlMap(map: Record<string, AlertControl>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONTROL_KEY, JSON.stringify(map));
}

export function buildAlertSignature(level: string, tenantId: string | null, alerts: string[]): string {
  return JSON.stringify({
    level: (level || "").toLowerCase(),
    tenantId: tenantId || "",
    alerts: alerts || [],
  });
}

export function setAlertSnooze(userId: string, page: "tenant" | "superadmin", minutes: number): void {
  const map = readControlMap();
  const key = controlKey(userId, page);
  const now = Date.now();
  const until = new Date(now + Math.max(1, minutes) * 60 * 1000).toISOString();
  const prev = map[key] || { snoozeUntil: null, acknowledgedSignature: null };
  map[key] = { ...prev, snoozeUntil: until };
  writeControlMap(map);
}

export function clearAlertSnooze(userId: string, page: "tenant" | "superadmin"): void {
  const map = readControlMap();
  const key = controlKey(userId, page);
  const prev = map[key] || { snoozeUntil: null, acknowledgedSignature: null };
  map[key] = { ...prev, snoozeUntil: null };
  writeControlMap(map);
}

export function isAlertSnoozed(userId: string, page: "tenant" | "superadmin"): boolean {
  const map = readControlMap();
  const key = controlKey(userId, page);
  const until = map[key]?.snoozeUntil;
  if (!until) return false;
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > Date.now();
}

export function acknowledgeAlertSignature(userId: string, page: "tenant" | "superadmin", signature: string): void {
  const map = readControlMap();
  const key = controlKey(userId, page);
  const prev = map[key] || { snoozeUntil: null, acknowledgedSignature: null };
  map[key] = { ...prev, acknowledgedSignature: signature };
  writeControlMap(map);
}

export function getAcknowledgedSignature(userId: string, page: "tenant" | "superadmin"): string | null {
  const map = readControlMap();
  return map[controlKey(userId, page)]?.acknowledgedSignature ?? null;
}
