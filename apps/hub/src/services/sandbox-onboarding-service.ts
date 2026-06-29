/**
 * Sandbox Onboarding Service
 * 
 * Integrates the onboarding agent with sandbox management.
 * Responsible for:
 * - Applying generated configurations to running sandboxes
 * - Writing config files (opencode.json, AGENTS.md, agent files)
 * - Managing onboarding session lifecycle with sandboxes
 * - Signaling OpenCode to reload configuration
 */

import { createLogger } from "../utils/logger.ts";
import type { SandboxManager, Sandbox } from "./sandbox-manager.ts";
import type { OnboardingAgentService } from "./onboarding-agent-service.ts";
import type { OnboardingService } from "./onboarding-service.ts";
import type {
  ConfigGenerationInput,
  OnboardingInjectedFiles,
  OnboardingSession,
  UpdateOnboardingSession,
  OnboardingRequirements,
  OnboardingModelRecommendation,
} from "@agentpod/types";

const log = createLogger("sandbox-onboarding-service");

// =============================================================================
// Types
// =============================================================================

export interface ApplyConfigResult {
  success: boolean;
  filesWritten: string[];
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AppliedConfig {
  opencodeJson: unknown | null;
  agentsMd: string | null;
}

// =============================================================================
// Service Implementation
// =============================================================================

export class SandboxOnboardingService {
  private sandboxManager: SandboxManager;
  private onboardingAgentService: OnboardingAgentService;
  private onboardingService: OnboardingService;

  constructor(
    sandboxManager: SandboxManager,
    onboardingAgentService: OnboardingAgentService,
    onboardingService: OnboardingService
  ) {
    this.sandboxManager = sandboxManager;
    this.onboardingAgentService = onboardingAgentService;
    this.onboardingService = onboardingService;
  }

  // ===========================================================================
  // Apply Configuration to Sandbox
  // ===========================================================================

  /**
   * Apply generated configuration files to a running sandbox.
   * 
   * Writes:
   * - /workspace/opencode.json
   * - /workspace/AGENTS.md
   * - /workspace/.opencode/agent/*.md (agent files)
   */
  async applyConfigToSandbox(
    sandboxId: string,
    input: ConfigGenerationInput
  ): Promise<ApplyConfigResult> {
    log.info("Applying config to sandbox", { sandboxId });

    // Validate sandbox exists and is running
    const sandbox = await this.sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error("Sandbox not found");
    }

    if (sandbox.status !== "running") {
      throw new Error("Sandbox is not running");
    }

