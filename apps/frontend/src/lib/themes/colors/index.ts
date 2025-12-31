/**
 * Color Schemes Collection
 * 
 * Color schemes extracted from theme presets with Shiki theme mappings.
 * Shiki themes are chosen to match the color palette aesthetics.
 * 
 * Reference: https://shiki.style/themes
 */

import type { ColorScheme, ThemeStyleProps } from "../presets/types";

// Re-export type
export type { ColorScheme } from "../presets/types";

// Import existing preset styles (we'll extract just the colors)
import { neutral, blue } from "../presets/default";
import { catppuccin, perpetuity, cosmicNight, midnightBloom } from "../presets/developer";
import { supabase, twitter } from "../presets/brand";
import { northernLights, oceanBreeze, sunsetHorizon, nature } from "../presets/nature";
import { cleanSlate, graphite, modernMinimal } from "../presets/minimal";
import { cyberpunk, roseGold, retroArcade, mochaMousse, elegantLuxury } from "../presets/creative";

// =============================================================================
// Helper to convert ThemePreset to ColorScheme
// =============================================================================

function presetToColorScheme(
  preset: { id: string; label: string; category: string; styles: { light: ThemeStyleProps; dark: ThemeStyleProps } },
  shikiLight: ColorScheme["shikiThemes"]["light"],
  shikiDark: ColorScheme["shikiThemes"]["dark"]
): ColorScheme {
  return {
    id: preset.id,
    label: preset.label,
    category: preset.category as ColorScheme["category"],
    shikiThemes: {
      light: shikiLight,
      dark: shikiDark,
    },
    styles: preset.styles,
  };
}

// =============================================================================
// Default Color Schemes
// =============================================================================

export const neutralScheme = presetToColorScheme(
  neutral,
  "github-light",
  "github-dark"
);

export const blueScheme = presetToColorScheme(
  blue,
  "github-light",
  "github-dark"
);

// =============================================================================
// Developer Color Schemes
// =============================================================================

export const catppuccinScheme = presetToColorScheme(
  catppuccin,
  "catppuccin-latte",
  "catppuccin-mocha"
);

export const perpetuityScheme = presetToColorScheme(
  perpetuity,
  "slack-ochin",
  "tokyo-night"
);

export const cosmicNightScheme = presetToColorScheme(
  cosmicNight,
  "one-light",
  "one-dark-pro"
);

export const midnightBloomScheme = presetToColorScheme(
  midnightBloom,
  "rose-pine-dawn",
  "rose-pine-moon"
);

// =============================================================================
// Brand Color Schemes
// =============================================================================

export const supabaseScheme = presetToColorScheme(
  supabase,
  "github-light",
  "github-dark-dimmed"
);

export const twitterScheme = presetToColorScheme(
  twitter,
  "github-light",
  "github-dark"
);

// =============================================================================
// Nature Color Schemes
// =============================================================================

export const northernLightsScheme = presetToColorScheme(
  northernLights,
  "aurora-x",
  "aurora-x"
);

export const oceanBreezeScheme = presetToColorScheme(
  oceanBreeze,
  "slack-ochin",
  "material-theme-ocean"
);

export const sunsetHorizonScheme = presetToColorScheme(
  sunsetHorizon,
  "snazzy-light",
  "synthwave-84"
);

export const natureScheme = presetToColorScheme(
  nature,
  "everforest-light",
  "everforest-dark"
);

// =============================================================================
// Minimal Color Schemes
// =============================================================================

export const cleanSlateScheme = presetToColorScheme(
  cleanSlate,
  "github-light",
  "github-dark"
);

export const graphiteScheme = presetToColorScheme(
  graphite,
  "github-light",
  "vitesse-dark"
);

export const modernMinimalScheme = presetToColorScheme(
  modernMinimal,
  "min-light",
  "min-dark"
);

// =============================================================================
// Creative Color Schemes
// =============================================================================

export const cyberpunkScheme = presetToColorScheme(
  cyberpunk,
  "vitesse-light",
  "synthwave-84"
);

export const roseGoldScheme = presetToColorScheme(
  roseGold,
  "rose-pine-dawn",
  "rose-pine"
);

export const retroArcadeScheme = presetToColorScheme(
  retroArcade,
  "solarized-light",
  "solarized-dark"
);

export const mochaMousseScheme = presetToColorScheme(
  mochaMousse,
  "slack-ochin",
  "monokai"
);

export const elegantLuxuryScheme = presetToColorScheme(
  elegantLuxury,
  "vitesse-light",
  "dracula"
);

// =============================================================================
// Exports
// =============================================================================

export const colorSchemes: ColorScheme[] = [
  // Default
  neutralScheme,
  blueScheme,
  // Developer
  catppuccinScheme,
  perpetuityScheme,
  cosmicNightScheme,
  midnightBloomScheme,
  // Brand
  supabaseScheme,
  twitterScheme,
  // Nature
  northernLightsScheme,
  oceanBreezeScheme,
  sunsetHorizonScheme,
  natureScheme,
  // Minimal
  cleanSlateScheme,
  graphiteScheme,
  modernMinimalScheme,
  // Creative
  cyberpunkScheme,
  roseGoldScheme,
  retroArcadeScheme,
  mochaMousseScheme,
  elegantLuxuryScheme,
];

export const colorSchemesMap = new Map<string, ColorScheme>(
  colorSchemes.map((cs) => [cs.id, cs])
);

export function getColorSchemesByCategory(category: ColorScheme["category"]): ColorScheme[] {
  return colorSchemes.filter((cs) => cs.category === category);
}

// Default color scheme
export const DEFAULT_COLOR_SCHEME_ID = "default-neutral";
