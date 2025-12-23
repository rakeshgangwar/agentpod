/**
 * Sandbox Routes (v2)
 *
 * New API routes for sandbox management using the direct Docker orchestrator.
 * These routes replace the legacy project routes that used Coolify.
 *
 * Endpoints:
 * - GET    /api/v2/sandboxes           List all sandboxes
 * - POST   /api/v2/sandboxes           Create a new sandbox
 * - GET    /api/v2/sandboxes/:id       Get sandbox by ID
 * - DELETE /api/v2/sandboxes/:id       Delete a sandbox
 * - POST   /api/v2/sandboxes/:id/start Start a sandbox
 * - POST   /api/v2/sandboxes/:id/stop  Stop a sandbox
 * - POST   /api/v2/sandboxes/:id/restart Restart a sandbox
 * - GET    /api/v2/sandboxes/:id/logs  Get sandbox logs
 * - GET    /api/v2/sandboxes/:id/stats Get sandbox resource stats
 * - POST   /api/v2/sandboxes/:id/exec  Execute command in sandbox
 */

import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getSandboxManager } from "../services/sandbox-manager.ts";
import { opencodeV2, OpenCodeV2Error, cachePermission, uncachePermission } from "../services/opencode-v2.ts";
import type { Permission } from "../services/opencode-v2.ts";
import { createLogger } from "../utils/logger.ts";
import { getFlavorById, getDefaultFlavor } from "../models/container-flavor.ts";
import { getResourceTierById, getDefaultResourceTier } from "../models/resource-tier.ts";
import { 
  checkAllLimitsForSandboxCreation, 
  checkAllLimitsForSandboxStart,
} from "../models/user-resource-limits.ts";
import { getSandboxById, createSandbox as createSandboxRecord, updateSandbox, generateUniqueSlug, touchSandbox } from "../models/sandbox.ts";
import { isCloudflareConfigured, getCloudflareProvider } from "../services/providers/index.ts";
import { nanoid } from "nanoid";

const log = createLogger("sandbox-routes");

/**
 * Helper to handle OpenCodeV2Error responses with proper status codes
 */
function handleOpenCodeError(c: Context, error: unknown, fallbackMessage: string) {
  if (error instanceof OpenCodeV2Error) {
    const status = error.statusCode as 400 | 404 | 500 | 503;
    return c.json({ error: error.message }, status);
  }
  log.error(fallbackMessage, { error });
  return c.json(
    { error: fallbackMessage, details: error instanceof Error ? error.message : "Unknown error" },
    500
  );
}

// =============================================================================
// Validation Schemas
// =============================================================================

const createSandboxSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  githubUrl: z.string().url().optional(),
  userId: z.string().min(1),
  provider: z.enum(["docker", "cloudflare"]).optional().default("docker"),
  flavor: z.string().optional(),
  resourceTier: z.string().optional(),
  addons: z.array(z.string()).optional(),
  autoStart: z.boolean().optional(),
  agentSlugs: z.array(z.string()).optional(),
});

const listSandboxesSchema = z.object({
  userId: z.string().optional(),
  status: z.string().optional(),
});

const execCommandSchema = z.object({
  command: z.array(z.string()).min(1),
  workingDir: z.string().optional(),
  env: z.record(z.string()).optional(),
  user: z.string().optional(),
});

