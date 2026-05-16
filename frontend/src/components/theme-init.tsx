"use client";

import { useEffect } from "react";

const STORAGE_KEY = "nexus_theme";

function resolveInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeInit() {
  useEffect(() => {
    const theme = resolveInitialTheme();
    document.documentElement.setAttribute("data-theme", theme);
  }, []);
  return null;
}

export function saveTheme(theme: "light" | "dark") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
}

export function getTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark") return "dark";
  return "light";
}
