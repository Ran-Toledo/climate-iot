import { useSyncExternalStore } from "react";

// Screen mode: the user's choice, saved per browser. The page's colours
// follow <html data-theme="light|dark">, which index.html's inline script
// sets before first paint (so there's no light flash in dark mode) and
// applyTheme() keeps current afterwards.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

// Keep in sync with the inline script in index.html.
const STORAGE_KEY = "climate-iot:theme";
// Browser/OS chrome colour, matching --c-page in index.css.
const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#f9f9f7", dark: "#121315" };

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // Storage blocked: fall back to the system setting.
  }
  return "system";
}

let preference = readPreference();

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return darkQuery.matches ? "dark" : "light";
  return pref;
}

type ThemeState = { preference: ThemePreference; resolved: ResolvedTheme };
// What useTheme() returns. Replaced (never mutated) whenever either field
// changes, so React re-renders on an OS switch too, not only when the
// saved preference changes.
let snapshot: ThemeState = { preference, resolved: resolveTheme(preference) };

function applyTheme() {
  const resolved = resolveTheme(preference);
  if (snapshot.preference !== preference || snapshot.resolved !== resolved) {
    snapshot = { preference, resolved };
  }
  document.documentElement.dataset.theme = resolved;
  // index.html has one theme-color tag per system scheme; with a manual
  // choice the active one must still match the page.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = THEME_COLORS[resolved];
  });
}

function notify() {
  applyTheme();
  listeners.forEach((listener) => listener());
}

// While on "system", follow the OS switching between light and dark live.
// Browsers only fire `change` while the page is rendering, so also
// re-check when the page comes back into view (e.g. a home-screen app
// resumed after the OS switched themes at sunset).
function syncWithSystem() {
  if (preference === "system" && document.documentElement.dataset.theme !== resolveTheme("system")) notify();
}
darkQuery.addEventListener("change", syncWithSystem);
document.addEventListener("visibilitychange", syncWithSystem);

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked: the choice still applies until the page reloads.
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The saved preference and what it currently resolves to. */
export function useTheme(): ThemeState {
  return useSyncExternalStore(subscribe, () => snapshot);
}

// Make sure the attribute and meta tags match the stored choice from the
// start, even if the inline script didn't run.
applyTheme();
