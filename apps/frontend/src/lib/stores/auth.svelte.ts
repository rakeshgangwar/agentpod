/**
 * Auth Store
 * 
 * Manages authentication state for Keycloak OAuth using Svelte 5 runes.
 */

import * as api from "$lib/api/tauri";
import type { AuthStatus } from "$lib/api/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";

// =============================================================================
// State
// =============================================================================

let authStatus = $state<AuthStatus>({
  authenticated: false,
  user: null,
  expiresAt: null,
});

let isLoading = $state(false);
let isInitialized = $state(false);
let error = $state<string | null>(null);

// =============================================================================
// Derived State
// =============================================================================

export const auth = {
  get status() { return authStatus; },
  get isAuthenticated() { return authStatus.authenticated; },
  get user() { return authStatus.user; },
  get expiresAt() { return authStatus.expiresAt; },
  get isLoading() { return isLoading; },
  get isInitialized() { return isInitialized; },
  get error() { return error; },
  
  // Computed properties
  get displayName() {
    if (!authStatus.user) return null;
    return authStatus.user.name || authStatus.user.preferredUsername || authStatus.user.email || "User";
  },
  get initials() {
    const name = this.displayName;
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  },
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Initialize auth state from storage
 */
export async function initAuth(): Promise<void> {
  if (isInitialized) return;
  
  isLoading = true;
  error = null;
  
  try {
    authStatus = await api.authGetStatus();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to initialize auth";
    authStatus = {
      authenticated: false,
      user: null,
      expiresAt: null,
    };
  } finally {
    isLoading = false;
    isInitialized = true;
  }
}

/**
 * Start the OAuth login flow
 * Opens the browser to Keycloak and sets up callback listener
 */
export async function login(): Promise<boolean> {
  isLoading = true;
  error = null;
  
  try {
    // Set up callback listener
    const unlisten = await api.onOAuthCallback(async (callbackUrl) => {
      try {
        // Complete the login
        authStatus = await api.authCompleteLogin(callbackUrl);
        isLoading = false;
      } catch (err) {
        error = err instanceof Error ? err.message : "Login failed";
        isLoading = false;
      } finally {
        unlisten();
      }
    });
    
    // Get the authorization URL and open it
    const authUrl = await api.authStartLogin();
    await openUrl(authUrl);
    
    // The callback will be handled by the listener above
    return true;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to start login";
    isLoading = false;
    return false;
  }
}

/**
 * Logout the current user
 */
export async function logout(): Promise<void> {
  isLoading = true;
  error = null;
  
  try {
    await api.authLogout();
    authStatus = {
      authenticated: false,
      user: null,
      expiresAt: null,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : "Logout failed";
  } finally {
    isLoading = false;
  }
}

/**
 * Refresh the access token
 */
export async function refreshToken(): Promise<boolean> {
  isLoading = true;
  error = null;
  
  try {
    authStatus = await api.authRefreshToken();
    return true;
  } catch (err) {
    error = err instanceof Error ? err.message : "Token refresh failed";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Get a valid access token (auto-refreshes if needed)
 */
export async function getToken(): Promise<string | null> {
  try {
    return await api.authGetToken();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to get token";
    return null;
  }
}

/**
 * Check authentication and refresh status
 */
export async function checkAuth(): Promise<boolean> {
  try {
    authStatus = await api.authGetStatus();
    return authStatus.authenticated;
  } catch (err) {
    error = err instanceof Error ? err.message : "Auth check failed";
    return false;
  }
}

/**
 * Clear any auth errors
 */
export function clearError(): void {
  error = null;
}
