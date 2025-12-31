/**
 * Onboarding Store
 * 
 * Manages onboarding state for sandboxes using Svelte 5 runes.
 * Handles the onboarding flow: pending -> started -> gathering -> completed
 */

import * as onboardingApi from "$lib/api/onboarding";
import type { OnboardingSession, OnboardingStatus } from "$lib/api/onboarding";

// =============================================================================
// State
// =============================================================================

// Use $state.raw for Maps to avoid deep reactivity issues
// We use a version counter to manually trigger reactivity when Maps change
let sessions = $state.raw<Map<string, OnboardingSession>>(new Map());
let loadingStates = $state.raw<Map<string, boolean>>(new Map());
let errors = $state.raw<Map<string, string | null>>(new Map());

// Version counter to trigger reactivity when maps are updated
let stateVersion = $state(0);

// Currently active sandbox being onboarded
let activeSandboxId = $state<string | null>(null);

// Helper to increment version and trigger reactivity
function triggerUpdate() {
  stateVersion++;
}

// Helper functions to update Maps and trigger reactivity
function setSessions(sandboxId: string, session: OnboardingSession) {
  sessions.set(sandboxId, session);
  triggerUpdate();
}

function setLoading(sandboxId: string, loading: boolean) {
  loadingStates.set(sandboxId, loading);
  triggerUpdate();
}

function setError(sandboxId: string, error: string | null) {
  errors.set(sandboxId, error);
  triggerUpdate();
}

// =============================================================================
// Derived State
// =============================================================================

