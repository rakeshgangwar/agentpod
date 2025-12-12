/**
 * Activity Log API Routes
 * 
 * Provides access to user activity history for audit trail.
 * 90-day retention, then anonymized archive.
 * 
 * Endpoints:
 * - GET    /api/users/me/activity           List activity logs
 * - GET    /api/users/me/activity/stats     Get activity statistics
 * - GET    /api/users/me/activity/export    Export as JSON/CSV
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as ActivityLogModel from "../models/activity-log.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("activity-routes");

// =============================================================================
// Validation Schemas
// =============================================================================

const listActivitySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  action: z.string().optional(),
});

const statsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const exportSchema = z.object({
  format: z.enum(["json", "csv"]).optional().default("json"),
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
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

export const activityRoutes = new Hono()
  // ===========================================================================
  // List User Activity
  // ===========================================================================
  .get("/", zValidator("query", listActivitySchema), async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { limit, offset, action } = c.req.valid("query");

    try {
      const activities = ActivityLogModel.listActivityLogsByUserId(userId, {
        limit,
        offset,
        action: action as ActivityLogModel.ActivityAction | undefined,
      });

      const total = ActivityLogModel.countActivityLogsByUserId(userId);

      return c.json({
        activities,
        pagination: {
          total,
          limit,
          offset,
        },
      });
    } catch (error) {
      log.error("Failed to list activity", { userId, error });
      return c.json(
        { error: "Failed to list activity", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Activity Statistics
  // ===========================================================================
  .get("/stats", zValidator("query", statsSchema), async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { startDate, endDate } = c.req.valid("query");

    try {
      const stats = ActivityLogModel.getActivityStats({
        startDate,
        endDate,
      });

      const total = ActivityLogModel.countActivityLogsByUserId(userId);

      return c.json({
        total,
        byAction: stats,
        period: {
          start: startDate ?? "all time",
          end: endDate ?? "now",
        },
      });
    } catch (error) {
      log.error("Failed to get activity stats", { userId, error });
      return c.json(
        { error: "Failed to get activity stats", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Export Activity
  // ===========================================================================
  .get("/export", zValidator("query", exportSchema), async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { format, limit } = c.req.valid("query");

    try {
      const activities = ActivityLogModel.listActivityLogsByUserId(userId, { limit });

      if (format === "csv") {
        // Generate CSV
        const headers = ["id", "action", "entityType", "entityId", "createdAt"];
        const csvRows = [
          headers.join(","),
          ...activities.map((a) =>
            [
              a.id,
              a.action,
              a.entityType ?? "",
              a.entityId ?? "",
              a.createdAt,
            ]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(",")
          ),
        ];

        c.header("Content-Type", "text/csv");
        c.header("Content-Disposition", `attachment; filename="activity-${userId}.csv"`);
        return c.body(csvRows.join("\n"));
      }

      // Default: JSON
      c.header("Content-Type", "application/json");
      c.header("Content-Disposition", `attachment; filename="activity-${userId}.json"`);
      return c.json({
        exportedAt: new Date().toISOString(),
        userId,
        count: activities.length,
        activities,
      });
    } catch (error) {
      log.error("Failed to export activity", { userId, error });
      return c.json(
        { error: "Failed to export activity", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Activity for Entity
  // ===========================================================================
  .get("/entity/:entityType/:entityId", async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const entityType = c.req.param("entityType");
    const entityId = c.req.param("entityId");

    try {
      const activities = ActivityLogModel.listActivityLogsByEntity(
        entityType as ActivityLogModel.EntityType,
        entityId,
        { limit: 50 }
      );

      // Filter to only show user's own activities
      const userActivities = activities.filter((a) => a.userId === userId);

      return c.json({
        entityType,
        entityId,
        activities: userActivities,
      });
    } catch (error) {
      log.error("Failed to get entity activity", { userId, entityType, entityId, error });
      return c.json(
        { error: "Failed to get entity activity", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });
