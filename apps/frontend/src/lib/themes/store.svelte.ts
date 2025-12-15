/**
 * Theme Store for CodeOpen
 * 
 * Modular theme management system that allows independent selection of:
 * - Color schemes (UI colors, accent colors)
 * - Font pairings (body, heading, mono fonts)
 * - Light/dark mode
 * 
 * Supports both legacy presets and new mix-and-match approach.
 * Persists theme preferences to localStorage.
 */

import { colorSchemesMap, DEFAULT_COLOR_SCHEME_ID, type ColorScheme } from "./colors";
import { fontPairingsMap, DEFAULT_FONT_PAIRING_ID, type FontPairing } from "./fonts";
import { themePresetsMap, type ThemePreset } from "./presets/index";
import type { ThemeStyleProps, ThemeFonts, CustomThemeConfig } from "./presets/types";

// =============================================================================
// Storage Keys
// =============================================================================

const THEME_MODE_KEY = "codeopen-theme-mode";
const THEME_COLOR_SCHEME_KEY = "codeopen-color-scheme";
const THEME_FONT_PAIRING_KEY = "codeopen-font-pairing";
const THEME_CUSTOM_THEMES_KEY = "codeopen-custom-themes";

// Legacy key (for migration)
const LEGACY_THEME_PRESET_KEY = "codeopen-theme-preset";

// =============================================================================
// Types
// =============================================================================

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedMode = "light" | "dark";

// =============================================================================
// State
// =============================================================================

let themeMode = $state<ThemeMode>("system");
let colorSchemeId = $state<string>(DEFAULT_COLOR_SCHEME_ID);
let fontPairingId = $state<string>(DEFAULT_FONT_PAIRING_ID);
let resolvedMode = $state<ResolvedMode>("light");
let customThemes = $state<CustomThemeConfig[]>([]);

// Computed current selections
let currentColorScheme = $derived(colorSchemesMap.get(colorSchemeId));
let currentFontPairing = $derived(fontPairingsMap.get(fontPairingId));

// =============================================================================
// Initialization
// =============================================================================

function initialize() {
  if (typeof window === "undefined") return;

  // Load saved preferences
  const savedMode = localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null;
  const savedColorScheme = localStorage.getItem(THEME_COLOR_SCHEME_KEY);
  const savedFontPairing = localStorage.getItem(THEME_FONT_PAIRING_KEY);
  const savedCustomThemes = localStorage.getItem(THEME_CUSTOM_THEMES_KEY);

  // Check for legacy preset and migrate
  const legacyPreset = localStorage.getItem(LEGACY_THEME_PRESET_KEY);
  if (legacyPreset && !savedColorScheme && !savedFontPairing) {
    migrateFromLegacyPreset(legacyPreset);
  }

  if (savedMode && ["light", "dark", "system"].includes(savedMode)) {
    themeMode = savedMode;
  }

  if (savedColorScheme && colorSchemesMap.has(savedColorScheme)) {
    colorSchemeId = savedColorScheme;
  }

  if (savedFontPairing && fontPairingsMap.has(savedFontPairing)) {
    fontPairingId = savedFontPairing;
  }

  if (savedCustomThemes) {
    try {
      customThemes = JSON.parse(savedCustomThemes);
    } catch (e) {
      console.warn("Failed to parse custom themes", e);
    }
  }

  // Resolve system preference
  updateResolvedMode();

  // Listen for system preference changes
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", updateResolvedMode);

  // Apply initial theme
  applyTheme();
}

/**
 * Migrate from legacy preset system to new modular system
 */
function migrateFromLegacyPreset(presetId: string) {
  // Map legacy preset ID to color scheme
  if (colorSchemesMap.has(presetId)) {
    colorSchemeId = presetId;
    localStorage.setItem(THEME_COLOR_SCHEME_KEY, presetId);
  }

  // Map legacy preset ID to appropriate font pairing
  const preset = themePresetsMap.get(presetId);
  if (preset) {
    const mappedFontPairing = mapPresetToFontPairing(preset);
    if (mappedFontPairing) {
      fontPairingId = mappedFontPairing;
      localStorage.setItem(THEME_FONT_PAIRING_KEY, mappedFontPairing);
    }
  }

  // Clean up legacy key
  localStorage.removeItem(LEGACY_THEME_PRESET_KEY);
}

/**
 * Map legacy preset to font pairing based on fonts used
 */
