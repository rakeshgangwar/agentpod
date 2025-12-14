/**
 * Onboarding Routes
 *
 * Manage onboarding sessions for sandboxes.
 * Provides session creation, status management, and model selection.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { onboardingService } from "../services/onboarding-service";
import { modelSelectionService } from "../services/model-selection-service";
import { onboardingAgentService } from "../services/onboarding-agent-service";
import { SandboxOnboardingService } from "../services/sandbox-onboarding-service";
import { getSandboxManager } from "../services/sandbox-manager";
import { db } from "../db/drizzle";
import { sandboxes } from "../db/schema/sandboxes";
import { eq } from "drizzle-orm";
import { createLogger } from "../utils/logger";
import { config } from "../config";

const log = createLogger("onboarding-routes");

// =============================================================================
// Validation Schemas
// =============================================================================

const createSessionSchema = z.object({
  sandboxId: z.string().optional(),
});

const requirementsSchema = z.object({
  projectType: z.string(),
  projectName: z.string(),
  projectDescription: z.string().optional(),
  primaryLanguage: z.string().optional(),
  frameworks: z.array(z.string()).optional(),
  testingFramework: z.string().optional(),
});

const modelsSchema = z.object({
  primaryModel: z.string(),
  smallModel: z.string().optional(),
});

const openCodeSettingsSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  smallModel: z.string().optional(),
  autoapprove: z.array(z.string()).optional(),
  customInstructions: z.string().optional(),
}).passthrough(); // Allow additional unknown properties

const agentDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
});

const commandDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
});

const mcpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const completeSchema = z.object({
  config: z.object({
    settings: openCodeSettingsSchema,
    agentsMd: z.string().optional(),
    agents: z.array(agentDefinitionSchema).optional(),
    commands: z.array(commandDefinitionSchema).optional(),
    mcpServers: z.array(mcpServerConfigSchema).optional(),
  }),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get user ID from context
 */
function getUserId(c: { get: (key: string) => unknown }): string {
  const user = c.get("user") as { id: string } | undefined;
  return user?.id || config.defaultUserId;
}

/**
 * Check if sandbox exists
 */
async function sandboxExists(sandboxId: string): Promise<boolean> {
  const result = await db
    .select({ id: sandboxes.id })
    .from(sandboxes)
    .where(eq(sandboxes.id, sandboxId))
    .limit(1);
  return result.length > 0;
}

// =============================================================================
// Routes
// =============================================================================

