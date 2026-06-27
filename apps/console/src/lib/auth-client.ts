/**
 * Better Auth Client
 *
 * This module re-exports auth functionality from the auth store.
 * The auth client is created dynamically based on the connected API URL.
 * 
 * @deprecated Import from "$lib/stores/auth.svelte" instead
 */

export { 
  setAuthApiUrl, 
  getAuthApiUrl,
  login as signInWithGitHub,
  loginWithEmail as signInWithEmail,
  signUp as signUpWithEmail,
  logout as signOut,
  auth,
} from "./stores/auth.svelte";

// Type exports
export type { Session, User } from "better-auth/types";
