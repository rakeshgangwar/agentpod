/**
 * Fleet Activity Route
 *
 * GET /api/activity
 *
 * Returns the caller's most recent station_audit rows across all their
 * stations (fleet-wide), newest first, capped at 30 rows.
 *
 * Rows are already sanitized at insert time (paramsSummary only —
 * no raw content or tokens). No additional scrubbing is needed here.
 *
 * Auth: Better Auth session cookie / X-Test-User-Id in tests.
 * Owner-scoping: filter by userId only — no station ownership check.
 *
 * Mounted at /api in index.ts → resolves to GET /api/activity.
 */

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { stationAudit } from "../db/schema/audit";
import type { AuthUser } from "../auth/middleware";

const FLEET_ACTIVITY_LIMIT = 30;

export const fleetActivityRoutes = new Hono().get("/activity", async (c) => {
  // ── 1. Authenticate ────────────────────────────────────────────────────
  const user = c.get("user") as AuthUser | undefined;
  if (!user || user.id === "anonymous") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // ── 2. Fetch fleet-wide audit rows for this user ────────────────────────
  const rows = await db
    .select()
    .from(stationAudit)
    .where(eq(stationAudit.userId, user.id))
    .orderBy(desc(stationAudit.createdAt))
    .limit(FLEET_ACTIVITY_LIMIT);

  return c.json(rows);
});
