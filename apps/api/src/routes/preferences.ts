/**
 * User Preferences API Routes
 * 
 * Provides access to user app settings stored on the server.
 * Enables bidirectional sync across devices.
 * 
 * Endpoints:
 * - GET    /api/users/me/preferences       Get preferences
 * - PUT    /api/users/me/preferences       Replace preferences
 * - PATCH  /api/users/me/preferences       Partial update
 * - GET    /api/users/me/preferences/version  Get version for sync
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as UserPreferencesModel from "../models/user-preferences.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("preferences-routes");

// =============================================================================
// Validation Schemas
// =============================================================================

const updatePreferencesSchema = z.object({
  themeMode: z.enum(["light", "dark", "system"]).optional(),
  themePreset: z.string().optional(),
  autoRefreshInterval: z.number().min(5).max(300).optional(),
  inAppNotifications: z.boolean().optional(),
  systemNotifications: z.boolean().optional(),
  defaultResourceTierId: z.string().optional(),
  defaultFlavorId: z.string().optional(),
  defaultAddonIds: z.array(z.string()).optional(),
  defaultAgentId: z.string().optional(),
});

const syncCheckSchema = z.object({
  localVersion: z.coerce.number().min(0),
});

// =============================================================================
// Helper: Get user ID from context
// =============================================================================

function getUserId(c: { get: (key: string) => unknown }): string | null {
  // Auth middleware sets 'user' directly in context
  const user = c.get("user") as { id?: string } | undefined;
  return user?.id && user.id !== "anonymous" ? user.id : null;
}

// =============================================================================
// Routes
// =============================================================================

export const preferencesRoutes = new Hono()
  // ===========================================================================
  // Get User Preferences
  // ===========================================================================
  .get("/", async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const preferences = await UserPreferencesModel.getOrCreateUserPreferences(userId);
      
      return c.json({
        preferences,
      });
    } catch (error) {
      log.error("Failed to get preferences", { userId, error });
      return c.json(
        { error: "Failed to get preferences", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Replace User Preferences (PUT)
  // ===========================================================================
  .put("/", zValidator("json", updatePreferencesSchema), async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const input = c.req.valid("json");

    try {
      // Ensure preferences exist
      await UserPreferencesModel.getOrCreateUserPreferences(userId);
      
      // Update with all provided values
      const preferences = await UserPreferencesModel.updateUserPreferences(userId, input);
      
      if (!preferences) {
        return c.json({ error: "Failed to update preferences" }, 500);
      }

      log.info("Updated user preferences (PUT)", { userId, fields: Object.keys(input) });

      return c.json({
        preferences,
        message: "Preferences updated",
      });
    } catch (error) {
      log.error("Failed to update preferences", { userId, error });
      return c.json(
        { error: "Failed to update preferences", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Partial Update User Preferences (PATCH)
  // ===========================================================================
  .patch("/", zValidator("json", updatePreferencesSchema), async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const input = c.req.valid("json");

    try {
      // Ensure preferences exist
      await UserPreferencesModel.getOrCreateUserPreferences(userId);
      
      // Update only provided values
      const preferences = await UserPreferencesModel.updateUserPreferences(userId, input);
      
      if (!preferences) {
        return c.json({ error: "Failed to update preferences" }, 500);
      }

      log.info("Updated user preferences (PATCH)", { userId, fields: Object.keys(input) });

      return c.json({
        preferences,
        message: "Preferences updated",
      });
    } catch (error) {
      log.error("Failed to update preferences", { userId, error });
      return c.json(
        { error: "Failed to update preferences", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Settings Version (for sync)
  // ===========================================================================
  .get("/version", async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const version = await UserPreferencesModel.getSettingsVersion(userId);
      
      return c.json({
        version,
        userId,
      });
    } catch (error) {
      log.error("Failed to get settings version", { userId, error });
      return c.json(
        { error: "Failed to get settings version", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Check Sync Status
  // ===========================================================================
  .get("/sync", zValidator("query", syncCheckSchema), async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { localVersion } = c.req.valid("query");

    try {
      const serverVersion = await UserPreferencesModel.getSettingsVersion(userId);
      const needsSync = await UserPreferencesModel.isOutOfSync(userId, localVersion);
      
      return c.json({
        localVersion,
        serverVersion,
        needsSync,
        message: needsSync ? "Server has newer preferences" : "Preferences are in sync",
      });
    } catch (error) {
      log.error("Failed to check sync status", { userId, error });
      return c.json(
        { error: "Failed to check sync status", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Reset Preferences to Defaults
  // ===========================================================================
  .delete("/", async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      // Delete existing preferences
      await UserPreferencesModel.deleteUserPreferences(userId);
      
      // Create fresh defaults
      const preferences = await UserPreferencesModel.createUserPreferences(userId);
      
      log.info("Reset user preferences to defaults", { userId });

      return c.json({
        preferences,
        message: "Preferences reset to defaults",
      });
    } catch (error) {
      log.error("Failed to reset preferences", { userId, error });
      return c.json(
        { error: "Failed to reset preferences", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });
