/**
 * Chat API Routes
 * 
 * Provides access to persisted chat history from the database.
 * This is separate from the real-time OpenCode routes in sandboxes.ts.
 * 
 * Endpoints:
 * - GET    /api/v2/sandboxes/:id/chat/sessions           List sessions
 * - GET    /api/v2/sandboxes/:id/chat/sessions/:sessionId Get session with messages
 * - POST   /api/v2/sandboxes/:id/chat/sessions/:sessionId/sync Force sync
 * - DELETE /api/v2/sandboxes/:id/chat/sessions/:sessionId Archive session
 * - GET    /api/v2/sandboxes/:id/chat/sessions/:sessionId/messages Paginated messages
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as ChatSessionModel from "../models/chat-session.ts";
import * as ChatMessageModel from "../models/chat-message.ts";
import * as SandboxModel from "../models/sandbox.ts";
import { getOpenCodeSyncService } from "../services/sync/opencode-sync.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("chat-routes");

// =============================================================================
// Validation Schemas
// =============================================================================

const listSessionsSchema = z.object({
  status: z.enum(["active", "archived", "deleted"]).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

const listMessagesSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  order: z.enum(["asc", "desc"]).optional().default("asc"),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Verify sandbox exists and user has access
 */
function verifySandboxAccess(sandboxId: string, userId?: string): SandboxModel.Sandbox | null {
  const sandbox = SandboxModel.getSandboxById(sandboxId);
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

export const chatRoutes = new Hono()
  // ===========================================================================
  // List Chat Sessions
  // ===========================================================================
  .get("/:sandboxId/chat/sessions", zValidator("query", listSessionsSchema), async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const { status, limit, offset } = c.req.valid("query");

    const sandbox = verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const sessions = ChatSessionModel.listChatSessionsBySandboxId(sandboxId, {
        status: status as ChatSessionModel.ChatSessionStatus | undefined,
        limit,
        offset,
      });

      const stats = ChatSessionModel.getChatSessionStats(sandboxId);

      return c.json({
        sessions,
        pagination: {
          total: stats.total,
          limit,
          offset,
        },
        stats,
      });
    } catch (error) {
      log.error("Failed to list chat sessions", { sandboxId, error });
      return c.json(
        { error: "Failed to list chat sessions", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Chat Session with Messages
  // ===========================================================================
  .get("/:sandboxId/chat/sessions/:sessionId", async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");

    const sandbox = verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const session = ChatSessionModel.getChatSessionById(sessionId);
      if (!session || session.sandboxId !== sandboxId) {
        return c.json({ error: "Session not found" }, 404);
      }

      // Get recent messages
      const messages = ChatMessageModel.getRecentMessages(sessionId, 50);

      return c.json({
        session,
        messages,
        messageCount: messages.length,
      });
    } catch (error) {
      log.error("Failed to get chat session", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to get chat session", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // List Session Messages (Paginated)
  // ===========================================================================
  .get("/:sandboxId/chat/sessions/:sessionId/messages", zValidator("query", listMessagesSchema), async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");
    const { limit, offset, order } = c.req.valid("query");

    const sandbox = verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const session = ChatSessionModel.getChatSessionById(sessionId);
      if (!session || session.sandboxId !== sandboxId) {
        return c.json({ error: "Session not found" }, 404);
      }

      const messages = ChatMessageModel.listChatMessagesBySessionId(sessionId, {
        limit,
        offset,
        order,
      });

      const totalCount = ChatMessageModel.getMessageCount(sessionId);

      return c.json({
        messages,
        pagination: {
          total: totalCount,
          limit,
          offset,
        },
      });
    } catch (error) {
      log.error("Failed to list messages", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to list messages", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Force Sync Session
  // ===========================================================================
  .post("/:sandboxId/chat/sessions/:sessionId/sync", async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");

    const sandbox = verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const session = ChatSessionModel.getChatSessionById(sessionId);
      if (!session || session.sandboxId !== sandboxId) {
        return c.json({ error: "Session not found" }, 404);
      }

      // Force sync with OpenCode
      const syncService = getOpenCodeSyncService();
      await syncService.syncSession(sandboxId, sessionId);

      // Get updated session
      const updatedSession = ChatSessionModel.getChatSessionById(sessionId);

      return c.json({
        session: updatedSession,
        message: "Sync completed",
      });
    } catch (error) {
      log.error("Failed to sync session", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to sync session", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Archive Session (Soft Delete)
  // ===========================================================================
  .delete("/:sandboxId/chat/sessions/:sessionId", async (c) => {
    const sandboxId = c.req.param("sandboxId");
    const sessionId = c.req.param("sessionId");

    const sandbox = verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const session = ChatSessionModel.getChatSessionById(sessionId);
      if (!session || session.sandboxId !== sandboxId) {
        return c.json({ error: "Session not found" }, 404);
      }

      // Archive (soft delete)
      ChatSessionModel.archiveChatSession(sessionId);
      log.info("Archived chat session", { sandboxId, sessionId });

      return c.json({
        success: true,
        message: "Session archived",
      });
    } catch (error) {
      log.error("Failed to archive session", { sandboxId, sessionId, error });
      return c.json(
        { error: "Failed to archive session", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Sync Status
  // ===========================================================================
  .get("/:sandboxId/chat/sync/status", async (c) => {
    const sandboxId = c.req.param("sandboxId");

    const sandbox = verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      const syncService = getOpenCodeSyncService();
      const status = syncService.getSyncStatus(sandboxId);
      const stats = ChatSessionModel.getChatSessionStats(sandboxId);

      return c.json({
        sync: status,
        stats,
        sandboxStatus: sandbox.status,
      });
    } catch (error) {
      log.error("Failed to get sync status", { sandboxId, error });
      return c.json(
        { error: "Failed to get sync status", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Full Sync for Sandbox (Manual Trigger)
  // ===========================================================================
  .post("/:sandboxId/chat/sync", async (c) => {
    const sandboxId = c.req.param("sandboxId");

    const sandbox = verifySandboxAccess(sandboxId);
    if (!sandbox) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    if (sandbox.status !== "running") {
      return c.json({ error: "Sandbox is not running" }, 400);
    }

    try {
      const syncService = getOpenCodeSyncService();
      await syncService.fullSync(sandboxId);

      const stats = ChatSessionModel.getChatSessionStats(sandboxId);

      return c.json({
        success: true,
        message: "Full sync completed",
        stats,
      });
    } catch (error) {
      log.error("Failed to trigger full sync", { sandboxId, error });
      return c.json(
        { error: "Failed to trigger full sync", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });
