"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getTheme, saveTheme } from "@/components/theme-init";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={toggleTheme}>
      {theme === "dark" ? "Light Mode" : "Dark Mode"}
    </Button>
  );
}
