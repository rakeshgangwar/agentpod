/**
 * Session Fork API Routes
 * 
 * Git-like branching system for AI conversation sessions.
 * 
 * Endpoints:
 * - GET    /api/v2/sandboxes/:sandboxId/forks                          List all forks
 * - GET    /api/v2/sandboxes/:sandboxId/forks/statistics               Get fork statistics
 * - POST   /api/v2/sandboxes/:sandboxId/sessions/:sessionId/fork       Create a fork
 * - GET    /api/v2/sandboxes/:sandboxId/sessions/:sessionId/ancestry   Get ancestry path
 * - GET    /api/v2/sandboxes/:sandboxId/sessions/:sessionId/children   Get child forks
 * - GET    /api/v2/sandboxes/:sandboxId/sessions/:sessionId/branches   Get message branches
 * - POST   /api/v2/sandboxes/:sandboxId/sessions/:sessionId/tags       Add tag
 * - DELETE /api/v2/sandboxes/:sandboxId/sessions/:sessionId/tags/:tag  Remove tag
 * - PUT    /api/v2/sandboxes/:sandboxId/sessions/:sessionId/tags       Set all tags
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sessionForkManager } from "../services/session-fork-manager.ts";
import * as SandboxModel from "../models/sandbox.ts";
import { createLogger } from "../utils/logger.ts";
import type { CreateForkInput, ForkType } from "@agentpod/types";

const log = createLogger("session-forks-routes");

// =============================================================================
// Validation Schemas
// =============================================================================

const createForkSchema = z.object({
  messageId: z.string().optional(),
  messageRole: z.enum(["user", "assistant"]).optional(),
  reason: z.string().optional(),
  tags: z.array(z.string()).optional(),
  agentConfig: z.record(z.unknown()).optional(),
});

const addTagSchema = z.object({
  tag: z.string().min(1).max(50),
});

const setTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(50)),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Verify sandbox exists and user has access
 */
async function verifySandboxAccess(sandboxId: string, userId?: string): Promise<SandboxModel.Sandbox | null> {
  const sandbox = await SandboxModel.getSandboxById(sandboxId);
  if (!sandbox) return null;
  
  // If userId provided, verify ownership
  if (userId && sandbox.userId !== userId) {
    return null;
  }
  
  return sandbox;
}

// =============================================================================
// Routes
// =============================================================================

export const sessionForkRoutes = new Hono()
  // ===========================================================================
  // List All Forks for Sandbox
  // ===========================================================================
  .get("/:sandboxId/forks", async (c) => {
    const sandboxId = c.req.param("sandboxId");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const result = await sessionForkManager.listForks(sandboxId);
      return c.json(result);
    } catch (error) {
      log.error("Failed to list forks", { sandboxId, error });
      return c.json(
        { error: "Failed to list forks", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Fork Statistics
  // ===========================================================================
  .get("/:sandboxId/forks/statistics", async (c) => {
    const sandboxId = c.req.param("sandboxId");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const stats = await sessionForkManager.getStatistics(sandboxId);
      return c.json(stats);
    } catch (error) {
      log.error("Failed to get fork statistics", { sandboxId, error });
      return c.json(
        { error: "Failed to get fork statistics", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Create Fork from Session
  // ===========================================================================
  .post("/:sandboxId/sessions/:sessionId/fork", zValidator("json", createForkSchema), async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");
    const input = c.req.valid("json");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    if (sandbox.status !== "running") {
      return c.json({ error: "Sandbox is not running" }, 400);
    }

    try {
      const fork = await sessionForkManager.createFork({
        sandboxId,
        parentSessionId: sessionId,
        input: input as CreateForkInput,
        forkType: "explicit" as ForkType,
        createdBy: "user",
      });

      log.info("Created session fork", {
        sandboxId,
        parentSessionId: sessionId,
        newSessionId: fork.id,
      });

      return c.json(fork, 201);
    } catch (error) {
      log.error("Failed to create fork", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to create fork", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Session Ancestry (Path from Root)
  // ===========================================================================
  .get("/:sandboxId/sessions/:sessionId/ancestry", async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const ancestry = await sessionForkManager.getAncestry(sessionId);
      return c.json({ ancestry });
    } catch (error) {
      log.error("Failed to get ancestry", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to get ancestry", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Child Forks
  // ===========================================================================
  .get("/:sandboxId/sessions/:sessionId/children", async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const children = await sessionForkManager.getChildren(sessionId);
      return c.json({ children });
    } catch (error) {
      log.error("Failed to get children", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to get children", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Message Branches for Session
  // ===========================================================================
  .get("/:sandboxId/sessions/:sessionId/branches", async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const branches = await sessionForkManager.getBranches(sessionId);
      const currentBranch = await sessionForkManager.getCurrentBranch(sessionId);

      return c.json({
        branches,
        currentBranch,
      });
    } catch (error) {
      log.error("Failed to get branches", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to get branches", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Add Tag to Session
  // ===========================================================================
  .post("/:sandboxId/sessions/:sessionId/tags", zValidator("json", addTagSchema), async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");
    const { tag } = c.req.valid("json");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      await sessionForkManager.addTag(sessionId, tag);
      const fork = await sessionForkManager.getFork(sessionId);

      return c.json({
        success: true,
        tags: fork?.tags || [],
      });
    } catch (error) {
      log.error("Failed to add tag", { sandboxId, sessionId, tag, error });
      return c.json(
        { error: "Failed to add tag", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Remove Tag from Session
  // ===========================================================================
  .delete("/:sandboxId/sessions/:sessionId/tags/:tag", async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");
    const tag = c.req.param("tag");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      await sessionForkManager.removeTag(sessionId, tag);
      const fork = await sessionForkManager.getFork(sessionId);

      return c.json({
        success: true,
        tags: fork?.tags || [],
      });
    } catch (error) {
      log.error("Failed to remove tag", { sandboxId, sessionId, tag, error });
      return c.json(
        { error: "Failed to remove tag", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Set All Tags for Session
  // ===========================================================================
  .put("/:sandboxId/sessions/:sessionId/tags", zValidator("json", setTagsSchema), async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");
    const { tags } = c.req.valid("json");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      await sessionForkManager.setTags(sessionId, tags);

      return c.json({
        success: true,
        tags,
      });
    } catch (error) {
      log.error("Failed to set tags", { sandboxId, sessionId, tags, error });
      return c.json(
        { error: "Failed to set tags", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Fork Details
  // ===========================================================================
  .get("/:sandboxId/sessions/:sessionId/fork-info", async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");

    const sandbox = await verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const fork = await sessionForkManager.getFork(sessionId);
      if (!fork) {
        return c.json({ error: "Fork info not found" }, 404);
      }

      const ancestry = await sessionForkManager.getAncestry(sessionId);
      const children = await sessionForkManager.getChildren(sessionId);

      return c.json({
        fork,
        ancestry,
        childCount: children.length,
        depth: ancestry.length - 1,
      });
    } catch (error) {
      log.error("Failed to get fork info", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to get fork info", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });
