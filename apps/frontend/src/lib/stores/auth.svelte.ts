/**
 * Auth Store
 *
 * Manages authentication state using Better Auth with Svelte 5 runes.
 * Replaces the previous Keycloak-based authentication.
 * 
 * The auth client is created dynamically based on the connected API URL.
 */

import { createAuthClient } from "better-auth/svelte";
import { authStoreSession, authLogout as tauriAuthLogout, authGetStatus } from "$lib/api/tauri";

// =============================================================================
// Dynamic Auth Client
// =============================================================================

// The auth client is created dynamically based on the connected API URL
let currentAuthClient: ReturnType<typeof createAuthClient> | null = null;
let currentApiUrl: string | null = null;

/**
 * Get or create the auth client for the given API URL
 */
function getAuthClient(apiUrl?: string): ReturnType<typeof createAuthClient> {
  const url = apiUrl || currentApiUrl || "http://localhost:3001";
  
  // Create a new client if URL changed or client doesn't exist
  if (!currentAuthClient || url !== currentApiUrl) {
    currentApiUrl = url;
    currentAuthClient = createAuthClient({
      baseURL: url,
    });
  }
  
  return currentAuthClient;
}

/**
 * Set the API URL and create a new auth client
 * Called when connection is established
 */
export function setAuthApiUrl(apiUrl: string) {
  currentApiUrl = apiUrl;
  currentAuthClient = createAuthClient({
    baseURL: apiUrl,
  });
}

/**
 * Get the current API URL
 */
export function getAuthApiUrl(): string | null {
  return currentApiUrl;
}

// =============================================================================
// State
// =============================================================================

let isLoading = $state(false);
let isInitialized = $state(false);
let error = $state<string | null>(null);
let sessionData = $state<{
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  };
} | null>(null);

// =============================================================================
// Derived State
// =============================================================================

export const auth = {
  // Convenience getters
  get isAuthenticated() {
    return !!sessionData?.user;
  },

  get user() {
    return sessionData?.user ?? null;
  },

  get isLoading() {
    return isLoading;
  },

  get isInitialized() {
    return isInitialized;
  },

  get error() {
    return error;
  },

  // Computed properties
  get displayName() {
    const user = sessionData?.user;
    if (!user) return null;
    return user.name || user.email || "User";
  },

  get initials() {
    const user = sessionData?.user;
    const name = user?.name || user?.email || null;
    if (!name) return "?";
    return name
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  },

  get avatarUrl() {
    return sessionData?.user?.image ?? null;
  },

  get email() {
    return sessionData?.user?.email ?? null;
  },
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Initialize auth state
 * First tries to load from Tauri's secure storage, which persists across refreshes
 */
export async function initAuth(): Promise<void> {
  if (isInitialized) return;

  isLoading = true;
  error = null;

  try {
    // First, try to load from Tauri secure storage (persists across app restarts)
    const storedStatus = await authGetStatus();
    if (storedStatus.authenticated && storedStatus.user) {
      sessionData = {
        user: {
          id: storedStatus.user.id,
          email: storedStatus.user.email ?? "",
          name: storedStatus.user.name ?? null,
          image: null,
        },
      };
    }
  } catch (err) {
    // Tauri storage failed, continue without stored session
    console.warn("[Auth] Failed to load stored session:", err);
    error = err instanceof Error ? err.message : "Failed to initialize auth";
  } finally {
    isLoading = false;
    isInitialized = true;
  }
}

/**
 * Sign in with GitHub OAuth
 * Opens a popup or redirects to GitHub for authentication
 */
export async function login(): Promise<boolean> {
  isLoading = true;
  error = null;

  try {
    const client = getAuthClient();
    const result = await client.signIn.social({
      provider: "github",
    });

    if (result.error) {
      error = result.error.message ?? "Sign in failed";
      return false;
    }

    return true;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to start login";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Sign in with email and password
 */
export async function loginWithEmail(emailInput: string, password: string): Promise<boolean> {
  isLoading = true;
  error = null;

  try {
    const client = getAuthClient();
    const result = await client.signIn.email({
      email: emailInput,
      password,
    });

    if (result.error) {
      error = result.error.message ?? "Sign in failed";
      return false;
    }

    // Store the session data
    if (result.data?.user) {
      sessionData = {
        user: {
          id: result.data.user.id,
          email: result.data.user.email,
          name: result.data.user.name,
          image: result.data.user.image,
        },
      };

      // Store the session token for Tauri API calls
      if (result.data.token) {
        await authStoreSession(
          result.data.token,
          result.data.user.id,
          result.data.user.email,
          result.data.user.name
        );
      }
    }

    return true;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to sign in";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Sign up with email and password
 */
export async function signUp(emailInput: string, password: string, name: string): Promise<boolean> {
  isLoading = true;
  error = null;

  try {
    const client = getAuthClient();
    const result = await client.signUp.email({
      email: emailInput,
      password,
      name,
    });

    if (result.error) {
      error = result.error.message ?? "Sign up failed";
      return false;
    }

    // Store the session data
    if (result.data?.user) {
      sessionData = {
        user: {
          id: result.data.user.id,
          email: result.data.user.email,
          name: result.data.user.name,
          image: result.data.user.image,
        },
      };

      // Store the session token for Tauri API calls
      if (result.data.token) {
        await authStoreSession(
          result.data.token,
          result.data.user.id,
          result.data.user.email,
          result.data.user.name
        );
      }
    }

    return true;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to sign up";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Logout the current user
 */
export async function logout(): Promise<void> {
  isLoading = true;
  error = null;

  try {
    const client = getAuthClient();
    
    // Clear both Better Auth session and Tauri stored session
    await Promise.all([
      client.signOut(),
      tauriAuthLogout()
    ]);
    
    // Clear local session data
    sessionData = null;
  } catch (err) {
    error = err instanceof Error ? err.message : "Logout failed";
  } finally {
    isLoading = false;
  }
}

/**
 * Refresh the session
 * Better Auth handles session refresh automatically
 */
export async function refreshToken(): Promise<boolean> {
  // Better Auth automatically manages session refresh
  // This is kept for API compatibility
  return auth.isAuthenticated;
}

/**
 * Get the current access token (for API calls)
 * With Better Auth, we use cookies, so this returns null
 * API calls should be made with credentials: 'include'
 */
export async function getToken(): Promise<string | null> {
  // Better Auth uses HTTP-only cookies, not bearer tokens
  // For API calls, use credentials: 'include' instead
  return null;
}

/**
 * Check authentication status
 */
export async function checkAuth(): Promise<boolean> {
  return auth.isAuthenticated;
}

/**
 * Clear any auth errors
 */
export function clearError(): void {
  error = null;
}

// =============================================================================
// Legacy Exports (for backward compatibility)
// =============================================================================

export interface AuthStatus {
  authenticated: boolean;
  user: {
    id: string;
    email?: string;
    name?: string;
    preferredUsername?: string;
  } | null;
  expiresAt: number | null;
}

/**
 * Get auth status in legacy format
 * @deprecated Use auth.isAuthenticated and auth.user instead
 */
export function getAuthStatus(): AuthStatus {
  const user = auth.user;

  return {
    authenticated: !!user,
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          preferredUsername: user.email?.split("@")[0],
        }
      : null,
    expiresAt: null, // Better Auth handles session expiry automatically
  };
}
