/**
 * Theme Store for CodeOpen
 * 
 * Manages theme presets and light/dark mode switching.
 * Persists theme preferences to localStorage.
 */

import { themePresetsMap, type ThemePreset, type ThemeStyleProps } from "./presets";

// Storage keys
const THEME_MODE_KEY = "codeopen-theme-mode";
const THEME_PRESET_KEY = "codeopen-theme-preset";

// Types
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedMode = "light" | "dark";

// State
let themeMode = $state<ThemeMode>("system");
let themePresetId = $state<string>("default-neutral");
let resolvedMode = $state<ResolvedMode>("light");

// Initialize from localStorage and system preference
function initialize() {
  if (typeof window === "undefined") return;

  // Load saved preferences
  const savedMode = localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null;
  const savedPreset = localStorage.getItem(THEME_PRESET_KEY);

  if (savedMode && ["light", "dark", "system"].includes(savedMode)) {
    themeMode = savedMode;
  }

  if (savedPreset && themePresetsMap[savedPreset]) {
    themePresetId = savedPreset;
  }

  // Resolve system preference
  updateResolvedMode();

  // Listen for system preference changes
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", updateResolvedMode);

  // Apply initial theme
  applyTheme();
}

// Update the resolved mode based on system preference
function updateResolvedMode() {
  if (typeof window === "undefined") return;

  if (themeMode === "system") {
    resolvedMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    resolvedMode = themeMode as ResolvedMode;
  }

  // Update document class
  document.documentElement.classList.toggle("dark", resolvedMode === "dark");
}

// Apply theme CSS variables to document
function applyTheme() {
  if (typeof window === "undefined") return;

  const preset = themePresetsMap[themePresetId];
  if (!preset) return;

  const styles = resolvedMode === "dark" ? preset.styles.dark : preset.styles.light;
  const root = document.documentElement;

  // Apply CSS variables
  const cssVarMap: Record<keyof ThemeStyleProps, string> = {
    background: "--background",
    foreground: "--foreground",
    card: "--card",
    "card-foreground": "--card-foreground",
    popover: "--popover",
    "popover-foreground": "--popover-foreground",
    primary: "--primary",
    "primary-foreground": "--primary-foreground",
    secondary: "--secondary",
    "secondary-foreground": "--secondary-foreground",
    muted: "--muted",
    "muted-foreground": "--muted-foreground",
    accent: "--accent",
    "accent-foreground": "--accent-foreground",
    destructive: "--destructive",
    "destructive-foreground": "--destructive-foreground",
    border: "--border",
    input: "--input",
    ring: "--ring",
    "chart-1": "--chart-1",
    "chart-2": "--chart-2",
    "chart-3": "--chart-3",
    "chart-4": "--chart-4",
    "chart-5": "--chart-5",
    sidebar: "--sidebar",
    "sidebar-foreground": "--sidebar-foreground",
    "sidebar-primary": "--sidebar-primary",
    "sidebar-primary-foreground": "--sidebar-primary-foreground",
    "sidebar-accent": "--sidebar-accent",
    "sidebar-accent-foreground": "--sidebar-accent-foreground",
    "sidebar-border": "--sidebar-border",
    "sidebar-ring": "--sidebar-ring",
    radius: "--radius",
  };

  // Apply each style property
  for (const [key, cssVar] of Object.entries(cssVarMap)) {
    const value = styles[key as keyof ThemeStyleProps];
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }
}

// Public API
export const themeStore = {
  get mode() {
    return themeMode;
  },

  get presetId() {
    return themePresetId;
  },

  get resolvedMode() {
    return resolvedMode;
  },

  get currentPreset(): ThemePreset | undefined {
    return themePresetsMap[themePresetId];
  },

  get isDark() {
    return resolvedMode === "dark";
  },

  setMode(mode: ThemeMode) {
    themeMode = mode;
    localStorage.setItem(THEME_MODE_KEY, mode);
    updateResolvedMode();
    applyTheme();
  },

  setPreset(presetId: string) {
    if (!themePresetsMap[presetId]) {
      console.warn(`Theme preset "${presetId}" not found`);
      return;
    }
    themePresetId = presetId;
    localStorage.setItem(THEME_PRESET_KEY, presetId);
    applyTheme();
  },

  initialize,

  // Get preview colors for a preset (for theme picker)
  getPreviewColors(presetId: string): { primary: string; background: string; foreground: string } | null {
    const preset = themePresetsMap[presetId];
    if (!preset) return null;

    const styles = resolvedMode === "dark" ? preset.styles.dark : preset.styles.light;
    return {
      primary: styles.primary,
      background: styles.background,
      foreground: styles.foreground,
    };
  },
};

// Auto-initialize when this module is imported in the browser
if (typeof window !== "undefined") {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
}
