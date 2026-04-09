"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { usePreferencesStore } from "@/stores/preferencesStore";

/**
 * Syncs the theme from preferencesStore (backend API) into next-themes.
 *
 * next-themes is the single source of truth for DOM theme application.
 * This hook ensures that when preferences load from the backend,
 * the theme value is forwarded to next-themes' setTheme().
 */
export function useThemeSync(): void {
  const { setTheme } = useTheme();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isLoaded = usePreferencesStore((s) => s.isLoaded);

  useEffect(() => {
    if (isLoaded) {
      setTheme(themeMode);
    }
  }, [isLoaded, themeMode, setTheme]);
}