function mapPresetToFontPairing(preset: ThemePreset): string | null {
  const { "font-body": body, "font-heading": heading, "font-mono": mono } = preset.fonts;

  // Find matching font pairing
  for (const [id, fp] of fontPairingsMap) {
    if (
      fp.fonts["font-body"] === body &&
      fp.fonts["font-heading"] === heading &&
      fp.fonts["font-mono"] === mono
    ) {
      return id;
    }
  }

  // Default based on common patterns
  if (body === "Inter") return "classic-inter";
  if (body === "Nunito" && heading === "Nunito") return "classic-nunito";
  if (body === "Space Grotesk") return "modern-geometric";
  if (body === "IBM Plex Sans") return "tech-ibm";
  if (body === "Rajdhani") return "creative-cyberpunk";
  if (body === "Press Start 2P") return "creative-retro";

  return DEFAULT_FONT_PAIRING_ID;
}

// =============================================================================
// Mode Resolution
// =============================================================================

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

// =============================================================================
// Theme Application
// =============================================================================

function applyTheme() {
  if (typeof window === "undefined") return;

  const colorScheme = colorSchemesMap.get(colorSchemeId);
  const fontPairing = fontPairingsMap.get(fontPairingId);

  if (!colorScheme || !fontPairing) return;

  applyColorScheme(colorScheme);
  applyFontPairing(fontPairing);
}

function applyColorScheme(colorScheme: ColorScheme) {
  const styles = resolvedMode === "dark" ? colorScheme.styles.dark : colorScheme.styles.light;
  const root = document.documentElement;

  // CSS variable mapping
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
    "cyber-cyan": "--cyber-cyan",
    "cyber-cyan-dim": "--cyber-cyan-dim",
    "cyber-emerald": "--cyber-emerald",
    "cyber-magenta": "--cyber-magenta",
    "cyber-amber": "--cyber-amber",
    "cyber-red": "--cyber-red",
    "cyber-glow": "--cyber-glow",
    "cyber-glow-emerald": "--cyber-glow-emerald",
  };

  // Apply each style property
  for (const [key, cssVar] of Object.entries(cssVarMap)) {
    const value = styles[key as keyof ThemeStyleProps];
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }
}

function applyFontPairing(fontPairing: FontPairing) {
  const root = document.documentElement;

  const fontVarMap: Record<keyof ThemeFonts, string> = {
    "font-body": "--font-body",
    "font-heading": "--font-heading",
    "font-mono": "--font-mono",
  };

  for (const [key, cssVar] of Object.entries(fontVarMap)) {
    const value = fontPairing.fonts[key as keyof ThemeFonts];
    if (value) {
      // Wrap font name in quotes for proper CSS font-family syntax
      root.style.setProperty(cssVar, `'${value}'`);
    }
  }
}

// =============================================================================
// Custom Theme Management
// =============================================================================

function saveCustomTheme(name: string): CustomThemeConfig {
  const now = Date.now();
  const id = `custom-${now}`;

  const customTheme: CustomThemeConfig = {
    id,
    name,
    colorSchemeId,
    fontPairingId,
    createdAt: now,
    updatedAt: now,
  };

  customThemes = [...customThemes, customTheme];
  localStorage.setItem(THEME_CUSTOM_THEMES_KEY, JSON.stringify(customThemes));

  return customTheme;
}

function updateCustomTheme(id: string, updates: Partial<Pick<CustomThemeConfig, "name" | "colorSchemeId" | "fontPairingId">>) {
  customThemes = customThemes.map((theme) =>
    theme.id === id
      ? { ...theme, ...updates, updatedAt: Date.now() }
      : theme
  );
  localStorage.setItem(THEME_CUSTOM_THEMES_KEY, JSON.stringify(customThemes));
}

function deleteCustomTheme(id: string) {
  customThemes = customThemes.filter((theme) => theme.id !== id);
  localStorage.setItem(THEME_CUSTOM_THEMES_KEY, JSON.stringify(customThemes));
}

function applyCustomTheme(customTheme: CustomThemeConfig) {
  if (colorSchemesMap.has(customTheme.colorSchemeId)) {
    colorSchemeId = customTheme.colorSchemeId;
    localStorage.setItem(THEME_COLOR_SCHEME_KEY, colorSchemeId);
  }

  if (fontPairingsMap.has(customTheme.fontPairingId)) {
    fontPairingId = customTheme.fontPairingId;
    localStorage.setItem(THEME_FONT_PAIRING_KEY, fontPairingId);
  }

  applyTheme();
}

