"use client";

import { useEffect } from "react";
import { resolveInitialLocale } from "@/lib/i18n";

export function LocaleInit() {
  useEffect(() => {
    const locale = resolveInitialLocale();
    document.documentElement.setAttribute("lang", locale);
  }, []);
  return null;
}
