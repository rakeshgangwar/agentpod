/**
 * Account Management Routes
 * 
 * Handles user account operations including deletion with data anonymization.
 * 
 * Endpoints:
 * - GET    /api/account                Get current account info
 * - DELETE /api/account                Delete account (with anonymization)
 * - GET    /api/account/data-export    Export all user data
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/index.ts";
import { getSandboxManager } from "../services/sandbox-manager.ts";
import { anonymizeUserLogs } from "../models/activity-log.ts";
import { deleteUserPreferences } from "../models/user-preferences.ts";
import * as SandboxModel from "../models/sandbox.ts";
import * as ChatSessionModel from "../models/chat-session.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("account-routes");

// =============================================================================
// Validation Schemas
// =============================================================================

const deleteAccountSchema = z.object({
  confirmPhrase: z.literal("DELETE MY ACCOUNT"),
  deleteContainers: z.boolean().optional().default(true),
  deleteRepositories: z.boolean().optional().default(true),
});

// =============================================================================
// Helper: Get user from context
// =============================================================================

function getUser(c: { get: (key: string) => unknown }): { id: string; email?: string; name?: string } | null {
  // Auth middleware sets 'user' directly in context
  const user = c.get("user") as { id?: string; email?: string; name?: string } | undefined;
  if (!user?.id || user.id === "anonymous") {
    return null;
  }
  return { id: user.id, email: user.email, name: user.name };
}

// =============================================================================
// Routes
// =============================================================================

export const accountRoutes = new Hono()
  // ===========================================================================
  // Get Account Info
  // ===========================================================================
  .get("/", async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      // Get user's sandboxes
      const sandboxes = SandboxModel.listSandboxesByUserId(user.id);
      
      // Get total chat sessions
      const chatSessions = sandboxes.reduce((acc, sandbox) => {
        const stats = ChatSessionModel.getChatSessionStats(sandbox.id);
        return acc + stats.total;
      }, 0);

      return c.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        stats: {
          sandboxCount: sandboxes.length,
          chatSessionCount: chatSessions,
        },
      });
    } catch (error) {
      log.error("Failed to get account info", { userId: user.id, error });
      return c.json(
        { error: "Failed to get account info", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Delete Account
  // ===========================================================================
  .delete("/", zValidator("json", deleteAccountSchema), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { deleteContainers, deleteRepositories } = c.req.valid("json");
    const userId = user.id;

    log.warn("Account deletion requested", { userId, deleteContainers, deleteRepositories });

    try {
      const results = {
        sandboxesDeleted: 0,
        chatSessionsArchived: 0,
        activityLogsAnonymized: 0,
        preferencesDeleted: false,
        userDeleted: false,
        errors: [] as string[],
      };

      // Step 1: Delete all sandboxes (containers + repos)
      const sandboxes = SandboxModel.listSandboxesByUserId(userId);
      const sandboxManager = getSandboxManager();

      for (const sandbox of sandboxes) {
        try {
          await sandboxManager.deleteSandbox(sandbox.id, {
            deleteRepo: deleteRepositories,
            removeVolumes: deleteContainers,
          });
          results.sandboxesDeleted++;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          log.error("Failed to delete sandbox during account deletion", { userId, sandboxId: sandbox.id, error: errMsg });
          results.errors.push(`Failed to delete sandbox ${sandbox.id}: ${errMsg}`);
        }
      }

      // Step 2: Archive all chat sessions (they'll be deleted when sandbox is deleted via CASCADE)
      // No additional action needed - handled by foreign key CASCADE

      // Step 3: Anonymize activity logs (preserve for analytics)
      try {
        results.activityLogsAnonymized = anonymizeUserLogs(userId);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to anonymize activity logs", { userId, error: errMsg });
        results.errors.push(`Failed to anonymize activity logs: ${errMsg}`);
      }

      // Step 4: Delete user preferences
      try {
        results.preferencesDeleted = deleteUserPreferences(userId);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to delete preferences", { userId, error: errMsg });
        results.errors.push(`Failed to delete preferences: ${errMsg}`);
      }

      // Step 5: Delete OpenCode config
      try {
        db.run("DELETE FROM user_opencode_files WHERE user_id = ?", [userId]);
        db.run("DELETE FROM user_opencode_config WHERE user_id = ?", [userId]);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to delete OpenCode config", { userId, error: errMsg });
        results.errors.push(`Failed to delete OpenCode config: ${errMsg}`);
      }

      // Step 6: Delete provider credentials
      try {
        db.run("DELETE FROM provider_credentials WHERE user_id = ?", [userId]);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to delete provider credentials", { userId, error: errMsg });
        results.errors.push(`Failed to delete provider credentials: ${errMsg}`);
      }

      // Step 7: Delete user account (Better Auth tables - this will CASCADE)
      try {
        // Delete sessions first
        db.run("DELETE FROM session WHERE userId = ?", [userId]);
        // Delete accounts (OAuth connections)
        db.run("DELETE FROM account WHERE userId = ?", [userId]);
        // Delete user
        db.run("DELETE FROM user WHERE id = ?", [userId]);
        results.userDeleted = true;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to delete user account", { userId, error: errMsg });
        results.errors.push(`Failed to delete user account: ${errMsg}`);
      }

      log.info("Account deletion complete", { userId, results });

      return c.json({
        success: results.userDeleted,
        message: results.userDeleted 
          ? "Account successfully deleted" 
          : "Account deletion partially complete with errors",
        results,
      });
    } catch (error) {
      log.error("Account deletion failed", { userId, error });
      return c.json(
        { error: "Account deletion failed", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Export User Data (GDPR compliance)
  // ===========================================================================
  .get("/data-export", async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;

    try {
      // Gather all user data
      const sandboxes = SandboxModel.listSandboxesByUserId(userId);
      
      // Get chat sessions for each sandbox
      const chatData = [];
      for (const sandbox of sandboxes) {
        const sessions = ChatSessionModel.listChatSessionsBySandboxId(sandbox.id, { limit: 1000 });
        chatData.push({
          sandboxId: sandbox.id,
          sandboxName: sandbox.name,
          sessions: sessions.map(s => ({
            id: s.id,
            title: s.title,
            messageCount: s.messageCount,
            createdAt: s.createdAt,
          })),
        });
      }

      // Get OpenCode config
      const opencodeConfig = db.query<{ settings: string; agents_md: string }, [string]>(
        "SELECT settings, agents_md FROM user_opencode_config WHERE user_id = ?"
      ).get(userId);

      // Get OpenCode files
      const opcodeFiles = db.query<{ type: string; name: string; extension: string; content: string }, [string]>(
        "SELECT type, name, extension, content FROM user_opencode_files WHERE user_id = ?"
      ).all(userId);

      // Get preferences
      const preferences = db.query<{ theme_mode: string; theme_preset: string }, [string]>(
        "SELECT theme_mode, theme_preset FROM user_preferences WHERE user_id = ?"
      ).get(userId);

      const exportData = {
        exportedAt: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        sandboxes: sandboxes.map(s => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          status: s.status,
          createdAt: s.createdAt,
        })),
        chatHistory: chatData,
        opencodeConfig: opencodeConfig ? {
          settings: JSON.parse(opencodeConfig.settings || "{}"),
          agentsMd: opencodeConfig.agents_md,
        } : null,
        opencodeFiles: opcodeFiles,
        preferences: preferences,
      };

      c.header("Content-Type", "application/json");
      c.header("Content-Disposition", `attachment; filename="user-data-${userId}.json"`);
      
      return c.json(exportData);
    } catch (error) {
      log.error("Failed to export user data", { userId, error });
      return c.json(
        { error: "Failed to export user data", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });
