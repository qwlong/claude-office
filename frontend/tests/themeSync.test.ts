import { describe, expect, it, beforeEach, vi } from "vitest";
import { usePreferencesStore } from "../src/stores/preferencesStore";

/**
 * Bug: On page refresh with dark mode selected, the theme toggle correctly shows
 * "dark" but the page renders in light mode.
 *
 * Root cause: preferencesStore.loadPreferences() calls applyThemeToDOM() which
 * directly manipulates document.documentElement.classList, bypassing next-themes.
 * If the backend API returns no theme_mode, it defaults to "system" which may
 * resolve to light, overriding the dark mode that next-themes correctly applied.
 *
 * Fix: Remove manual DOM manipulation from preferencesStore. Let next-themes be
 * the single source of truth for applying theme classes.
 */

// Provide minimal document mock so applyThemeToDOM calls are detectable
const toggleMock = vi.fn();
vi.stubGlobal("document", {
  documentElement: {
    classList: {
      toggle: toggleMock,
    },
  },
});

function mockFetch(response: Record<string, unknown> = { ok: true }) {
  const mock = vi.fn();
  mock.mockResolvedValue({
    ok: true,
    json: async () => ({}),
    ...response,
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe("preferencesStore theme handling", () => {
  beforeEach(() => {
    toggleMock.mockClear();
    usePreferencesStore.setState({
      clockType: "analog",
      clockFormat: "12h",
      autoFollowNewSessions: true,
      language: "en",
      themeMode: "system",
      isLoaded: false,
    });
  });

  it("loadPreferences does NOT directly manipulate document.documentElement classes", async () => {
    mockFetch({ json: async () => ({ theme_mode: "dark" }) });

    await usePreferencesStore.getState().loadPreferences();

    // The store should have the theme value from API
    expect(usePreferencesStore.getState().themeMode).toBe("dark");

    // But it should NOT directly manipulate the DOM — that's next-themes' job
    expect(toggleMock).not.toHaveBeenCalled();
  });

  it("setThemeMode does NOT directly manipulate document.documentElement classes", async () => {
    mockFetch();

    await usePreferencesStore.getState().setThemeMode("dark");

    expect(usePreferencesStore.getState().themeMode).toBe("dark");
    expect(toggleMock).not.toHaveBeenCalled();
  });

  it("setThemeMode updates store state correctly for all modes", async () => {
    mockFetch();

    await usePreferencesStore.getState().setThemeMode("light");
    expect(usePreferencesStore.getState().themeMode).toBe("light");

    await usePreferencesStore.getState().setThemeMode("dark");
    expect(usePreferencesStore.getState().themeMode).toBe("dark");

    await usePreferencesStore.getState().setThemeMode("system");
    expect(usePreferencesStore.getState().themeMode).toBe("system");
  });

  it("loadPreferences defaults to system when API returns no theme_mode", async () => {
    mockFetch({ json: async () => ({}) });

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().themeMode).toBe("system");
    expect(toggleMock).not.toHaveBeenCalled();
  });

  it("setThemeMode persists to backend API", async () => {
    const fetchMock = mockFetch();

    await usePreferencesStore.getState().setThemeMode("dark");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/preferences/theme_mode",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ value: "dark" }),
      }),
    );
  });
});
