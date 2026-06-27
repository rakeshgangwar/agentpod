/**
 * Authenticated station routes.
 *
 * All routes verify that the target node belongs to c.get("user").id before
 * brokering or querying.  Station ownership is implicit: a station row always
 * carries userId, and the registry functions scope every query to that userId.
 *
 * Mounted at /api in index.ts so paths here are relative to /api:
 *   GET    /nodes/:nodeId/detected          → detect + mark adopted
 *   POST   /nodes/:nodeId/stations/adopt    → adopt selected keys
 *   GET    /nodes/:nodeId/stations          → list adopted (flat)
 *   DELETE /stations/:stationId             → unadopt
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { nodes } from "../db/schema/nodes";
import * as broker from "../services/broker";
import { VERB_RESULTS } from "@agentpod/contract";
import {
  adoptStations,
  listAdopted,
  unadopt,
  getStation,
} from "../services/station-registry";

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Returns the node row if it belongs to userId, otherwise null. */
async function requireNodeOwnership(userId: string, nodeId: string) {
  const rows = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
  return rows[0] ?? null;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export const stationRoutes = new Hono()
  /**
   * GET /api/nodes/:nodeId/detected
   *
   * Sends a "detect" RPC to the live node via the broker.  Each returned
   * DetectedStation is annotated with adopted:true/false based on whether a
   * stations row already exists for (nodeId, stationKey).
   *
   * Returns 404 if the node is not owned by the requesting user.
   * Returns 502 if the node is offline, times out, or returns invalid data.
   */
  .get("/nodes/:nodeId/detected", async (c) => {
    const userId = c.get("user").id;
    const nodeId = c.req.param("nodeId");

    if (!(await requireNodeOwnership(userId, nodeId))) {
      return c.json({ error: "Not Found" }, 404);
    }

    const result = await broker.request(nodeId, "detect", {}, { timeoutMs: 10_000 });
    if (!result.ok) {
      return c.json({ error: result.error ?? "detect failed" }, 502);
    }

    const parsed = VERB_RESULTS.detect.safeParse(result.data);
    if (!parsed.success) {
      return c.json({ error: "invalid detect response from node" }, 502);
    }

    const adoptedRows = await listAdopted(userId, nodeId);
    const adoptedKeys = new Set(adoptedRows.map((s) => s.stationKey));

    return c.json(
      parsed.data.map((s) => ({ ...s, adopted: adoptedKeys.has(s.key) }))
    );
  })
  /**
   * POST /api/nodes/:nodeId/stations/adopt
   * Body: { keys: string[] }
   *
   * Re-detects server-side (for trust), then upserts the requested keys into
   * the stations table.  Returns the newly/previously adopted rows.
   */
  .post(
    "/nodes/:nodeId/stations/adopt",
    zValidator("json", z.object({ keys: z.array(z.string().min(1)) })),
    async (c) => {
      const userId = c.get("user").id;
      const nodeId = c.req.param("nodeId");
      const { keys } = c.req.valid("json");

      if (!(await requireNodeOwnership(userId, nodeId))) {
        return c.json({ error: "Not Found" }, 404);
      }

      const result = await broker.request(nodeId, "detect", {}, { timeoutMs: 10_000 });
      if (!result.ok) {
        return c.json({ error: result.error ?? "detect failed" }, 502);
      }

      const parsed = VERB_RESULTS.detect.safeParse(result.data);
      if (!parsed.success) {
        return c.json({ error: "invalid detect response from node" }, 502);
      }

      const rows = await adoptStations(userId, nodeId, keys, parsed.data);
      return c.json(rows);
    }
  )
  /**
   * GET /api/nodes/:nodeId/stations
   *
   * Returns the flat list of adopted stations for the given node.
   * The console builds the tree from parentStationId.
   */
  .get("/nodes/:nodeId/stations", async (c) => {
    const userId = c.get("user").id;
    const nodeId = c.req.param("nodeId");

    if (!(await requireNodeOwnership(userId, nodeId))) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json(await listAdopted(userId, nodeId));
  })
  /**
   * DELETE /api/stations/:stationId
   *
   * Removes a station row.  Ownership is verified via getStation (which scopes
   * by userId).  Returns 404 if the station does not exist or belongs to a
   * different user.
   */
  .delete("/stations/:stationId", async (c) => {
    const userId = c.get("user").id;
    const stationId = c.req.param("stationId");

    const station = await getStation(userId, stationId);
    if (!station) {
      return c.json({ error: "Not Found" }, 404);
    }

    await unadopt(userId, stationId);
    return new Response(null, { status: 204 });
  });
