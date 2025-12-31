/**
 * Theme Presets Index
 * 
 * Re-exports all types and theme presets from the modular structure.
 */

// Re-export all types
export type { ThemePreset, ThemeFonts, ThemeStyleProps, ThemeCategory } from "./types";
export { themeCategories } from "./types";

// Import themes from category folders
import { neutral, blue } from "./default";
import { catppuccin, perpetuity, cosmicNight, midnightBloom } from "./developer";
import { supabase, twitter } from "./brand";
import { northernLights, oceanBreeze, sunsetHorizon, nature } from "./nature";
import { cleanSlate, graphite, modernMinimal } from "./minimal";
import { cyberpunk, roseGold, retroArcade, mochaMousse, elegantLuxury } from "./creative";

import type { ThemePreset } from "./types";

// Export all themes as individual named exports
export {
  // Default themes
  neutral,
  blue,
  // Developer themes
  catppuccin,
  perpetuity,
  cosmicNight,
  midnightBloom,
  // Brand themes
  supabase,
  twitter,
  // Nature themes
  northernLights,
  oceanBreeze,
  sunsetHorizon,
  nature,
  // Minimal themes
  cleanSlate,
  graphite,
  modernMinimal,
  // Creative themes
  cyberpunk,
  roseGold,
  retroArcade,
  mochaMousse,
  elegantLuxury,
};

// Combined array of all theme presets
export const themePresets: ThemePreset[] = [
  // Default themes
  neutral,
  blue,
  // Developer themes
  catppuccin,
  perpetuity,
  cosmicNight,
  midnightBloom,
  // Brand themes
  supabase,
  twitter,
  // Nature themes
  northernLights,
  oceanBreeze,
  sunsetHorizon,
  nature,
  // Minimal themes
  cleanSlate,
  graphite,
  modernMinimal,
  // Creative themes
  cyberpunk,
  roseGold,
  retroArcade,
  mochaMousse,
  elegantLuxury,
];

// Re-export aliases for backward compatibility
export { neutral as defaultNeutral, blue as defaultBlue };

// Map for quick lookup by theme ID
export const themePresetsMap = new Map<string, ThemePreset>(
  themePresets.map((preset) => [preset.id, preset])
);

// Helper to get themes by category
export function getThemesByCategory(category: ThemePreset["category"]): ThemePreset[] {
  return themePresets.filter((preset) => preset.category === category);
}