export const onboarding = {
  /**
   * Get session for a specific sandbox
   */
  getSession(sandboxId: string): OnboardingSession | null {
    // Read stateVersion to subscribe to changes
    void stateVersion;
    return sessions.get(sandboxId) ?? null;
  },

  /**
   * Get status for a specific sandbox
   */
  getStatus(sandboxId: string): OnboardingStatus | null {
    // Read stateVersion to subscribe to changes
    void stateVersion;
    return sessions.get(sandboxId)?.status ?? null;
  },

  /**
   * Check if a sandbox needs onboarding (pending status)
   */
  needsOnboarding(sandboxId: string): boolean {
    // Read stateVersion to subscribe to changes
    void stateVersion;
    const session = sessions.get(sandboxId);
    return session?.status === "pending";
  },

  /**
   * Check if onboarding is in progress
   */
  isInProgress(sandboxId: string): boolean {
    // Read stateVersion to subscribe to changes
    void stateVersion;
    const session = sessions.get(sandboxId);
    if (!session) return false;
    return ["started", "gathering", "generating", "applying"].includes(session.status);
  },

  /**
   * Check if onboarding is complete
   */
  isComplete(sandboxId: string): boolean {
    // Read stateVersion to subscribe to changes
    void stateVersion;
    const session = sessions.get(sandboxId);
    return session?.status === "completed" || session?.status === "skipped";
  },

  /**
   * Check if loading for a sandbox
   */
  isLoading(sandboxId: string): boolean {
    // Read stateVersion to subscribe to changes
    void stateVersion;
    return loadingStates.get(sandboxId) ?? false;
  },

  /**
   * Get error for a sandbox
   */
  getError(sandboxId: string): string | null {
    // Read stateVersion to subscribe to changes
    void stateVersion;
    return errors.get(sandboxId) ?? null;
  },

  /**
   * Get the active sandbox ID being onboarded
   */
  get activeSandboxId(): string | null {
    return activeSandboxId;
  },
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Fetch onboarding session for a sandbox
 */
export async function fetchOnboardingSession(sandboxId: string): Promise<OnboardingSession | null> {
  setLoading(sandboxId, true);
  setError(sandboxId, null);

  try {
    const session = await onboardingApi.getOnboardingSession(sandboxId);
    if (session) {
      setSessions(sandboxId, session);
    }
    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch onboarding session";
    setError(sandboxId, message);
    console.error("[Onboarding] Failed to fetch session:", error);
    return null;
  } finally {
    setLoading(sandboxId, false);
  }
}

/**
 * Start onboarding for a sandbox
 * This changes the status from "pending" to "started"
 */
export async function startOnboarding(sandboxId: string): Promise<boolean> {
  const session = sessions.get(sandboxId);
  if (!session) {
    setError(sandboxId, "No onboarding session found");
    return false;
  }

  setLoading(sandboxId, true);
  setError(sandboxId, null);

  try {
    const updatedSession = await onboardingApi.startOnboarding(session.id);
    setSessions(sandboxId, updatedSession);
    activeSandboxId = sandboxId;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start onboarding";
    setError(sandboxId, message);
    console.error("[Onboarding] Failed to start:", error);
    return false;
  } finally {
    setLoading(sandboxId, false);
  }
}

/**
 * Skip onboarding for a sandbox
 * User can always configure manually later
 */
export async function skipOnboarding(sandboxId: string): Promise<boolean> {
  const session = sessions.get(sandboxId);
  if (!session) {
    setError(sandboxId, "No onboarding session found");
    return false;
  }

  setLoading(sandboxId, true);
  setError(sandboxId, null);

  try {
    const updatedSession = await onboardingApi.skipOnboarding(session.id);
    setSessions(sandboxId, updatedSession);
    
    // Clear active if this was the active sandbox
    if (activeSandboxId === sandboxId) {
      activeSandboxId = null;
    }
    
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to skip onboarding";
    setError(sandboxId, message);
    console.error("[Onboarding] Failed to skip:", error);
    return false;
  } finally {
    setLoading(sandboxId, false);
  }
}

/**
 * Mark onboarding as complete
 * Called when the @onboarding agent finishes its conversation
 */
export async function completeOnboarding(
  sandboxId: string,
  config: onboardingApi.GeneratedConfig
): Promise<boolean> {
  const session = sessions.get(sandboxId);
  if (!session) {
    setError(sandboxId, "No onboarding session found");
    return false;
  }

  setLoading(sandboxId, true);
  setError(sandboxId, null);

  try {
    // Complete the session
    const updatedSession = await onboardingApi.completeOnboarding(session.id, config);
    setSessions(sandboxId, updatedSession);

    // Apply the config to the sandbox
    const result = await onboardingApi.applyOnboardingConfig(session.id, true);
    if (!result.success) {
      throw new Error(result.error || "Failed to apply configuration");
    }

    // Update with final session state
    setSessions(sandboxId, result.session);

    // Clear active sandbox
    if (activeSandboxId === sandboxId) {
      activeSandboxId = null;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete onboarding";
    setError(sandboxId, message);
    console.error("[Onboarding] Failed to complete:", error);
    return false;
  } finally {
    setLoading(sandboxId, false);
  }
}

/**
 * Reset onboarding to start over
 */
export async function resetOnboarding(
  sandboxId: string,
  preserveModels = false
): Promise<boolean> {
  const session = sessions.get(sandboxId);
  if (!session) {
    setError(sandboxId, "No onboarding session found");
    return false;
  }

  setLoading(sandboxId, true);
  setError(sandboxId, null);

  try {
    const updatedSession = await onboardingApi.resetOnboarding(session.id, preserveModels);
    setSessions(sandboxId, updatedSession);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset onboarding";
    setError(sandboxId, message);
    console.error("[Onboarding] Failed to reset:", error);
    return false;
  } finally {
    setLoading(sandboxId, false);
  }
}

/**
 * Update session in store (used when receiving updates from elsewhere)
 */
export function updateSession(sandboxId: string, session: OnboardingSession): void {
  setSessions(sandboxId, session);
}

/**
 * Clear error for a sandbox
 */
export function clearError(sandboxId: string): void {
  setError(sandboxId, null);
}

/**
 * Clear all onboarding state (for logout/disconnect)
 */
export function clearAll(): void {
  sessions = new Map();
  loadingStates = new Map();
  errors = new Map();
  activeSandboxId = null;
}
