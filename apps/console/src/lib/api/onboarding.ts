/**
 * Onboarding API
 * 
 * Tauri invoke wrappers for the Management API's onboarding endpoints.
 * This module provides typed wrappers around Tauri commands.
 */

import { invoke } from "./tauri";

// =============================================================================
// Types
// =============================================================================

export type OnboardingStatus =
  | "pending"
  | "started"
  | "gathering"
  | "generating"
  | "applying"
  | "completed"
  | "skipped"
  | "failed";

export interface OnboardingRequirements {
  projectType: string;
  projectName: string;
  projectDescription?: string;
  primaryLanguage?: string;
  frameworks?: string[];
  buildTools?: string[];
  testingFramework?: string;
  linter?: string;
  formatter?: string;
  preferredModel?: string;
  preferredSmallModel?: string;
  codingStyle?: string;
  customInstructions?: string;
  additionalContext?: Record<string, unknown>;
}

export interface GeneratedConfig {
  settings: Record<string, unknown>;
  agentsMd?: string;
  agents?: Array<{
    name: string;
    description: string;
    content: string;
  }>;
  commands?: Array<{
    name: string;
    description: string;
    content: string;
  }>;
  mcpServers?: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

export interface OnboardingSession {
  id: string;
  userId: string;
  sandboxId: string | null;
  status: OnboardingStatus;
  projectType: string | null;
  projectName: string | null;
  projectDescription: string | null;
  gatheredRequirements: OnboardingRequirements | null;
  generatedConfig: GeneratedConfig | null;
  selectedModel: string | null;
  selectedSmallModel: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ApplyConfigResult {
  success: boolean;
  filesWritten: string[];
  session: OnboardingSession;
  error?: string;
}

// =============================================================================
// Onboarding API Functions (via Tauri invoke)
// =============================================================================

/**
 * Get onboarding session for a sandbox
 */
export async function getOnboardingSession(sandboxId: string): Promise<OnboardingSession | null> {
  return invoke<OnboardingSession | null>("get_onboarding_session", { sandboxId });
}

/**
 * Get onboarding session by ID
 */
export async function getOnboardingSessionById(sessionId: string): Promise<OnboardingSession> {
  return invoke<OnboardingSession>("get_onboarding_session_by_id", { sessionId });
}

/**
 * Create a new onboarding session for a sandbox
 */
export async function createOnboardingSession(sandboxId: string): Promise<OnboardingSession> {
  return invoke<OnboardingSession>("create_onboarding_session", { sandboxId });
}

/**
 * Start an onboarding session (changes status from pending to started)
 */
export async function startOnboarding(sessionId: string): Promise<OnboardingSession> {
  return invoke<OnboardingSession>("start_onboarding", { sessionId });
}

/**
 * Skip onboarding for a session
 */
export async function skipOnboarding(sessionId: string): Promise<OnboardingSession> {
  return invoke<OnboardingSession>("skip_onboarding", { sessionId });
}

/**
 * Complete onboarding with generated config
 */
export async function completeOnboarding(
  sessionId: string,
  config: GeneratedConfig
): Promise<OnboardingSession> {
  return invoke<OnboardingSession>("complete_onboarding", { sessionId, config });
}

/**
 * Apply onboarding configuration to the sandbox
 */
export async function applyOnboardingConfig(
  sessionId: string,
  reload = true
): Promise<ApplyConfigResult> {
  return invoke<ApplyConfigResult>("apply_onboarding_config", { sessionId, reload });
}

/**
 * Reset onboarding session to start over
 */
export async function resetOnboarding(
  sessionId: string,
  preserveModels = false
): Promise<OnboardingSession> {
  return invoke<OnboardingSession>("reset_onboarding", { sessionId, preserveModels });
}
