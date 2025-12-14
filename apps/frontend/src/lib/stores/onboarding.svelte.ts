/**
 * Onboarding Store
 * 
 * Manages onboarding state for sandboxes using Svelte 5 runes.
 * Handles the onboarding flow: pending -> started -> gathering -> completed
 */

import * as onboardingApi from "$lib/api/onboarding";
import type { OnboardingSession, OnboardingStatus } from "$lib/api/onboarding";
import { sandboxOpencodeSendMessage } from "$lib/api/tauri";

// =============================================================================
// State
// =============================================================================

// Map of sandboxId -> OnboardingSession
let sessions = $state<Map<string, OnboardingSession>>(new Map());
let loadingStates = $state<Map<string, boolean>>(new Map());
let errors = $state<Map<string, string | null>>(new Map());

// Currently active sandbox being onboarded
let activeSandboxId = $state<string | null>(null);

// =============================================================================
// Derived State
// =============================================================================

export const onboarding = {
  /**
   * Get session for a specific sandbox
   */
  getSession(sandboxId: string): OnboardingSession | null {
    return sessions.get(sandboxId) ?? null;
  },

  /**
   * Get status for a specific sandbox
   */
  getStatus(sandboxId: string): OnboardingStatus | null {
    return sessions.get(sandboxId)?.status ?? null;
  },

  /**
   * Check if a sandbox needs onboarding (pending status)
   */
  needsOnboarding(sandboxId: string): boolean {
    const session = sessions.get(sandboxId);
    return session?.status === "pending";
  },

  /**
   * Check if onboarding is in progress
   */
  isInProgress(sandboxId: string): boolean {
    const session = sessions.get(sandboxId);
    if (!session) return false;
    return ["started", "gathering", "generating", "applying"].includes(session.status);
  },

  /**
   * Check if onboarding is complete
   */
  isComplete(sandboxId: string): boolean {
    const session = sessions.get(sandboxId);
    return session?.status === "completed" || session?.status === "skipped";
  },

  /**
   * Check if loading for a sandbox
   */
  isLoading(sandboxId: string): boolean {
    return loadingStates.get(sandboxId) ?? false;
  },

  /**
   * Get error for a sandbox
   */
  getError(sandboxId: string): string | null {
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
  loadingStates.set(sandboxId, true);
  errors.set(sandboxId, null);

  try {
    const session = await onboardingApi.getOnboardingSession(sandboxId);
    if (session) {
      sessions.set(sandboxId, session);
    }
    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch onboarding session";
    errors.set(sandboxId, message);
    console.error("[Onboarding] Failed to fetch session:", error);
    return null;
  } finally {
    loadingStates.set(sandboxId, false);
  }
}

/**
 * Start onboarding for a sandbox
 * This changes the status from "pending" to "started"
 */
export async function startOnboarding(sandboxId: string): Promise<boolean> {
  const session = sessions.get(sandboxId);
  if (!session) {
    errors.set(sandboxId, "No onboarding session found");
    return false;
  }

  loadingStates.set(sandboxId, true);
  errors.set(sandboxId, null);

  try {
    const updatedSession = await onboardingApi.startOnboarding(session.id);
    sessions.set(sandboxId, updatedSession);
    activeSandboxId = sandboxId;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start onboarding";
    errors.set(sandboxId, message);
    console.error("[Onboarding] Failed to start:", error);
    return false;
  } finally {
    loadingStates.set(sandboxId, false);
  }
}

/**
 * Skip onboarding for a sandbox
 * User can always configure manually later
 */
export async function skipOnboarding(sandboxId: string): Promise<boolean> {
  const session = sessions.get(sandboxId);
  if (!session) {
    errors.set(sandboxId, "No onboarding session found");
    return false;
  }

  loadingStates.set(sandboxId, true);
  errors.set(sandboxId, null);

  try {
    const updatedSession = await onboardingApi.skipOnboarding(session.id);
    sessions.set(sandboxId, updatedSession);
    
    // Clear active if this was the active sandbox
    if (activeSandboxId === sandboxId) {
      activeSandboxId = null;
    }
    
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to skip onboarding";
    errors.set(sandboxId, message);
    console.error("[Onboarding] Failed to skip:", error);
    return false;
  } finally {
    loadingStates.set(sandboxId, false);
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
    errors.set(sandboxId, "No onboarding session found");
    return false;
  }

  loadingStates.set(sandboxId, true);
  errors.set(sandboxId, null);

  try {
    // Complete the session
    const updatedSession = await onboardingApi.completeOnboarding(session.id, config);
    sessions.set(sandboxId, updatedSession);

    // Apply the config to the sandbox
    const result = await onboardingApi.applyOnboardingConfig(session.id, true);
    if (!result.success) {
      throw new Error(result.error || "Failed to apply configuration");
    }

    // Update with final session state
    sessions.set(sandboxId, result.session);

    // Clear active sandbox
    if (activeSandboxId === sandboxId) {
      activeSandboxId = null;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete onboarding";
    errors.set(sandboxId, message);
    console.error("[Onboarding] Failed to complete:", error);
    return false;
  } finally {
    loadingStates.set(sandboxId, false);
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
    errors.set(sandboxId, "No onboarding session found");
    return false;
  }

  loadingStates.set(sandboxId, true);
  errors.set(sandboxId, null);

  try {
    const updatedSession = await onboardingApi.resetOnboarding(session.id, preserveModels);
    sessions.set(sandboxId, updatedSession);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset onboarding";
    errors.set(sandboxId, message);
    console.error("[Onboarding] Failed to reset:", error);
    return false;
  } finally {
    loadingStates.set(sandboxId, false);
  }
}

/**
 * Update session in store (used when receiving updates from elsewhere)
 */
export function updateSession(sandboxId: string, session: OnboardingSession): void {
  sessions.set(sandboxId, session);
}

/**
 * Clear error for a sandbox
 */
export function clearError(sandboxId: string): void {
  errors.set(sandboxId, null);
}

/**
 * Clear all onboarding state (for logout/disconnect)
 */
export function clearAll(): void {
  sessions.clear();
  loadingStates.clear();
  errors.clear();
  activeSandboxId = null;
}

/**
 * Send a message to trigger the onboarding agent
 * This auto-starts the onboarding conversation without requiring the user to type @onboarding
 * 
 * @param sandboxId - The sandbox ID
 * @param sessionId - The OpenCode session ID to send the message to
 * @returns true if the message was sent successfully
 */
export async function sendOnboardingMessage(
  sandboxId: string,
  sessionId: string
): Promise<boolean> {
  try {
    await sandboxOpencodeSendMessage(
      sandboxId,
      sessionId,
      "Start the workspace setup and help me configure this project.",
      undefined, // use default model
      "onboarding" // specify the onboarding agent
    );
    return true;
  } catch (error) {
    console.error("[Onboarding] Failed to send onboarding message:", error);
    const message = error instanceof Error ? error.message : "Failed to start onboarding agent";
    errors.set(sandboxId, message);
    return false;
  }
}