const logsQuerySchema = z.object({
  tail: z.coerce.number().min(1).max(10000).optional(),
  since: z.coerce.number().optional(),
  timestamps: z.coerce.boolean().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export const sandboxRoutes = new Hono()
  // ===========================================================================
  // List Sandboxes
  // ===========================================================================
  .get("/", zValidator("query", listSandboxesSchema), async (c) => {
    const { userId, status } = c.req.valid("query");

    try {
      const manager = getSandboxManager();
      const sandboxes = await manager.listSandboxes({
        userId,
        status: status?.split(","),
      });

      return c.json({
        sandboxes,
        count: sandboxes.length,
      });
    } catch (error) {
      log.error("Failed to list sandboxes", { error });
      return c.json(
        { error: "Failed to list sandboxes", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Create Sandbox
  // ===========================================================================
  .post("/", zValidator("json", createSandboxSchema), async (c) => {
    const body = c.req.valid("json");

    log.info("Creating sandbox", { name: body.name, userId: body.userId, provider: body.provider });

    try {
      if (body.provider === "cloudflare") {
        if (!isCloudflareConfigured()) {
          return c.json({ 
            error: "Cloudflare provider not available",
            message: "Cloudflare sandboxes are not enabled. Set ENABLE_CLOUDFLARE_SANDBOXES=true and configure CLOUDFLARE_WORKER_URL.",
          }, 400);
        }

        const sandboxId = nanoid(12);
        const slug = await generateUniqueSlug(body.userId, body.name);

        log.info("Creating Cloudflare sandbox", { sandboxId, name: body.name, userId: body.userId });

        const dbSandbox = await createSandboxRecord({
          id: sandboxId,
          userId: body.userId,
          name: body.name,
          slug,
          description: body.description,
          repoName: `${slug}-${sandboxId}`,
          githubUrl: body.githubUrl,
          provider: "cloudflare",
          resourceTierId: "starter",
          flavorId: "cloudflare",
          addonIds: [],
        });

        await updateSandbox(sandboxId, { status: "starting" });

        const cloudflareProvider = getCloudflareProvider();
        const opencodeUrl = cloudflareProvider.getOpencodeUrl(sandboxId);

        (async () => {
          try {
            log.info("Starting async Cloudflare sandbox provisioning", { sandboxId });
            
            await cloudflareProvider.createSandbox({
              id: sandboxId,
              userId: body.userId,
              name: body.name,
              gitUrl: body.githubUrl,
            });

            await updateSandbox(sandboxId, {
              status: "running",
              opencodeUrl,
            });

            log.info("Cloudflare sandbox provisioned successfully", { sandboxId });
          } catch (cloudflareError) {
            log.error("Cloudflare sandbox provisioning failed", { 
              sandboxId, 
              error: cloudflareError instanceof Error ? cloudflareError.message : "Unknown error",
            });
            await updateSandbox(sandboxId, { 
              status: "error", 
              errorMessage: cloudflareError instanceof Error ? cloudflareError.message : "Cloudflare sandbox creation failed",
            });
          }
        })();

        return c.json(
          {
            sandbox: {
              ...dbSandbox,
              status: "starting",
              provider: "cloudflare",
              opencodeUrl,
              urls: {
                opencode: opencodeUrl,
              },
            },
            repository: null,
          },
          201
        );
      }

      let flavorId = body.flavor;
      if (flavorId) {
        const flavor = await getFlavorById(flavorId);
        if (!flavor) {
          return c.json({ error: `Invalid flavor: '${flavorId}'. Flavor does not exist.` }, 400);
        }
        if (!flavor.enabled) {
          return c.json({ error: `Flavor '${flavorId}' is currently disabled.` }, 400);
        }
      } else {
        const defaultFlavor = await getDefaultFlavor();
        flavorId = defaultFlavor?.id;
      }

      let resourceTierId = body.resourceTier;
      if (resourceTierId) {
        const tier = await getResourceTierById(resourceTierId);
        if (!tier) {
          return c.json({ error: `Invalid resource tier: '${resourceTierId}'. Tier does not exist.` }, 400);
        }
      } else {
        const defaultTier = await getDefaultResourceTier();
        resourceTierId = defaultTier?.id;
      }

      const limitCheck = await checkAllLimitsForSandboxCreation(
        body.userId,
        resourceTierId ?? "starter",
        body.addons ?? []
      );
      
      if (!limitCheck.allowed) {
        log.warn("Sandbox creation blocked by resource limits", { 
          userId: body.userId, 
          reason: limitCheck.reason,
          current: limitCheck.current,
          limit: limitCheck.limit,
        });
        return c.json({ 
          error: "Resource limit exceeded",
          message: limitCheck.reason,
          current: limitCheck.current,
          limit: limitCheck.limit,
        }, 403);
      }

      const manager = getSandboxManager();
      const result = await manager.createSandbox({
        name: body.name,
        description: body.description,
        githubUrl: body.githubUrl,
        userId: body.userId,
        flavor: flavorId,
        resourceTier: resourceTierId,
        addons: body.addons,
        autoStart: body.autoStart,
        agentSlugs: body.agentSlugs,
      });

      log.info("Sandbox created", { sandboxId: result.sandbox.id });

      return c.json(
        {
          sandbox: result.sandbox,
          repository: result.repository,
        },
        201
      );
    } catch (error) {
      log.error("Failed to create sandbox", { error });
      return c.json(
        { error: "Failed to create sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Sandbox by ID
  // ===========================================================================
  .get("/:id", async (c) => {
    const id = c.req.param("id");

    try {
      const manager = getSandboxManager();
      const info = await manager.getSandboxInfo(id);

      if (!info) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      return c.json(info);
    } catch (error) {
      log.error("Failed to get sandbox", { id, error });
      return c.json(
        { error: "Failed to get sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Delete Sandbox
  // ===========================================================================
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deleteRepo = c.req.query("deleteRepo") !== "false";
    const removeVolumes = c.req.query("removeVolumes") === "true";

    log.info("Deleting sandbox", { id, deleteRepo, removeVolumes });

    try {
      const manager = getSandboxManager();
      await manager.deleteSandbox(id, { deleteRepo, removeVolumes });

      return c.json({ success: true, message: "Sandbox deleted" });
    } catch (error) {
      log.error("Failed to delete sandbox", { id, error });
      return c.json(
        { error: "Failed to delete sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Start Sandbox
  // ===========================================================================
  .post("/:id/start", async (c) => {
    const id = c.req.param("id");

    log.info("Starting sandbox", { id });

    try {
      // Get sandbox to check user and tier
      const sandboxInfo = await getSandboxById(id);
      if (!sandboxInfo) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      // Check user resource limits before starting sandbox
      const limitCheck = await checkAllLimitsForSandboxStart(
        sandboxInfo.userId,
        sandboxInfo.resourceTierId ?? "starter"
      );
      
      if (!limitCheck.allowed) {
        log.warn("Sandbox start blocked by resource limits", { 
          sandboxId: id,
          userId: sandboxInfo.userId, 
          reason: limitCheck.reason,
          current: limitCheck.current,
          limit: limitCheck.limit,
        });
        return c.json({ 
          error: "Resource limit exceeded",
          message: limitCheck.reason,
          current: limitCheck.current,
          limit: limitCheck.limit,
        }, 403);
      }

      const manager = getSandboxManager();
      await manager.startSandbox(id);
      const sandbox = await manager.getSandbox(id);

      return c.json({ sandbox, message: "Sandbox started" });
    } catch (error) {
      log.error("Failed to start sandbox", { id, error });
      return c.json(
        { error: "Failed to start sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Stop Sandbox
  // ===========================================================================
  .post("/:id/stop", async (c) => {
    const id = c.req.param("id");
    const timeout = parseInt(c.req.query("timeout") ?? "10", 10);

    log.info("Stopping sandbox", { id, timeout });

    try {
      const manager = getSandboxManager();
      await manager.stopSandbox(id, timeout);
      const sandbox = await manager.getSandbox(id);

      return c.json({ sandbox, message: "Sandbox stopped" });
    } catch (error) {
      log.error("Failed to stop sandbox", { id, error });
      return c.json(
        { error: "Failed to stop sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Restart Sandbox
  // ===========================================================================
  .post("/:id/restart", async (c) => {
    const id = c.req.param("id");
    const timeout = parseInt(c.req.query("timeout") ?? "10", 10);

    log.info("Restarting sandbox", { id, timeout });

    try {
      const manager = getSandboxManager();
      await manager.restartSandbox(id, timeout);
      const sandbox = await manager.getSandbox(id);

      return c.json({ sandbox, message: "Sandbox restarted" });
    } catch (error) {
      log.error("Failed to restart sandbox", { id, error });
      return c.json(
        { error: "Failed to restart sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Pause Sandbox
  // ===========================================================================
  .post("/:id/pause", async (c) => {
    const id = c.req.param("id");

    log.info("Pausing sandbox", { id });

    try {
      const manager = getSandboxManager();
      await manager.pauseSandbox(id);
      const sandbox = await manager.getSandbox(id);

      return c.json({ sandbox, message: "Sandbox paused" });
    } catch (error) {
      log.error("Failed to pause sandbox", { id, error });
      return c.json(
        { error: "Failed to pause sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Unpause Sandbox
  // ===========================================================================
  .post("/:id/unpause", async (c) => {
    const id = c.req.param("id");

    log.info("Unpausing sandbox", { id });

    try {
      const manager = getSandboxManager();
      await manager.unpauseSandbox(id);
      const sandbox = await manager.getSandbox(id);

      return c.json({ sandbox, message: "Sandbox unpaused" });
    } catch (error) {
      log.error("Failed to unpause sandbox", { id, error });
      return c.json(
        { error: "Failed to unpause sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Wake Sandbox (Cloudflare)
  // ===========================================================================
  .post("/:id/wake", async (c) => {
    const id = c.req.param("id");

    log.info("Waking Cloudflare sandbox", { id });

    try {
      const sandboxInfo = await getSandboxById(id);
      if (!sandboxInfo) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      if (sandboxInfo.provider !== "cloudflare") {
        return c.json({ error: "Wake endpoint only works for Cloudflare sandboxes" }, 400);
      }

      const cloudflareProvider = getCloudflareProvider();
      await cloudflareProvider.startSandbox(id);
      
      await updateSandbox(id, { status: "running" });
      await touchSandbox(id);
      
      const sandbox = await getSandboxById(id);
      return c.json({ sandbox, message: "Sandbox woken up" });
    } catch (error) {
      log.error("Failed to wake sandbox", { id, error });
      return c.json(
        { error: "Failed to wake sandbox", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Sandbox Logs
  // ===========================================================================
  .get("/:id/logs", zValidator("query", logsQuerySchema), async (c) => {
    const id = c.req.param("id");
    const { tail, since, timestamps } = c.req.valid("query");

    try {
      const manager = getSandboxManager();
      const logs = await manager.getSandboxLogs(id, {
        tail: tail ?? 100,
        since: since ? new Date(since) : undefined,
        timestamps: timestamps ?? false,
      });

      return c.json({ logs, tail: tail ?? 100 });
    } catch (error) {
      log.error("Failed to get sandbox logs", { id, error });
      return c.json(
        { error: "Failed to get logs", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Sandbox Stats
  // ===========================================================================
  .get("/:id/stats", async (c) => {
    const id = c.req.param("id");

    try {
      const manager = getSandboxManager();
      const stats = await manager.getSandboxStats(id);

      return c.json({ stats });
    } catch (error) {
      log.error("Failed to get sandbox stats", { id, error });
      return c.json(
        { error: "Failed to get stats", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Execute Command in Sandbox
  // ===========================================================================
  .post("/:id/exec", zValidator("json", execCommandSchema), async (c) => {
    const id = c.req.param("id");
    const { command, workingDir, env, user } = c.req.valid("json");

    log.info("Executing command in sandbox", { id, command: command[0] });

    try {
      const manager = getSandboxManager();
      const result = await manager.exec(id, command, {
        workingDir,
        env,
        user,
      });

      return c.json({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    } catch (error) {
      log.error("Failed to execute command", { id, error });
      return c.json(
        { error: "Failed to execute command", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Sandbox Status
  // ===========================================================================
  .get("/:id/status", async (c) => {
    const id = c.req.param("id");

    try {
      const manager = getSandboxManager();
      const status = await manager.getSandboxStatus(id);

      return c.json({ status });
    } catch (error) {
      log.error("Failed to get sandbox status", { id, error });
      return c.json(
        { error: "Failed to get status", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Sandbox Agents
  // ===========================================================================
  .get("/:id/agents", async (c) => {
    const id = c.req.param("id");

    try {
      const { getSandboxAgents } = await import("../services/agent-catalog-service.ts");
      const agents = await getSandboxAgents(id);

      return c.json({
        agents: agents.map(agent => ({
          slug: agent.slug,
          name: agent.name,
          role: agent.role,
          emoji: agent.emoji,
          squad: agent.squad,
          content: agent.opencodeContent,
        })),
      });
    } catch (error) {
      log.error("Failed to get sandbox agents", { id, error });
      return c.json(
        { error: "Failed to get agents", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Git Operations: Commit Changes
  // ===========================================================================
  .post("/:id/git/commit", zValidator("json", z.object({
    message: z.string().min(1).max(500),
    author: z.object({
      name: z.string(),
      email: z.string().email(),
    }).optional(),
  })), async (c) => {
    const id = c.req.param("id");
    const { message, author } = c.req.valid("json");

    log.info("Committing changes in sandbox", { id, message });

    try {
      const manager = getSandboxManager();
      const sha = await manager.commitChanges(id, message, author);

      return c.json({ sha, message: "Changes committed" });
    } catch (error) {
      log.error("Failed to commit changes", { id, error });
      return c.json(
        { error: "Failed to commit changes", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Git Operations: Get Status
  // ===========================================================================
  .get("/:id/git/status", async (c) => {
    const id = c.req.param("id");

    try {
      const manager = getSandboxManager();
      const status = await manager.getGitStatus(id);

      return c.json({ files: status });
    } catch (error) {
      log.error("Failed to get git status", { id, error });
      return c.json(
        { error: "Failed to get git status", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Git Operations: Get Log
  // ===========================================================================
  .get("/:id/git/log", async (c) => {
    const id = c.req.param("id");
    const limit = parseInt(c.req.query("limit") ?? "10", 10);

    try {
      const manager = getSandboxManager();
      const commits = await manager.getGitLog(id, { limit });

      return c.json({ commits });
    } catch (error) {
      log.error("Failed to get git log", { id, error });
      return c.json(
        { error: "Failed to get git log", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Git Operations: List Branches
  // ===========================================================================
  .get("/:id/git/branches", async (c) => {
    const id = c.req.param("id");

    try {
      const manager = getSandboxManager();
      const result = await manager.listBranches(id);

      return c.json(result);
    } catch (error) {
      log.error("Failed to list branches", { id, error });
      return c.json(
        { error: "Failed to list branches", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Git Operations: Create Branch
  // ===========================================================================
  .post("/:id/git/branches", zValidator("json", z.object({
    name: z.string().min(1).max(200).regex(/^[a-zA-Z0-9._/-]+$/, "Invalid branch name"),
    ref: z.string().optional(),
  })), async (c) => {
    const id = c.req.param("id");
    const { name, ref } = c.req.valid("json");

    log.info("Creating branch in sandbox", { id, branchName: name, ref });

    try {
      const manager = getSandboxManager();
      await manager.createBranch(id, name, ref);

      return c.json({ success: true, branch: name, message: "Branch created" }, 201);
    } catch (error) {
      log.error("Failed to create branch", { id, error });
      return c.json(
        { error: "Failed to create branch", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Git Operations: Checkout Branch
  // ===========================================================================
  .post("/:id/git/checkout", zValidator("json", z.object({
    branch: z.string().min(1).max(200),
  })), async (c) => {
    const id = c.req.param("id");
    const { branch } = c.req.valid("json");

    log.info("Checking out branch in sandbox", { id, branch });

    try {
      const manager = getSandboxManager();
      await manager.checkoutBranch(id, branch);

      return c.json({ success: true, branch, message: "Branch checked out" });
    } catch (error) {
      log.error("Failed to checkout branch", { id, error });
      return c.json(
        { error: "Failed to checkout branch", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Git Operations: Delete Branch
  // ===========================================================================
  .delete("/:id/git/branches/:branch", async (c) => {
    const id = c.req.param("id");
    // URL decode the branch name in case it contains slashes (e.g., feature/my-branch)
    const branch = decodeURIComponent(c.req.param("branch"));

    log.info("Deleting branch in sandbox", { id, branch });

    try {
      const manager = getSandboxManager();
      await manager.deleteBranch(id, branch);

      return c.json({ success: true, message: `Branch '${branch}' deleted` });
    } catch (error) {
      log.error("Failed to delete branch", { id, error });
      const message = error instanceof Error ? error.message : "Unknown error";
      // Return 400 if trying to delete current branch
      const status = message.includes("Cannot delete the current branch") ? 400 : 500;
      return c.json(
        { error: "Failed to delete branch", details: message },
        status
      );
    }
  })

  // ===========================================================================
  // Git Operations: Get Diff Summary
  // ===========================================================================
  .get("/:id/git/diff", async (c) => {
    const id = c.req.param("id");
    const from = c.req.query("from");
    const to = c.req.query("to");

    try {
      const manager = getSandboxManager();
      const diff = await manager.getDiff(id, { from, to });

      return c.json({ diff });
    } catch (error) {
      log.error("Failed to get diff", { id, error });
      return c.json(
        { error: "Failed to get diff", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Git Operations: Get File Diff
  // ===========================================================================
  .get("/:id/git/diff/file", async (c) => {
    const id = c.req.param("id");
    const filePath = c.req.query("path");

    if (!filePath) {
      return c.json({ error: "Path query parameter is required" }, 400);
    }

    try {
      const manager = getSandboxManager();
      const fileDiff = await manager.getFileDiff(id, decodeURIComponent(filePath));

      return c.json({ fileDiff });
    } catch (error) {
      log.error("Failed to get file diff", { id, filePath, error });
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = message.includes("File not found") ? 404 : 500;
      return c.json(
        { error: "Failed to get file diff", details: message },
        status
      );
    }
  })

  // ===========================================================================
  // OpenCode: List Sessions
  // ===========================================================================
  .get("/:id/opencode/session", async (c) => {
    const id = c.req.param("id");

    try {
      const sessions = await opencodeV2.listSessions(id);
      return c.json(sessions);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to list OpenCode sessions");
    }
  })

  // ===========================================================================
  // OpenCode: Create Session
  // ===========================================================================
  .post("/:id/opencode/session", async (c) => {
    const id = c.req.param("id");

    try {
      const body = await c.req.json().catch(() => ({}));
      const session = await opencodeV2.createSession(id, body.title);
      return c.json(session);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to create OpenCode session");
    }
  })

  // ===========================================================================
  // OpenCode: Get Session
  // ===========================================================================
  .get("/:id/opencode/session/:sessionId", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      const session = await opencodeV2.getSession(id, sessionId);
      return c.json(session);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to get OpenCode session");
    }
  })

  // ===========================================================================
  // OpenCode: Delete Session
  // ===========================================================================
  .delete("/:id/opencode/session/:sessionId", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      await opencodeV2.deleteSession(id, sessionId);
      return c.json({ success: true });
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to delete OpenCode session");
    }
  })

  // ===========================================================================
  // OpenCode: Abort Session
  // ===========================================================================
  .post("/:id/opencode/session/:sessionId/abort", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      await opencodeV2.abortSession(id, sessionId);
      return c.json({ success: true });
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to abort OpenCode session");
    }
  })

  // ===========================================================================
  // OpenCode: List Messages
  // ===========================================================================
  .get("/:id/opencode/session/:sessionId/message", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      const messages = await opencodeV2.listMessages(id, sessionId);
      return c.json(messages);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to list OpenCode messages");
    }
  })

  // ===========================================================================
  // OpenCode: Send Message (Prompt)
  // ===========================================================================
  .post("/:id/opencode/session/:sessionId/message", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      const body = await c.req.json();
      const response = await opencodeV2.sendMessage(id, sessionId, body);
      
      // Sync the conversation after AI responds
      // This captures both the user message and AI response with all parts (text, tools, etc.)
      try {
        const { syncSessionMessages } = await import('../services/sync/opencode-sync.ts');
        await syncSessionMessages(id, sessionId);
        log.debug('Synced messages after prompt', { sandboxId: id, sessionId });
      } catch (syncError) {
        // Don't fail the request if sync fails, just log it
        log.warn('Failed to sync messages after prompt', { sandboxId: id, sessionId, error: syncError });
      }
      
      return c.json(response);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to send OpenCode message");
    }
  })

  // ===========================================================================
  // OpenCode: Get Message
  // ===========================================================================
  .get("/:id/opencode/session/:sessionId/message/:messageId", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");
    const messageId = c.req.param("messageId");

    try {
      const message = await opencodeV2.getMessage(id, sessionId, messageId);
      return c.json(message);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to get OpenCode message");
    }
  })

  // ===========================================================================
  // OpenCode: Respond to Permission
  // ===========================================================================
  .post("/:id/opencode/session/:sessionId/permissions/:permissionId", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");
    const permissionId = c.req.param("permissionId");

    try {
      const body = await c.req.json();
      const response = body.response as "once" | "always" | "reject";

      if (!["once", "always", "reject"].includes(response)) {
        return c.json({ error: "Invalid response. Must be 'once', 'always', or 'reject'" }, 400);
      }

      await opencodeV2.respondToPermission(id, sessionId, permissionId, response);
      return c.json({ success: true, message: "Permission response sent" });
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to respond to permission");
    }
  })

  // ===========================================================================
  // OpenCode: Fork Session
  // ===========================================================================
  .post("/:id/opencode/session/:sessionId/fork", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      const body = await c.req.json().catch(() => ({}));
      const messageId = body.messageId as string | undefined;

      const newSession = await opencodeV2.forkSession(id, sessionId, messageId);
      return c.json(newSession);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to fork session");
    }
  })

  // ===========================================================================
  // OpenCode: Revert Message (Undo)
  // ===========================================================================
  .post("/:id/opencode/session/:sessionId/revert", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      const body = await c.req.json();
      const messageId = body.messageId as string;
      const partId = body.partId as string | undefined;

      if (!messageId) {
        return c.json({ error: "messageId is required" }, 400);
      }

      const updatedSession = await opencodeV2.revertMessage(id, sessionId, messageId, partId);
      return c.json(updatedSession);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to revert message");
    }
  })

  // ===========================================================================
  // OpenCode: Unrevert Session (Redo)
  // ===========================================================================
  .post("/:id/opencode/session/:sessionId/unrevert", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      const updatedSession = await opencodeV2.unrevertSession(id, sessionId);
      return c.json(updatedSession);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to unrevert session");
    }
  })

  // ===========================================================================
  // OpenCode: List Files
  // ===========================================================================
  .get("/:id/opencode/file", async (c) => {
    const id = c.req.param("id");
    let path = c.req.query("path") ?? "/";
    
    // OpenCode expects paths relative to the workspace root
    // Strip common absolute path prefixes if provided
    const workspacePrefixes = ["/home/workspace/", "/home/workspace"];
    for (const prefix of workspacePrefixes) {
      if (path.startsWith(prefix)) {
        path = path.slice(prefix.length) || "/";
        break;
      }
    }

    try {
      const files = await opencodeV2.listFiles(id, path);
      return c.json(files);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to list OpenCode files");
    }
  })

  // ===========================================================================
  // OpenCode: Get File Content
  // ===========================================================================
  .get("/:id/opencode/file/content", async (c) => {
    const id = c.req.param("id");
    let path = c.req.query("path");

    if (!path) {
      return c.json({ error: "Path query parameter is required" }, 400);
    }

    // OpenCode expects paths relative to the workspace root
    // Strip common absolute path prefixes if provided
    const workspacePrefixes = ["/home/workspace/", "/home/workspace"];
    for (const prefix of workspacePrefixes) {
      if (path.startsWith(prefix)) {
        path = path.slice(prefix.length) || "/";
        break;
      }
    }

    try {
      const content = await opencodeV2.getFileContent(id, path);
      return c.json(content);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to get file content");
    }
  })

  // ===========================================================================
  // OpenCode: Find Files
  // ===========================================================================
  .get("/:id/opencode/find/file", async (c) => {
    const id = c.req.param("id");
    const query = c.req.query("query");

    if (!query) {
      return c.json({ error: "Query parameter is required" }, 400);
    }

    try {
      const files = await opencodeV2.findFiles(id, query);
      return c.json(files);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to find files");
    }
  })

  // ===========================================================================
  // OpenCode: Get App Info
  // ===========================================================================
  .get("/:id/opencode/app", async (c) => {
    const id = c.req.param("id");

    try {
      const appInfo = await opencodeV2.getAppInfo(id);
      return c.json(appInfo);
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to get OpenCode app info");
    }
  })

  // ===========================================================================
  // OpenCode: Get Providers
  // ===========================================================================
  .get("/:id/opencode/providers", async (c) => {
    const id = c.req.param("id");

    try {
      const providers = await opencodeV2.getProviders(id);
      return c.json({ providers });
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to get OpenCode providers");
    }
  })

  // ===========================================================================
  // OpenCode: Get Agents (filtered by sandbox's assigned agents)
  // ===========================================================================
  .get("/:id/opencode/agents", async (c) => {
    const id = c.req.param("id");

    try {
      const allAgents = await opencodeV2.getAgents(id);
      
      const { getSandboxAgents } = await import("../services/agent-catalog-service.ts");
      const sandboxAgents = await getSandboxAgents(id);
      
      if (sandboxAgents.length > 0) {
        const enabledAgentSlugs = new Set(
          sandboxAgents.map(a => a.slug.toLowerCase())
        );
        const filteredAgents = allAgents.filter(
          agent => enabledAgentSlugs.has(agent.name.toLowerCase())
        );
        return c.json({ agents: filteredAgents });
      }
      
      return c.json({ agents: allAgents });
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to get OpenCode agents");
    }
  })

  // ===========================================================================
  // OpenCode: Health Check
  // ===========================================================================
  .get("/:id/opencode/health", async (c) => {
    const id = c.req.param("id");

    try {
      const healthy = await opencodeV2.healthCheck(id);
      return c.json({ 
        healthy, 
        status: healthy ? "ok" : "unreachable" 
      });
    } catch (error) {
      if (error instanceof OpenCodeV2Error) {
        return c.json({ healthy: false, status: "error", error: error.message });
      }
      return c.json({ healthy: false, status: "error" });
    }
  })

  // ===========================================================================
  // OpenCode: SSE Event Stream
  // ===========================================================================
  .get("/:id/opencode/event", async (c) => {
    const id = c.req.param("id");

    try {
      // For SSE, we'll stream events from OpenCode to the client
      return streamSSE(c, async (stream) => {
        const abortController = new AbortController();

        // Handle client disconnect
        stream.onAbort(() => {
          abortController.abort();
        });

        try {
          const events = await opencodeV2.subscribeToEvents(id, abortController.signal);
          
          for await (const event of events) {
            // Cache/uncache permissions for reconnection support
            if (event.type === "permission.updated") {
              const permission = event.properties as Permission;
              cachePermission(id, permission);
            } else if (event.type === "permission.replied") {
              const { sessionID, permissionID } = event.properties as { sessionID: string; permissionID: string };
              uncachePermission(id, sessionID, permissionID);
            }

            // Send the full event object (type + properties) to match OpenCode SDK format
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event),
            });
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            log.error("SSE stream error", { id, error });
          }
        }
      });
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to start OpenCode event stream");
    }
  })

  // ===========================================================================
  // OpenCode: List Pending Permissions
  // ===========================================================================
  .get("/:id/opencode/session/:sessionId/permissions", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");

    try {
      const permissions = opencodeV2.getPendingPermissions(id, sessionId);
      return c.json({ permissions });
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to get pending permissions");
    }
  });

// =============================================================================
// Health Check Route
// =============================================================================

export const sandboxHealthRoutes = new Hono()
  .get("/docker", async (c) => {
    try {
      const manager = getSandboxManager();
      const healthy = await manager.healthCheck();

      if (!healthy) {
        return c.json({ status: "unhealthy", message: "Docker daemon not accessible" }, 503);
      }

      const info = await manager.getDockerInfo();
      return c.json({
        status: "healthy",
        docker: {
          version: info.version,
          apiVersion: info.apiVersion,
          os: info.os,
          arch: info.arch,
          containers: {
            running: info.containersRunning,
            stopped: info.containersStopped,
          },
          images: info.images,
        },
      });
    } catch (error) {
      log.error("Docker health check failed", { error });
      return c.json(
        { status: "unhealthy", message: error instanceof Error ? error.message : "Unknown error" },
        503
      );
    }
  });

// =============================================================================
// Global Pending Actions Routes
// =============================================================================

export const pendingActionsRoutes = new Hono()
  /**
   * GET /api/v2/pending-actions/permissions
   * Get all pending permission requests across all sandboxes.
   * Used by the home page to show a global view of pending actions.
   */
  .get("/permissions", async (c) => {
    try {
      const permissions = opencodeV2.getAllPendingPermissions();
      return c.json({ permissions });
    } catch (error) {
      log.error("Failed to get all pending permissions", { error });
      return c.json(
        { error: "Failed to get pending permissions", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });
