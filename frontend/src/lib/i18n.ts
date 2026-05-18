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
    "common.error": "Erro",
    "common.refresh": "Atualizar",
    "common.saving": "Salvando...",
    "common.save": "Salvar",
    "overview.tenant": "Tenant",
    "overview.pendingReviews": "Revisões Pendentes de Quarentena",
    "overview.pendingReviewsDesc": "Documentos aguardando decisão manual antes da liberação segura para RAG.",
    "overview.openQueue": "Abrir Fila de Quarentena",
    "overview.threatScore": "Score de Ameaça",
    "overview.riskLevel": "Nível de Risco",
    "overview.filesScanned": "Arquivos Escaneados",
    "overview.environmentRisk": "Status de risco do ambiente atual",
    "overview.totalAnalyzedFiles": "Total de arquivos analisados",
    "overview.dragDrop": "Arraste e solte arquivos para escanear",
    "overview.supportedFormats": "Suporta PDF, DOCX, TXT, MD, HTML, CSV e imagens",
    "overview.chooseFiles": "Escolher Arquivos",
    "overview.recentScans": "Escaneamentos Recentes",
    "overview.analysisEvidence": "Evidências da Análise",
    "overview.noEvidence": "Ainda não há evidências. Selecione um relatório de scan com achados para exibir este painel.",
    "overview.noScans": "Ainda não há scans. Envie arquivos e clique em atualizar para ver o histórico.",
    "overview.sanitizedExport": "Exportação Sanitizada",
    "overview.sanitizedDesc": "Exporte uma versão de texto sanitizada com instruções sensíveis removidas.",
    "overview.exportSanitized": "Exportar Arquivo Sanitizado",
    "overview.viewReport": "Ver Relatório",
    "overview.retry": "Reprocessar",
    "overview.retrying": "Reprocessando...",
    "apiTokens.title": "Tokens de API",
    "apiTokens.subtitle": "Crie e gerencie tokens bearer de integração. Use esses tokens apenas em chamadas de API.",
    "apiTokens.usageBanner": "Uso de token de API apenas via endpoint (header Bearer)",
    "apiTokens.management": "Gerenciamento de Tokens",
    "apiTokens.generate": "Gerar Novo Token",
    "apiTokens.none": "Ainda não há tokens.",
    "apiTokens.example": "Exemplo de uso da API",
    "settings.title": "Configurações",
    "settings.subtitle": "Configure limiares de segurança, política de retenção e notificações do tenant.",
    "settings.planLimits": "Limites Atuais do Plano",
    "settings.upgradeRequests": "Solicitações de Upgrade",
    "settings.noUpgradeRequests": "Ainda não há solicitações de upgrade.",
    "settings.security": "Segurança",
    "settings.retention": "Retenção",
    "settings.notifications": "Notificações",
    "settings.smtpTest": "Teste SMTP",
    "settings.smtpTestDesc": "Envie um e-mail de teste usando as configurações SMTP atuais do backend.",
    "settings.sendTest": "Enviar Teste SMTP",
    "settings.save": "Salvar Configurações",
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
    "common.error": "Error",
    "common.refresh": "Refresh",
    "common.saving": "Saving...",
    "common.save": "Save",
    "overview.tenant": "Tenant",
    "overview.pendingReviews": "Pending Quarantine Reviews",
    "overview.pendingReviewsDesc": "Documents waiting manual decision before secure RAG release.",
    "overview.openQueue": "Open Quarantine Queue",
    "overview.threatScore": "Threat Score",
    "overview.riskLevel": "Risk Level",
    "overview.filesScanned": "Files Scanned",
    "overview.environmentRisk": "Current environment risk status",
    "overview.totalAnalyzedFiles": "Total analyzed files",
    "overview.dragDrop": "Drag and drop files to scan",
    "overview.supportedFormats": "Supports PDF, DOCX, TXT, MD, HTML, CSV, and images",
    "overview.chooseFiles": "Choose Files",
    "overview.recentScans": "Recent Scans",
    "overview.analysisEvidence": "Analysis Evidence",
    "overview.noEvidence": "No evidence found yet. Select a scan report with findings to display this panel.",
    "overview.noScans": "No scan data yet. Upload files and press refresh to see history.",
    "overview.sanitizedExport": "Sanitized Export",
    "overview.sanitizedDesc": "Export a sanitized text version with sensitive instructions removed.",
    "overview.exportSanitized": "Export Sanitized File",
    "overview.viewReport": "View Report",
    "overview.retry": "Retry",
    "overview.retrying": "Retrying...",
    "apiTokens.title": "API Tokens",
    "apiTokens.subtitle": "Create and manage integration bearer tokens. Use these tokens only in API calls.",
    "apiTokens.usageBanner": "API token usage only via endpoint (Bearer header)",
    "apiTokens.management": "Token Management",
    "apiTokens.generate": "Generate New Token",
    "apiTokens.none": "No tokens yet.",
    "apiTokens.example": "API usage example",
    "settings.title": "Settings",
    "settings.subtitle": "Configure security thresholds, retention policy and tenant notifications.",
    "settings.planLimits": "Current Plan Limits",
    "settings.upgradeRequests": "Upgrade Requests",
    "settings.noUpgradeRequests": "No upgrade requests yet.",
    "settings.security": "Security",
    "settings.retention": "Retention",
    "settings.notifications": "Notifications",
    "settings.smtpTest": "SMTP Test",
    "settings.smtpTestDesc": "Send a test email using current SMTP backend settings.",
    "settings.sendTest": "Send SMTP Test",
    "settings.save": "Save Settings",
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
    "common.error": "Error",
    "common.refresh": "Actualizar",
    "common.saving": "Guardando...",
    "common.save": "Guardar",
    "overview.tenant": "Tenant",
    "overview.pendingReviews": "Revisiones Pendientes de Cuarentena",
    "overview.pendingReviewsDesc": "Documentos esperando decisión manual antes de la liberación segura para RAG.",
    "overview.openQueue": "Abrir Cola de Cuarentena",
    "overview.threatScore": "Puntaje de Amenaza",
    "overview.riskLevel": "Nivel de Riesgo",
    "overview.filesScanned": "Archivos Escaneados",
    "overview.environmentRisk": "Estado de riesgo del entorno actual",
    "overview.totalAnalyzedFiles": "Total de archivos analizados",
    "overview.dragDrop": "Arrastra y suelta archivos para escanear",
    "overview.supportedFormats": "Soporta PDF, DOCX, TXT, MD, HTML, CSV e imágenes",
    "overview.chooseFiles": "Elegir Archivos",
    "overview.recentScans": "Escaneos Recientes",
    "overview.analysisEvidence": "Evidencias del Análisis",
    "overview.noEvidence": "Aún no hay evidencias. Selecciona un reporte de escaneo con hallazgos para mostrar este panel.",
    "overview.noScans": "Aún no hay escaneos. Sube archivos y pulsa actualizar para ver el historial.",
    "overview.sanitizedExport": "Exportación Sanitizada",
    "overview.sanitizedDesc": "Exporta una versión de texto sanitizada con instrucciones sensibles removidas.",
    "overview.exportSanitized": "Exportar Archivo Sanitizado",
    "overview.viewReport": "Ver Informe",
    "overview.retry": "Reintentar",
    "overview.retrying": "Reintentando...",
    "apiTokens.title": "Tokens API",
    "apiTokens.subtitle": "Crea y gestiona tokens bearer de integración. Usa estos tokens solo en llamadas API.",
    "apiTokens.usageBanner": "Uso de token API solo vía endpoint (header Bearer)",
    "apiTokens.management": "Gestión de Tokens",
    "apiTokens.generate": "Generar Nuevo Token",
    "apiTokens.none": "Aún no hay tokens.",
    "apiTokens.example": "Ejemplo de uso de API",
    "settings.title": "Configuración",
    "settings.subtitle": "Configura umbrales de seguridad, política de retención y notificaciones del tenant.",
    "settings.planLimits": "Límites Actuales del Plan",
    "settings.upgradeRequests": "Solicitudes de Upgrade",
    "settings.noUpgradeRequests": "Aún no hay solicitudes de upgrade.",
    "settings.security": "Seguridad",
    "settings.retention": "Retención",
    "settings.notifications": "Notificaciones",
    "settings.smtpTest": "Prueba SMTP",
    "settings.smtpTestDesc": "Envía un correo de prueba usando la configuración SMTP actual del backend.",
    "settings.sendTest": "Enviar Prueba SMTP",
    "settings.save": "Guardar Configuración",
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
