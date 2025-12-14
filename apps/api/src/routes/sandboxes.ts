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
import { opencodeV2, OpenCodeV2Error } from "../services/opencode-v2.ts";
import { createLogger } from "../utils/logger.ts";

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
  flavor: z.enum(["js", "python", "go", "rust", "fullstack", "polyglot"]).optional(),
  resourceTier: z.enum(["starter", "builder", "creator", "power"]).optional(),
  addons: z.array(z.string()).optional(),
  autoStart: z.boolean().optional(),
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

    log.info("Creating sandbox", { name: body.name, userId: body.userId });

    try {
      const manager = getSandboxManager();
      const result = await manager.createSandbox({
        name: body.name,
        description: body.description,
        githubUrl: body.githubUrl,
        userId: body.userId,
        flavor: body.flavor,
        resourceTier: body.resourceTier,
        addons: body.addons,
        autoStart: body.autoStart,
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
      return c.json({ success: true });
    } catch (error) {
      return handleOpenCodeError(c, error, "Failed to respond to permission");
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
    const workspacePrefixes = ["/home/developer/workspace/", "/home/developer/workspace", "/workspace/", "/workspace"];
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
    const workspacePrefixes = ["/home/developer/workspace/", "/home/developer/workspace", "/workspace/", "/workspace"];
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
  // OpenCode: Get Agents
  // ===========================================================================
  .get("/:id/opencode/agents", async (c) => {
    const id = c.req.param("id");

    try {
      const agents = await opencodeV2.getAgents(id);
      return c.json({ agents });
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
