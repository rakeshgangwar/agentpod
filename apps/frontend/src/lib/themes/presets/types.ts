/**
 * Theme Type Definitions
 * 
 * Modular theme system that separates:
 * - Color schemes (UI colors, accent colors, code highlighting)
 * - Font pairings (body, heading, mono fonts)
 * - Future: Wallpapers, backgrounds, etc.
 * 
 * Users can mix and match any color scheme with any font pairing.
 */

import type { BundledTheme } from "shiki";

// =============================================================================
// Color Scheme Types
// =============================================================================

export interface ThemeStyleProps {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  "destructive-foreground"?: string;
  border: string;
  input: string;
  ring: string;
  "chart-1": string;
  "chart-2": string;
  "chart-3": string;
  "chart-4": string;
  "chart-5": string;
  sidebar: string;
  "sidebar-foreground": string;
  "sidebar-primary": string;
  "sidebar-primary-foreground": string;
  "sidebar-accent": string;
  "sidebar-accent-foreground": string;
  "sidebar-border": string;
  "sidebar-ring": string;
  radius?: string;
  // Cyber/accent colors for terminal aesthetic
  "cyber-cyan": string;
  "cyber-cyan-dim": string;
  "cyber-emerald": string;
  "cyber-magenta": string;
  "cyber-amber": string;
  "cyber-red": string;
  "cyber-glow": string;
  "cyber-glow-emerald": string;
}

export type ColorSchemeCategory = "default" | "brand" | "nature" | "developer" | "creative" | "minimal";

export interface ColorScheme {
  id: string;
  label: string;
  category: ColorSchemeCategory;
  /** Shiki theme names for code highlighting */
  shikiThemes: {
    light: BundledTheme;
    dark: BundledTheme;
  };
  styles: {
    light: ThemeStyleProps;
    dark: ThemeStyleProps;
  };
}

// =============================================================================
// Font Pairing Types
// =============================================================================

export interface ThemeFonts {
  "font-body": string;
  "font-heading": string;
  "font-mono": string;
}

export type FontPairingCategory = "classic" | "modern" | "creative" | "editorial" | "technical";

export interface FontPairing {
  id: string;
  label: string;
  category: FontPairingCategory;
  description?: string;
  fonts: ThemeFonts;
}

// =============================================================================
// Legacy Theme Preset (for backward compatibility)
// =============================================================================

/** @deprecated Use ColorScheme + FontPairing instead */
export interface ThemePreset {
  id: string;
  label: string;
  category: ColorSchemeCategory;
  fonts: ThemeFonts;
  styles: {
    light: ThemeStyleProps;
    dark: ThemeStyleProps;
  };
}

// =============================================================================
// User Theme Configuration
// =============================================================================

export interface CustomThemeConfig {
  id: string;
  name: string;
  colorSchemeId: string;
  fontPairingId: string;
  /** Optional custom Shiki themes override */
  shikiThemes?: {
    light: BundledTheme;
    dark: BundledTheme;
  };
  /** Future: wallpaper/background config */
  // wallpaper?: WallpaperConfig;
  createdAt: number;
  updatedAt: number;
}

export interface UserThemeConfig {
  /** Active configuration mode */
  mode: "preset" | "custom";
  /** When mode is "preset", use legacy preset ID */
  presetId?: string;
  /** When mode is "custom", use separated selections */
  colorSchemeId?: string;
  fontPairingId?: string;
  /** List of user-created custom theme configs */
  customThemes: CustomThemeConfig[];
}

// =============================================================================
// Category Definitions
// =============================================================================

export const colorSchemeCategories = [
  { id: "default", label: "Default" },
  { id: "developer", label: "Developer" },
  { id: "brand", label: "Brand" },
  { id: "nature", label: "Nature" },
  { id: "minimal", label: "Minimal" },
  { id: "creative", label: "Creative" },
] as const;

export const fontPairingCategories = [
  { id: "classic", label: "Classic" },
  { id: "modern", label: "Modern" },
  { id: "technical", label: "Technical" },
  { id: "editorial", label: "Editorial" },
  { id: "creative", label: "Creative" },
] as const;

/** @deprecated Use colorSchemeCategories instead */
export const themeCategories = colorSchemeCategories;
export type ThemeCategory = ColorSchemeCategory;
