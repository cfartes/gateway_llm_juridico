"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLocale, LOCALE_EVENT, getStoredLocale, setStoredLocale, t } from "@/lib/i18n";

export function useI18n() {
  const [locale, setLocaleState] = useState<AppLocale>(() => getStoredLocale());

  useEffect(() => {
    function syncFromStorage() {
      setLocaleState(getStoredLocale());
    }

    function onCustomLocaleEvent(event: Event) {
      const custom = event as CustomEvent<AppLocale>;
      const localeFromEvent = custom.detail;
      if (localeFromEvent) {
        setLocaleState(localeFromEvent);
        return;
      }
      syncFromStorage();
    }

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(LOCALE_EVENT, onCustomLocaleEvent as EventListener);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(LOCALE_EVENT, onCustomLocaleEvent as EventListener);
    };
  }, []);

  const translate = useMemo(() => (key: string) => t(locale, key), [locale]);

  function setLocale(next: AppLocale) {
    setStoredLocale(next);
    setLocaleState(next);
  }

  return { locale, setLocale, t: translate };
}
