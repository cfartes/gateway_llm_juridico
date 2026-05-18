"use client";

export const LOCALE_STORAGE_KEY = "nexus_locale";
export const LOCALE_EVENT = "nexus:locale-changed";

export type AppLocale = "pt-BR" | "en-US" | "es-ES";

export const SUPPORTED_LOCALES: AppLocale[] = ["pt-BR", "en-US", "es-ES"];

const DEFAULT_LOCALE: AppLocale = "pt-BR";

export const LOCALE_FLAGS: Record<AppLocale, string> = {
  "pt-BR": "🇧🇷",
  "en-US": "🇺🇸",
  "es-ES": "🇪🇸",
};

const messages: Record<AppLocale, Record<string, string>> = {
  "pt-BR": {
    "sidebar.overview": "Visão Geral",
    "sidebar.apiTokens": "Tokens de API",
    "sidebar.users": "Usuários",
    "sidebar.quarantine": "Quarentena",
    "sidebar.queues": "Filas",
    "sidebar.superadminTenants": "SuperAdmin Tenants",
    "sidebar.superadminLLM": "SuperAdmin LLM",
    "sidebar.superadminWebhooks": "SuperAdmin Webhooks",
    "sidebar.superadminQueues": "SuperAdmin Filas",
    "sidebar.superadminOps": "SuperAdmin Operações",
    "sidebar.superadminSupport": "SuperAdmin Suporte",
    "sidebar.webhookDeliveries": "Entregas de Webhook",
    "sidebar.integrations": "Integrações",
    "sidebar.auditLog": "Log de Auditoria",
    "sidebar.support": "Suporte",
    "sidebar.settings": "Configurações",
    "sidebar.plan": "Plano Enterprise",
    "sidebar.planDesc": "Scans ilimitados",
    "sidebar.logout": "Sair",
    "sidebar.language": "Idioma",
    "login.title": "Pipeline Seguro de Documentos para IA",
    "login.subtitle":
      "Autentique-se com seu e-mail e analise arquivos contra prompt injections, instruções ocultas e exfiltração.",
    "login.login": "Entrar",
    "login.register": "Registrar",
    "common.preparing": "Preparando seu workspace...",
  },
  "en-US": {
    "sidebar.overview": "Overview",
    "sidebar.apiTokens": "API Tokens",
    "sidebar.users": "Users",
    "sidebar.quarantine": "Quarantine",
    "sidebar.queues": "Queues",
    "sidebar.superadminTenants": "SuperAdmin Tenants",
    "sidebar.superadminLLM": "SuperAdmin LLM",
    "sidebar.superadminWebhooks": "SuperAdmin Webhooks",
    "sidebar.superadminQueues": "SuperAdmin Queues",
    "sidebar.superadminOps": "SuperAdmin Ops",
    "sidebar.superadminSupport": "SuperAdmin Support",
    "sidebar.webhookDeliveries": "Webhook Deliveries",
    "sidebar.integrations": "Integrations",
    "sidebar.auditLog": "Audit Log",
    "sidebar.support": "Support",
    "sidebar.settings": "Settings",
    "sidebar.plan": "Enterprise Plan",
    "sidebar.planDesc": "Unlimited scans",
    "sidebar.logout": "Logout",
    "sidebar.language": "Language",
    "login.title": "Secure AI Document Pipeline",
    "login.subtitle":
      "Sign in with your user email and scan files for prompt injections, hidden instructions, and exfiltration attempts.",
    "login.login": "Login",
    "login.register": "Register",
    "common.preparing": "Preparing your workspace...",
  },
  "es-ES": {
    "sidebar.overview": "Resumen",
    "sidebar.apiTokens": "Tokens API",
    "sidebar.users": "Usuarios",
    "sidebar.quarantine": "Cuarentena",
    "sidebar.queues": "Colas",
    "sidebar.superadminTenants": "SuperAdmin Tenants",
    "sidebar.superadminLLM": "SuperAdmin LLM",
    "sidebar.superadminWebhooks": "SuperAdmin Webhooks",
    "sidebar.superadminQueues": "SuperAdmin Colas",
    "sidebar.superadminOps": "SuperAdmin Operaciones",
    "sidebar.superadminSupport": "SuperAdmin Soporte",
    "sidebar.webhookDeliveries": "Entregas Webhook",
    "sidebar.integrations": "Integraciones",
    "sidebar.auditLog": "Auditoría",
    "sidebar.support": "Soporte",
    "sidebar.settings": "Configuración",
    "sidebar.plan": "Plan Enterprise",
    "sidebar.planDesc": "Escaneos ilimitados",
    "sidebar.logout": "Salir",
    "sidebar.language": "Idioma",
    "login.title": "Pipeline Seguro de Documentos para IA",
    "login.subtitle":
      "Inicia sesión con tu email y analiza archivos contra prompt injections, instrucciones ocultas y exfiltración.",
    "login.login": "Entrar",
    "login.register": "Registrar",
    "common.preparing": "Preparando tu espacio...",
  },
};

function normalizeLocale(value: string | null | undefined): AppLocale {
  if (!value) return DEFAULT_LOCALE;
  if (SUPPORTED_LOCALES.includes(value as AppLocale)) return value as AppLocale;
  if (value.startsWith("pt")) return "pt-BR";
  if (value.startsWith("es")) return "es-ES";
  if (value.startsWith("en")) return "en-US";
  return DEFAULT_LOCALE;
}

export function resolveInitialLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored) return normalizeLocale(stored);
  return normalizeLocale(window.navigator.language);
}

export function setStoredLocale(locale: AppLocale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.documentElement.setAttribute("lang", locale);
  window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: locale }));
}

export function getStoredLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  return resolveInitialLocale();
}

export function t(locale: AppLocale, key: string): string {
  return messages[locale][key] ?? messages["en-US"][key] ?? key;
}
