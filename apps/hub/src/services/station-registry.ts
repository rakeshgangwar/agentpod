/**
 * Station Registry — persist / query adopted stations.
 *
 * "Adopting" a station is the act of saving a detected remote station to the
 * local DB so the fleet console can track it across reconnects.
 *
 * All functions are scoped to (userId, ...) so callers can never access another
 * user's data by providing a different nodeId or stationId.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { stations } from "../db/schema/stations";
import type { DetectedStation } from "@agentpod/contract";

export type StationRow = typeof stations.$inferSelect;

// ─── adoptStations ────────────────────────────────────────────────────────────

/**
 * Upsert the requested station keys from a freshly detected list.
 *
 * Algorithm
 * ─────────
 * 1. Filter detected[] to the requested keys.
 * 2. First pass: upsert all rows with parentStationId = null.
 *    The ON CONFLICT target is the unique (nodeId, stationKey) index, so this
 *    is idempotent — re-adopting a station refreshes its metadata.
 * 3. Second pass: resolve each parentKey → parentStationId by looking up
 *    all rows already persisted for this (userId, nodeId).  This covers the
 *    case where a parent was adopted in a previous call.
 * 4. Return the final rows for the requested keys.
 */
export async function adoptStations(
  userId: string,
  nodeId: string,
  keys: string[],
  detected: DetectedStation[]
): Promise<StationRow[]> {
  const toAdopt = detected.filter((d) => keys.includes(d.key));
  if (toAdopt.length === 0) return [];

  // ── First pass: upsert all rows without parent links ─────────────────────
  for (const station of toAdopt) {
    await db
      .insert(stations)
      .values({
        id: `station_${crypto.randomUUID()}`,
        userId,
        nodeId,
        harness: station.harness,
        stationKey: station.key,
        kind: station.kind,
        displayName: station.displayName,
        workspacePath: station.workspacePath ?? null,
        capabilities: station.capabilities as string[],
        matrixId: station.matrixId ?? null,
        parentStationId: null,
        adoptedAt: new Date(),
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [stations.nodeId, stations.stationKey],
        set: {
          harness: station.harness,
          kind: station.kind,
          displayName: station.displayName,
          workspacePath: station.workspacePath ?? null,
          capabilities: station.capabilities as string[],
          matrixId: station.matrixId ?? null,
          adoptedAt: new Date(),
        },
      });
  }

  // ── Second pass: resolve parent links ─────────────────────────────────────
  // Load ALL adopted rows for this node (including those from prior calls)
  // so that a parent adopted in an earlier request is also resolved.
  const allRows = await db
    .select({ id: stations.id, stationKey: stations.stationKey })
    .from(stations)
    .where(and(eq(stations.userId, userId), eq(stations.nodeId, nodeId)));

  const keyToId = new Map(allRows.map((r) => [r.stationKey, r.id]));

  for (const station of toAdopt) {
    if (!station.parentKey) continue;
    const parentId = keyToId.get(station.parentKey);
    if (!parentId) continue;
    const ownId = keyToId.get(station.key);
    if (!ownId) continue;
    await db
      .update(stations)
      .set({ parentStationId: parentId })
      .where(eq(stations.id, ownId));
  }

  // ── Return the final rows for the requested keys ──────────────────────────
  const allAdopted = await db
    .select()
    .from(stations)
    .where(and(eq(stations.userId, userId), eq(stations.nodeId, nodeId)));

  return allAdopted.filter((r) => keys.includes(r.stationKey));
}

// ─── listAdopted ─────────────────────────────────────────────────────────────

/** All adopted stations for a specific (user, node) pair. */
export async function listAdopted(
  userId: string,
  nodeId: string
): Promise<StationRow[]> {
  return db
    .select()
    .from(stations)
    .where(and(eq(stations.userId, userId), eq(stations.nodeId, nodeId)));
}

// ─── getStation ───────────────────────────────────────────────────────────────

/** Single station by id, scoped to the user. Returns null if not found or not owned. */
export async function getStation(
  userId: string,
  stationId: string
): Promise<StationRow | null> {
  const rows = await db
    .select()
    .from(stations)
    .where(and(eq(stations.id, stationId), eq(stations.userId, userId)));
  return rows[0] ?? null;
}

// ─── unadopt ─────────────────────────────────────────────────────────────────

/** Remove a station row. Silently succeeds if already gone or not owned. */
export async function unadopt(
  userId: string,
  stationId: string
): Promise<void> {
  await db
    .delete(stations)
    .where(and(eq(stations.id, stationId), eq(stations.userId, userId)));
}