export const onboardingRoutes = new Hono()
  /**
   * GET /api/onboarding
   * List onboarding sessions for the current user
   * Query params:
   * - status: filter by status
   */
  .get("/", async (c) => {
    try {
      const userId = getUserId(c);
      const statusFilter = c.req.query("status");

      let sessions = await onboardingService.getByUserId(userId);

      // Filter by status if provided
      if (statusFilter) {
        sessions = sessions.filter((s) => s.status === statusFilter);
      }

      return c.json({ sessions });
    } catch (error) {
      log.error("Failed to list onboarding sessions", { error });
      return c.json({ error: "Failed to list onboarding sessions" }, 500);
    }
  })

  /**
   * GET /api/onboarding/stats
   * Get user's onboarding statistics
   */
  .get("/stats", async (c) => {
    try {
      const userId = getUserId(c);
      const stats = await onboardingService.getUserStats(userId);

      return c.json({ stats });
    } catch (error) {
      log.error("Failed to get onboarding stats", { error });
      return c.json({ error: "Failed to get onboarding stats" }, 500);
    }
  })

  /**
   * GET /api/onboarding/models/recommend
   * Get model recommendations
   * Query params:
   * - preferLowCost: boolean
   * - preferFast: boolean
   * - requireLargeContext: boolean
   */
  .get("/models/recommend", async (c) => {
    try {
      const preferLowCost = c.req.query("preferLowCost") === "true";
      const preferFast = c.req.query("preferFast") === "true";
      const requireLargeContext = c.req.query("requireLargeContext") === "true";

      const recommendation = await modelSelectionService.getRecommendation({
        preferLowCost,
        preferFast,
        requireLargeContext,
        configuredProvidersOnly: true,
      });

      return c.json({ recommendation });
    } catch (error) {
      log.error("Failed to get model recommendations", { error });
      return c.json({ error: "Failed to get model recommendations" }, 500);
    }
  })

  /**
   * GET /api/onboarding/providers/setup/:id
   * Get setup guide for a provider
   */
  .get("/providers/setup/:id", async (c) => {
    try {
      const providerId = c.req.param("id");
      const guide = modelSelectionService.getProviderSetupGuide(providerId);

      return c.json({ guide });
    } catch (error) {
      log.error("Failed to get provider setup guide", { error });
      return c.json({ error: "Failed to get provider setup guide" }, 500);
    }
  })

  /**
   * GET /api/onboarding/sandbox/:sandboxId
   * Get onboarding session for a specific sandbox
   */
  .get("/sandbox/:sandboxId", async (c) => {
    try {
      const sandboxId = c.req.param("sandboxId");
      const session = await onboardingService.getBySandboxId(sandboxId);

      if (!session) {
        return c.json({ error: "Onboarding session not found for this sandbox" }, 404);
      }

      return c.json({ session });
    } catch (error) {
      log.error("Failed to get onboarding session by sandbox", { error });
      return c.json({ error: "Failed to get onboarding session" }, 500);
    }
  })

  /**
   * GET /api/onboarding/:id
   * Get a specific onboarding session
   */
  .get("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const session = await onboardingService.getById(id);

      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      return c.json({ session });
    } catch (error) {
      log.error("Failed to get onboarding session", { error });
      return c.json({ error: "Failed to get onboarding session" }, 500);
    }
  })

  /**
   * POST /api/onboarding
   * Create a new onboarding session
   */
  .post("/", zValidator("json", createSessionSchema), async (c) => {
    try {
      const userId = getUserId(c);
      const { sandboxId } = c.req.valid("json");

      // If sandboxId provided, validate it exists
      if (sandboxId) {
        const exists = await sandboxExists(sandboxId);
        if (!exists) {
          return c.json({ error: `Sandbox not found: ${sandboxId}` }, 404);
        }

        // Check if sandbox already has a session
        const existing = await onboardingService.getBySandboxId(sandboxId);
        if (existing) {
          return c.json({ session: existing }, 200); // Return existing session
        }
      }

      const session = await onboardingService.create({
        userId,
        sandboxId,
      });

      return c.json({ session }, 201);
    } catch (error) {
      log.error("Failed to create onboarding session", { error });
      return c.json({ error: "Failed to create onboarding session" }, 500);
    }
  })

  /**
   * POST /api/onboarding/:id/start
   * Start an onboarding session
   */
  .post("/:id/start", async (c) => {
    try {
      const id = c.req.param("id");
      const session = await onboardingService.start(id);

      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      return c.json({ session });
    } catch (error) {
      log.error("Failed to start onboarding session", { error });
      return c.json({ error: "Failed to start onboarding session" }, 500);
    }
  })

  /**
   * POST /api/onboarding/:id/requirements
   * Save gathered requirements
   */
  .post("/:id/requirements", zValidator("json", requirementsSchema), async (c) => {
    try {
      const id = c.req.param("id");
      const requirements = c.req.valid("json");

      // Check session exists
      const existing = await onboardingService.getById(id);
      if (!existing) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      const session = await onboardingService.saveRequirements(id, requirements);

      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      return c.json({ session });
    } catch (error) {
      log.error("Failed to save requirements", { error });
      return c.json({ error: "Failed to save requirements" }, 500);
    }
  })

  /**
   * POST /api/onboarding/:id/models
   * Save selected models
   */
  .post("/:id/models", zValidator("json", modelsSchema), async (c) => {
    try {
      const id = c.req.param("id");
      const { primaryModel, smallModel } = c.req.valid("json");

      const session = await onboardingService.saveModels(id, primaryModel, smallModel);

      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      return c.json({ session });
    } catch (error) {
      log.error("Failed to save selected models", { error });
      return c.json({ error: "Failed to save selected models" }, 500);
    }
  })

  /**
   * POST /api/onboarding/:id/complete
   * Complete onboarding with generated config
   */
  .post("/:id/complete", zValidator("json", completeSchema), async (c) => {
    try {
      const id = c.req.param("id");
      const { config: generatedConfig } = c.req.valid("json");

      const session = await onboardingService.complete(id, generatedConfig);

      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      return c.json({ session });
    } catch (error) {
      log.error("Failed to complete onboarding", { error });
      return c.json({ error: "Failed to complete onboarding" }, 500);
    }
  })

  /**
   * POST /api/onboarding/:id/skip
   * Skip onboarding
   */
  .post("/:id/skip", async (c) => {
    try {
      const id = c.req.param("id");
      const session = await onboardingService.skip(id);

      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      return c.json({ session });
    } catch (error) {
      log.error("Failed to skip onboarding", { error });
      return c.json({ error: "Failed to skip onboarding" }, 500);
    }
  })

  /**
   * POST /api/onboarding/:id/reset
   * Reset onboarding session
   */
  .post("/:id/reset", async (c) => {
    try {
      const id = c.req.param("id");

      // Try to parse body, default to empty options
      let options = { preserveModels: false };
      try {
        const body = await c.req.json();
        if (body && typeof body.preserveModels === "boolean") {
          options.preserveModels = body.preserveModels;
        }
      } catch {
        // No body or invalid JSON - use defaults
      }

      const session = await onboardingService.reset(id, options);

      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      return c.json({ session });
    } catch (error) {
      log.error("Failed to reset onboarding", { error });
      return c.json({ error: "Failed to reset onboarding" }, 500);
    }
  })

  /**
   * POST /api/onboarding/:id/apply
   * Apply onboarding configuration to the linked sandbox.
   * Writes opencode.json, AGENTS.md, and agent files to the sandbox.
   * Query params:
   * - reload: boolean - Whether to signal OpenCode to reload config (default: true)
   */
  .post("/:id/apply", async (c) => {
    try {
      const id = c.req.param("id");
      const reloadParam = c.req.query("reload");
      const shouldReload = reloadParam !== "false"; // Default to true

      // Get sandbox onboarding service (initialized lazily)
      const sandboxManager = getSandboxManager();
      const sandboxOnboardingService = new SandboxOnboardingService(
        sandboxManager,
        onboardingAgentService,
        onboardingService
      );

      // Apply the config
      const result = await sandboxOnboardingService.applyOnboardingSession(id);

      if (!result.success) {
        return c.json({ 
          error: result.error || "Failed to apply configuration",
          filesWritten: result.filesWritten 
        }, 500);
      }

      // Optionally signal OpenCode to reload
      const session = await onboardingService.getById(id);
      if (shouldReload && session?.sandboxId) {
        try {
          await sandboxOnboardingService.signalOpenCodeReload(session.sandboxId);
        } catch (reloadError) {
          log.debug("Failed to signal OpenCode reload (may not be running)", { reloadError });
        }
      }

      return c.json({ 
        success: true,
        filesWritten: result.filesWritten,
        session: await onboardingService.getById(id)
      });
    } catch (error) {
      log.error("Failed to apply onboarding config", { error });
      const message = error instanceof Error ? error.message : "Failed to apply configuration";
      return c.json({ error: message }, 500);
    }
  })

  /**
   * POST /api/onboarding/:id/link
   * Link an onboarding session to a sandbox.
   * This allows a session created without a sandbox to be linked later.
   */
  .post("/:id/link", zValidator("json", z.object({ sandboxId: z.string() })), async (c) => {
    try {
      const id = c.req.param("id");
      const { sandboxId } = c.req.valid("json");
      const userId = getUserId(c);

      // Validate sandbox exists
      const exists = await sandboxExists(sandboxId);
      if (!exists) {
        return c.json({ error: `Sandbox not found: ${sandboxId}` }, 404);
      }

      // Get sandbox onboarding service
      const sandboxManager = getSandboxManager();
      const sandboxOnboardingService = new SandboxOnboardingService(
        sandboxManager,
        onboardingAgentService,
        onboardingService
      );

      // Link the session to the sandbox
      await sandboxOnboardingService.linkSessionToSandbox(id, sandboxId);

      // Return updated session
      const session = await onboardingService.getById(id);
      return c.json({ session });
    } catch (error) {
      log.error("Failed to link session to sandbox", { error });
      const message = error instanceof Error ? error.message : "Failed to link session to sandbox";
      return c.json({ error: message }, 500);
    }
  })

  /**
   * GET /api/onboarding/:id/config
   * Get the currently applied configuration from the sandbox.
   * Returns null if no config has been applied.
   */
  .get("/:id/config", async (c) => {
    try {
      const id = c.req.param("id");
      
      // Get session
      const session = await onboardingService.getById(id);
      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      if (!session.sandboxId) {
        return c.json({ error: "Session has no associated sandbox" }, 400);
      }

      // Get sandbox onboarding service
      const sandboxManager = getSandboxManager();
      const sandboxOnboardingService = new SandboxOnboardingService(
        sandboxManager,
        onboardingAgentService,
        onboardingService
      );

      // Get applied config
      const appliedConfig = await sandboxOnboardingService.getAppliedConfig(session.sandboxId);

      return c.json({ 
        config: appliedConfig,
        session 
      });
    } catch (error) {
      log.error("Failed to get applied config", { error });
      return c.json({ error: "Failed to get applied configuration" }, 500);
    }
  })

  /**
   * GET /api/onboarding/:id/validate-sandbox
   * Validate that the linked sandbox is ready for onboarding config application.
   */
  .get("/:id/validate-sandbox", async (c) => {
    try {
      const id = c.req.param("id");
      
      // Get session
      const session = await onboardingService.getById(id);
      if (!session) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      if (!session.sandboxId) {
        return c.json({ 
          valid: false, 
          errors: ["Session has no associated sandbox"] 
        });
      }

      // Get sandbox onboarding service
      const sandboxManager = getSandboxManager();
      const sandboxOnboardingService = new SandboxOnboardingService(
        sandboxManager,
        onboardingAgentService,
        onboardingService
      );

      // Validate sandbox
      const validation = await sandboxOnboardingService.validateSandboxForOnboarding(session.sandboxId);

      return c.json(validation);
    } catch (error) {
      log.error("Failed to validate sandbox", { error });
      return c.json({ error: "Failed to validate sandbox" }, 500);
    }
  })

  /**
   * DELETE /api/onboarding/:id
   * Delete an onboarding session
   */
  .delete("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const deleted = await onboardingService.delete(id);

      if (!deleted) {
        return c.json({ error: `Onboarding session not found: ${id}` }, 404);
      }

      return c.json({ success: true });
    } catch (error) {
      log.error("Failed to delete onboarding session", { error });
      return c.json({ error: "Failed to delete onboarding session" }, 500);
    }
  });