// =============================================================================
// Public API
// =============================================================================

export const themeStore = {
  // Getters
  get mode() {
    return themeMode;
  },

  get resolvedMode() {
    return resolvedMode;
  },

  get isDark() {
    return resolvedMode === "dark";
  },

  get colorSchemeId() {
    return colorSchemeId;
  },

  get fontPairingId() {
    return fontPairingId;
  },

  get currentColorScheme(): ColorScheme | undefined {
    return currentColorScheme;
  },

  get currentFontPairing(): FontPairing | undefined {
    return currentFontPairing;
  },

  get customThemes() {
    return customThemes;
  },

  /** Get current Shiki themes based on color scheme */
  get shikiThemes() {
    const scheme = currentColorScheme;
    if (!scheme) return { light: "github-light" as const, dark: "github-dark" as const };
    return scheme.shikiThemes;
  },

  // Legacy compatibility - returns a "virtual" preset
  get presetId() {
    return colorSchemeId;
  },

  get currentPreset(): ThemePreset | undefined {
    // For legacy compatibility, construct a virtual preset
    const colorScheme = currentColorScheme;
    const fontPairing = currentFontPairing;
    if (!colorScheme || !fontPairing) return undefined;

    return {
      id: colorScheme.id,
      label: colorScheme.label,
      category: colorScheme.category,
      fonts: fontPairing.fonts,
      styles: colorScheme.styles,
    };
  },

  // Setters
  setMode(mode: ThemeMode) {
    themeMode = mode;
    localStorage.setItem(THEME_MODE_KEY, mode);
    updateResolvedMode();
    applyTheme();
  },

  setColorScheme(id: string) {
    if (!colorSchemesMap.has(id)) {
      console.warn(`Color scheme "${id}" not found`);
      return;
    }
    colorSchemeId = id;
    localStorage.setItem(THEME_COLOR_SCHEME_KEY, id);
    applyTheme();
  },

  setFontPairing(id: string) {
    if (!fontPairingsMap.has(id)) {
      console.warn(`Font pairing "${id}" not found`);
      return;
    }
    fontPairingId = id;
    localStorage.setItem(THEME_FONT_PAIRING_KEY, id);
    applyTheme();
  },

  /** Legacy compatibility - sets both color scheme and tries to match font pairing */
  setPreset(presetId: string) {
    if (colorSchemesMap.has(presetId)) {
      colorSchemeId = presetId;
      localStorage.setItem(THEME_COLOR_SCHEME_KEY, presetId);
    }

    // Try to find matching font pairing from legacy preset
    const preset = themePresetsMap.get(presetId);
    if (preset) {
      const mappedFontPairing = mapPresetToFontPairing(preset);
      if (mappedFontPairing) {
        fontPairingId = mappedFontPairing;
        localStorage.setItem(THEME_FONT_PAIRING_KEY, mappedFontPairing);
      }
    }

    applyTheme();
  },

  // Custom theme methods
  saveCustomTheme,
  updateCustomTheme,
  deleteCustomTheme,
  applyCustomTheme,

  // Initialization
  initialize,

  // Preview helpers
  getColorSchemePreview(schemeId: string): { primary: string; background: string; foreground: string } | null {
    const scheme = colorSchemesMap.get(schemeId);
    if (!scheme) return null;

    const styles = resolvedMode === "dark" ? scheme.styles.dark : scheme.styles.light;
    return {
      primary: styles.primary,
      background: styles.background,
      foreground: styles.foreground,
    };
  },

  getFontPairingPreview(pairingId: string): ThemeFonts | null {
    const pairing = fontPairingsMap.get(pairingId);
    if (!pairing) return null;
    return pairing.fonts;
  },
};

// Re-export collections for UI components
export { colorSchemes, colorSchemesMap, getColorSchemesByCategory, DEFAULT_COLOR_SCHEME_ID } from "./colors";
export { fontPairings, fontPairingsMap, getFontPairingsByCategory, DEFAULT_FONT_PAIRING_ID } from "./fonts";
export { colorSchemeCategories, fontPairingCategories } from "./presets/types";
export type { ColorScheme } from "./colors";
export type { FontPairing } from "./fonts";

// =============================================================================
// Auto-initialization
// =============================================================================

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
}
