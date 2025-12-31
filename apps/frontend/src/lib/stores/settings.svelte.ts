/**
 * Settings Store
 * 
 * Manages app settings using Svelte 5 runes.
 * Settings are stored locally with export/import capability.
 */

import * as api from "$lib/api/tauri";
import type { AppSettings, Provider, Theme } from "$lib/api/tauri";

// =============================================================================
// State
// =============================================================================

const defaultSettings: AppSettings = {
  theme: "system",
  defaultProviderId: null,
  autoRefreshInterval: 30,
  inAppNotifications: true,
  systemNotifications: true,
};

let currentSettings = $state<AppSettings>({ ...defaultSettings });
let providers = $state<Provider[]>([]);
let isLoading = $state(false);
let isInitialized = $state(false);
let providersLoaded = $state(false);
let error = $state<string | null>(null);

let themeMediaQueryForCleanup: MediaQueryList | null = null;
let themeListenerForCleanup: ((e: MediaQueryListEvent) => void) | null = null;

// =============================================================================
// Derived State
// =============================================================================

export const settings = {
  get current() { return currentSettings; },
  get theme() { return currentSettings.theme; },
  get defaultProviderId() { return currentSettings.defaultProviderId; },
  get autoRefreshInterval() { return currentSettings.autoRefreshInterval; },
  get inAppNotifications() { return currentSettings.inAppNotifications; },
  get systemNotifications() { return currentSettings.systemNotifications; },
  get providers() { return providers; },
  get isLoading() { return isLoading; },
  get isInitialized() { return isInitialized; },
  get error() { return error; },
  
  // Helper to get the default provider object
  get defaultProvider() {
    return providers.find(p => p.id === currentSettings.defaultProviderId) ?? null;
  },
  
  // Helper to get configured providers
  get configuredProviders() {
    return providers.filter(p => p.isConfigured);
  },
};

// =============================================================================
// Theme Application
// =============================================================================

/**
 * Apply theme to the document
 */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  
  const root = document.documentElement;
  
  if (theme === "system") {
    // Use system preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  } else {
    root.classList.toggle("dark", theme === "dark");
  }
}

/**
 * Listen for system theme changes
 */
function setupThemeListener(): void {
  if (typeof window === "undefined") return;
  
  // Cleanup existing listener to prevent memory leaks
  if (themeMediaQueryForCleanup && themeListenerForCleanup) {
    themeMediaQueryForCleanup.removeEventListener("change", themeListenerForCleanup);
  }
  
  themeMediaQueryForCleanup = window.matchMedia("(prefers-color-scheme: dark)");
  themeListenerForCleanup = (e) => {
    if (currentSettings.theme === "system") {
      document.documentElement.classList.toggle("dark", e.matches);
    }
  };
  themeMediaQueryForCleanup.addEventListener("change", themeListenerForCleanup);
}

// =============================================================================
// Actions
// =============================================================================

/**
 * Initialize settings from local storage
 */
export async function initSettings(): Promise<void> {
  if (isInitialized) return;
  
  isLoading = true;
  error = null;
  
  try {
    currentSettings = await api.getSettings();
    applyTheme(currentSettings.theme);
    setupThemeListener();
  } catch (e) {
    // Use defaults if no settings exist yet
    console.warn("Failed to load settings, using defaults:", e);
    currentSettings = { ...defaultSettings };
    applyTheme(currentSettings.theme);
  } finally {
    isLoading = false;
    isInitialized = true;
  }
}

/**
 * Load providers from the Management API
 * This function is idempotent - it only fetches once unless forceRefresh is true
 */
export async function loadProviders(forceRefresh = false): Promise<void> {
  // Skip if already loaded (unless force refresh)
  if (providersLoaded && !forceRefresh) return;
  
  isLoading = true;
  error = null;
  
  try {
    providers = await api.listProviders();
    providersLoaded = true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load providers";
    providers = [];
    // Don't mark as loaded on error so retry is possible
    providersLoaded = false;
  } finally {
    isLoading = false;
  }
}

/**
 * Force refresh providers from the Management API
 */
export async function refreshProviders(): Promise<void> {
  return loadProviders(true);
}

/**
 * Update settings
 */
export async function updateSettings(newSettings: Partial<AppSettings>): Promise<boolean> {
  isLoading = true;
  error = null;
  
  const updatedSettings = { ...currentSettings, ...newSettings };
  
  try {
    await api.saveSettings(updatedSettings);
    currentSettings = updatedSettings;
    
    // Apply theme if it changed
    if (newSettings.theme !== undefined) {
      applyTheme(newSettings.theme);
    }
    
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to save settings";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Set the theme
 */
export async function setTheme(theme: Theme): Promise<boolean> {
  return updateSettings({ theme });
}

/**
 * Set the default provider
 */
export async function setDefaultProvider(providerId: string | null): Promise<boolean> {
  return updateSettings({ defaultProviderId: providerId });
}

/**
 * Set the auto-refresh interval
 */
export async function setAutoRefreshInterval(interval: number): Promise<boolean> {
  return updateSettings({ autoRefreshInterval: interval });
}

/**
 * Toggle in-app notifications
 */
export async function setInAppNotifications(enabled: boolean): Promise<boolean> {
  return updateSettings({ inAppNotifications: enabled });
}

/**
 * Toggle system notifications
 */
export async function setSystemNotifications(enabled: boolean): Promise<boolean> {
  return updateSettings({ systemNotifications: enabled });
}

/**
 * Export settings to JSON string
 */
export async function exportSettingsJson(): Promise<string | null> {
  isLoading = true;
  error = null;
  
  try {
    return await api.exportSettings();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to export settings";
    return null;
  } finally {
    isLoading = false;
  }
}

/**
 * Import settings from JSON string
 */
export async function importSettingsJson(json: string): Promise<boolean> {
  isLoading = true;
  error = null;
  
  try {
    currentSettings = await api.importSettings(json);
    applyTheme(currentSettings.theme);
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to import settings";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<boolean> {
  return updateSettings({ ...defaultSettings });
}
