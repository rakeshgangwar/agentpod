/**
 * Auth Store
 *
 * Manages authentication state using Better Auth with Svelte 5 runes.
 * Replaces the previous Keycloak-based authentication.
 */

import { 
  authClient, 
  signInWithGitHub, 
  signInWithEmail,
  signUpWithEmail,
  signOut as betterAuthSignOut 
} from "$lib/auth-client";

// =============================================================================
// State
// =============================================================================

// Use Better Auth's reactive session
const session = authClient.useSession();

let isLoading = $state(false);
let isInitialized = $state(false);
let error = $state<string | null>(null);

// =============================================================================
// Derived State
// =============================================================================

export const auth = {
  // Session data from Better Auth
  get session() {
    return session;
  },

  // Convenience getters
  get isAuthenticated() {
    return !!session.value?.data?.user;
  },

  get user() {
    return session.value?.data?.user ?? null;
  },

  get isLoading() {
    return isLoading || session.value?.isPending;
  },

  get isInitialized() {
    return isInitialized;
  },

  get error() {
    return error || session.value?.error?.message;
  },

  // Computed properties
  get displayName() {
    const user = session.value?.data?.user;
    if (!user) return null;
    return user.name || user.email || "User";
  },

  get initials() {
    const user = session.value?.data?.user;
    const name = user?.name || user?.email || null;
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  },

  get avatarUrl() {
    return session.value?.data?.user?.image ?? null;
  },

  get email() {
    return session.value?.data?.user?.email ?? null;
  },
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Initialize auth state
 * Better Auth handles this automatically via useSession()
 */
export async function initAuth(): Promise<void> {
  if (isInitialized) return;

  isLoading = true;
  error = null;

  try {
    // Better Auth's useSession() automatically fetches the session
    // We just need to wait for the initial fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (err) {
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
    const result = await signInWithGitHub();

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
export async function loginWithEmail(email: string, password: string): Promise<boolean> {
  isLoading = true;
  error = null;

  try {
    const result = await signInWithEmail(email, password);

    if (result.error) {
      error = result.error.message ?? "Sign in failed";
      return false;
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
export async function signUp(email: string, password: string, name: string): Promise<boolean> {
  isLoading = true;
  error = null;

  try {
    const result = await signUpWithEmail(email, password, name);

    if (result.error) {
      error = result.error.message ?? "Sign up failed";
      return false;
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
    await betterAuthSignOut();
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
          name: user.name,
          preferredUsername: user.email?.split("@")[0],
        }
      : null,
    expiresAt: null, // Better Auth handles session expiry automatically
  };
}
