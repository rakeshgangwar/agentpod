/**
 * Station Activity Route
 *
 * GET /api/stations/:id/activity
 *
 * Returns the most recent station_audit rows for the given station,
 * newest first, capped at 200 rows.
 *
 * Auth: Better Auth session cookie / X-Test-User-Id in tests.
 * Ownership: the station must belong to the authenticated user.
 *
 * Mounted at /api in index.ts.
 */

import { Hono } from "hono";
import { desc, and, eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { stationAudit } from "../db/schema/audit";
import { getStation } from "../services/station-registry";
import type { AuthUser } from "../auth/middleware";

const ACTIVITY_LIMIT = 200;

export const stationActivityRoutes = new Hono().get(
  "/stations/:id/activity",
  async (c) => {
    // ── 1. Authenticate ───────────────────────────────────────────────
    const user = c.get("user") as AuthUser | undefined;
    if (!user || user.id === "anonymous") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // ── 2. Verify ownership ───────────────────────────────────────────
    const stationId = c.req.param("id");
    const station = await getStation(user.id, stationId);
    if (!station) {
      return c.json({ error: "Not Found" }, 404);
    }

    // ── 3. Fetch audit rows ───────────────────────────────────────────
    const rows = await db
      .select()
      .from(stationAudit)
      .where(
        and(
          eq(stationAudit.userId, user.id),
          eq(stationAudit.nodeId, station.nodeId),
          eq(stationAudit.stationKey, station.stationKey)
        )
      )
      .orderBy(desc(stationAudit.createdAt))
      .limit(ACTIVITY_LIMIT);

    return c.json(rows);
  }
);
