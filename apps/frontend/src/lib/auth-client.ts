/**
 * Better Auth Client
 *
 * Client-side authentication using Better Auth for Svelte.
 * Provides reactive session state and authentication methods.
 */

import { createAuthClient } from "better-auth/svelte";

// =============================================================================
// Auth Client Configuration
// =============================================================================

/**
 * Get the API base URL from environment or default to localhost
 */
function getBaseURL(): string {
  // In development, use the API server URL
  // In production (Tauri), this would be the deployed API URL
  if (typeof window !== "undefined") {
    // Check for environment variable (set in Vite/SvelteKit config)
    const envUrl = import.meta.env?.VITE_API_URL;
    if (envUrl) return envUrl;
  }

  // Default to localhost for development
  return "http://localhost:3001";
}

/**
 * Better Auth client instance
 *
 * Provides:
 * - signIn.social({ provider: "github" }) - GitHub OAuth sign-in
 * - signIn.email({ email, password }) - Email/password sign-in
 * - signUp.email({ email, password, name }) - Email/password sign-up
 * - signOut() - Sign out
 * - useSession() - Reactive session store
 */
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

// =============================================================================
// Convenience Exports
// =============================================================================

/**
 * Sign in with GitHub OAuth
 *
 * @example
 * ```svelte
 * <button on:click={signInWithGitHub}>Sign in with GitHub</button>
 * ```
 */
export async function signInWithGitHub() {
  return authClient.signIn.social({
    provider: "github",
  });
}

/**
 * Sign in with email and password
 *
 * @example
 * ```svelte
 * <button on:click={() => signInWithEmail(email, password)}>Sign in</button>
 * ```
 */
export async function signInWithEmail(email: string, password: string) {
  return authClient.signIn.email({
    email,
    password,
  });
}

/**
 * Sign up with email and password
 *
 * @example
 * ```svelte
 * <button on:click={() => signUpWithEmail(email, password, name)}>Sign up</button>
 * ```
 */
export async function signUpWithEmail(email: string, password: string, name: string) {
  return authClient.signUp.email({
    email,
    password,
    name,
  });
}

/**
 * Sign out the current user
 *
 * @example
 * ```svelte
 * <button on:click={signOut}>Sign out</button>
 * ```
 */
export async function signOut() {
  return authClient.signOut();
}

/**
 * Get the reactive session store
 *
 * @example
 * ```svelte
 * <script>
 *   import { useSession } from "$lib/auth-client";
 *   const session = useSession();
 * </script>
 *
 * {#if $session.data}
 *   <p>Welcome, {$session.data.user.name}</p>
 * {:else}
 *   <p>Not signed in</p>
 * {/if}
 * ```
 */
export const useSession = authClient.useSession;

// =============================================================================
// Type Exports
// =============================================================================

export type { Session, User } from "better-auth/types";
