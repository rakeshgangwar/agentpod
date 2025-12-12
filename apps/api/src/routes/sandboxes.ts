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

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getSandboxManager } from "../services/sandbox-manager.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("sandbox-routes");

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