    // Generate the files to inject
    let injectedFiles: OnboardingInjectedFiles;
    try {
      injectedFiles = await this.onboardingAgentService.generateInjectedFiles(input);
    } catch (error) {
      log.error("Failed to generate injected files", { error });
      return {
        success: false,
        filesWritten: [],
        error: `Failed to generate config: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    const filesWritten: string[] = [];
    const errors: string[] = [];

    // Create agent directory
    try {
      await this.sandboxManager.exec(
        sandboxId,
        ["mkdir", "-p", "/workspace/.opencode/agent"],
        { workingDir: "/workspace" }
      );
    } catch (error) {
      log.warn("Failed to create agent directory", { error });
      // Continue - directory might already exist
    }

    // Write opencode.json
    try {
      const result = await this.writeFileToSandbox(
        sandboxId,
        "/workspace/opencode.json",
        injectedFiles.opencodeJson
      );
      if (result.success) {
        filesWritten.push("/workspace/opencode.json");
      } else {
        errors.push(`opencode.json: ${result.error}`);
      }
    } catch (error) {
      errors.push(`opencode.json: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Write AGENTS.md
    try {
      const result = await this.writeFileToSandbox(
        sandboxId,
        "/workspace/AGENTS.md",
        injectedFiles.agentsMd
      );
      if (result.success) {
        filesWritten.push("/workspace/AGENTS.md");
      } else {
        errors.push(`AGENTS.md: ${result.error}`);
      }
    } catch (error) {
      errors.push(`AGENTS.md: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Write agent files
    for (const agent of injectedFiles.agents) {
      const fullPath = `/workspace/${agent.path}`;
      try {
        const result = await this.writeFileToSandbox(sandboxId, fullPath, agent.content);
        if (result.success) {
          filesWritten.push(fullPath);
        } else {
          errors.push(`${agent.path}: ${result.error}`);
        }
      } catch (error) {
        errors.push(`${agent.path}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    if (errors.length > 0) {
      log.warn("Some files failed to write", { errors });
      return {
        success: false,
        filesWritten,
        error: errors.join("; "),
      };
    }

    log.info("Config applied successfully", { sandboxId, filesWritten });
    return {
      success: true,
      filesWritten,
    };
  }

  // ===========================================================================
  // Apply Onboarding Session
  // ===========================================================================

  /**
   * Apply configuration from an onboarding session to its associated sandbox.
   * 
   * This is the main entry point for completing the onboarding flow.
   * Updates session status throughout the process.
   */
  async applyOnboardingSession(sessionId: string): Promise<ApplyConfigResult> {
    log.info("Applying onboarding session", { sessionId });

    // Get the session
    const session = await this.onboardingService.getById(sessionId);
    if (!session) {
      throw new Error("Onboarding session not found");
    }

    if (!session.sandboxId) {
      throw new Error("Session has no associated sandbox");
    }

    // Update status to applying
    await this.onboardingService.update(sessionId, { status: "applying" });

    try {
      // Build config generation input from session
      const input = this.buildConfigInputFromSession(session);

      // Apply the config
      const result = await this.applyConfigToSandbox(session.sandboxId, input);

      if (result.success) {
        // Update status to completed
        await this.onboardingService.update(sessionId, { status: "completed" });
        log.info("Onboarding session completed", { sessionId });
      } else {
        // Update status to failed
        await this.onboardingService.update(sessionId, {
          status: "failed",
          errorMessage: result.error,
        });
        log.error("Onboarding session failed", { sessionId, error: result.error });
      }

      return result;
    } catch (error) {
      // Update status to failed
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.onboardingService.update(sessionId, {
        status: "failed",
        errorMessage,
      });
      log.error("Onboarding session failed", { sessionId, error });

      return {
        success: false,
        filesWritten: [],
        error: errorMessage,
      };
    }
  }

  // ===========================================================================
  // Signal OpenCode Reload
  // ===========================================================================

  /**
   * Signal OpenCode to reload its configuration.
   * 
   * Sends SIGHUP to the OpenCode process, which triggers a config reload.
   * This is useful after applying new configuration files.
   */
  async signalOpenCodeReload(sandboxId: string): Promise<void> {
    log.debug("Signaling OpenCode reload", { sandboxId });

    try {
      await this.sandboxManager.exec(
        sandboxId,
        ["pkill", "-HUP", "opencode"],
        { workingDir: "/workspace" }
      );
      log.debug("OpenCode reload signal sent", { sandboxId });
    } catch (error) {
      // Don't throw - OpenCode might not be running
      log.debug("Failed to signal OpenCode reload (may not be running)", { sandboxId, error });
    }
  }

  // ===========================================================================
  // Get Applied Config
  // ===========================================================================

  /**
   * Read the currently applied configuration from a sandbox.
   * 
   * Returns null if the files don't exist or can't be read.
   */
  async getAppliedConfig(sandboxId: string): Promise<AppliedConfig | null> {
    const sandbox = await this.sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      return null;
    }

    let opencodeJson: unknown | null = null;
    let agentsMd: string | null = null;

    // Read opencode.json
    try {
      const result = await this.sandboxManager.exec(
        sandboxId,
        ["cat", "/workspace/opencode.json"],
        { workingDir: "/workspace" }
      );
      if (result.exitCode === 0) {
        opencodeJson = JSON.parse(result.stdout);
      }
    } catch (error) {
      log.debug("Failed to read opencode.json", { sandboxId, error });
    }

    // Read AGENTS.md
    try {
      const result = await this.sandboxManager.exec(
        sandboxId,
        ["cat", "/workspace/AGENTS.md"],
        { workingDir: "/workspace" }
      );
      if (result.exitCode === 0) {
        agentsMd = result.stdout;
      }
    } catch (error) {
      log.debug("Failed to read AGENTS.md", { sandboxId, error });
    }

    // Return null if neither file exists
    if (opencodeJson === null && agentsMd === null) {
      return null;
    }

    return { opencodeJson, agentsMd };
  }

  // ===========================================================================
  // Validate Sandbox for Onboarding
  // ===========================================================================

  /**
   * Validate that a sandbox is ready for onboarding config application.
   */
  async validateSandboxForOnboarding(sandboxId: string): Promise<ValidationResult> {
    const errors: string[] = [];

    const sandbox = await this.sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      return { valid: false, errors: ["Sandbox not found"] };
    }

    if (sandbox.status !== "running") {
      errors.push("Sandbox is not running");
    }

    if (!sandbox.containerId) {
      errors.push("Sandbox has no container");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ===========================================================================
  // Link Session to Sandbox
  // ===========================================================================

  /**
   * Link an onboarding session to a sandbox.
   * 
   * Validates that both exist and belong to the same user.
   */
  async linkSessionToSandbox(sessionId: string, sandboxId: string): Promise<void> {
    log.info("Linking session to sandbox", { sessionId, sandboxId });

    // Get sandbox
    const sandbox = await this.sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error("Sandbox not found");
    }

    // Get session
    const session = await this.onboardingService.getById(sessionId);
    if (!session) {
      throw new Error("Onboarding session not found");
    }

    // Validate user ownership
    if (sandbox.userId !== session.userId) {
      throw new Error("Sandbox does not belong to session user");
    }

    // Update session with sandbox ID
    await this.onboardingService.update(sessionId, { sandboxId } as UpdateOnboardingSession);
    log.info("Session linked to sandbox", { sessionId, sandboxId });
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Write a file to the sandbox using exec with heredoc.
   */
  private async writeFileToSandbox(
    sandboxId: string,
    path: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    // Use cat with heredoc to write the file
    // This handles multi-line content and special characters
    const escapedContent = content.replace(/'/g, "'\\''");
    const command = `cat > ${path} << 'EOFAGENTPOD'\n${escapedContent}\nEOFAGENTPOD`;

    const result = await this.sandboxManager.exec(
      sandboxId,
      ["sh", "-c", command],
      { workingDir: "/workspace" }
    );

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: `Exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
      };
    }

    return { success: true };
  }

  /**
   * Build ConfigGenerationInput from an OnboardingSession.
   */
  private buildConfigInputFromSession(session: OnboardingSession): ConfigGenerationInput {
    // Build requirements from session
    const requirements: OnboardingRequirements = session.gatheredRequirements ?? {
      projectType: session.projectType ?? "web_app",
      projectName: session.projectName ?? "My Project",
      projectDescription: session.projectDescription ?? undefined,
    };

    // Build model recommendation from session
    const recommendation: OnboardingModelRecommendation = {
      primaryModelId: session.selectedModel ?? "anthropic/claude-sonnet-4-20250514",
      primaryModelName: session.selectedModel?.split("/")[1] ?? "claude-sonnet-4-20250514",
      primaryProvider: session.selectedModel?.split("/")[0] ?? "anthropic",
      smallModelId: session.selectedSmallModel ?? undefined,
      smallModelName: session.selectedSmallModel?.split("/")[1],
      smallProvider: session.selectedSmallModel?.split("/")[0],
      reasoning: "Selected during onboarding",
      alternativeModelIds: [],
    };

    return {
      requirements,
      recommendation,
      userId: session.userId,
      sandboxId: session.sandboxId ?? undefined,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let sandboxOnboardingServiceInstance: SandboxOnboardingService | null = null;

/**
 * Get or create the sandbox onboarding service singleton.
 * 
 * Note: This requires the sandbox manager, onboarding agent service,
 * and onboarding service to be initialized.
 */
export function getSandboxOnboardingService(
  sandboxManager: SandboxManager,
  onboardingAgentService: OnboardingAgentService,
  onboardingService: OnboardingService
): SandboxOnboardingService {
  if (!sandboxOnboardingServiceInstance) {
    sandboxOnboardingServiceInstance = new SandboxOnboardingService(
      sandboxManager,
      onboardingAgentService,
      onboardingService
    );
  }
  return sandboxOnboardingServiceInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetSandboxOnboardingService(): void {
  sandboxOnboardingServiceInstance = null;
}
