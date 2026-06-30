/**
 * Fleet service — aggregate read across all adopted stations + their nodes.
 *
 * Produces the data for GET /api/fleet/agents and GET /api/fleet/stats.
 *
 * All state comes from a single `stations ⋈ nodes` Drizzle join + the cached
 * getLatestAgentVersion() call — no gateway round-trips.
 *
 * The query function and version fetcher are injectable via `FleetDeps` so
 * tests can run without a live database.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { nodes } from "../db/schema/nodes";
import { stations } from "../db/schema/stations";
import { getLatestAgentVersion } from "./agent-version";
import type { FleetAgent, FleetStats } from "@agentpod/contract";

// ─── Internal raw-row type ────────────────────────────────────────────────────

/**
 * Shape returned by the Drizzle join before version annotation.
 * Matches the selected columns exactly.
 */
export type RawFleetRow = {
  stationId: string;
  nodeId: string;
  nodeName: string;
  agentName: string;
  harness: string;
  kind: string;
  nodeStatus: "online" | "offline";
  agentVersion: string | null;
  capabilities: string[] | null;
  workspacePath: string | null;
};

// ─── Deps type (for injection) ────────────────────────────────────────────────

export type FleetDeps = {
  /**
   * Override the version resolver (e.g. to return a fixed value in tests).
   * Defaults to getLatestAgentVersion().
   */
  latestVersionFn?: () => Promise<string | null>;
  /**
   * Override the DB query (e.g. to return seeded rows in tests).
   * Defaults to the real Drizzle join.
   */
  queryFn?: (userId: string) => Promise<RawFleetRow[]>;
};

// ─── Pure helpers (exported for unit tests) ───────────────────────────────────

/**
 * Annotate raw fleet rows with version info (latestVersion + updateAvailable).
 * Pure function — no DB or network access.
 */
export function annotateFleetRows(
  rows: RawFleetRow[],
  latestVersion: string | null
): FleetAgent[] {
  return rows.map((r) => ({
    stationId: r.stationId,
    nodeId: r.nodeId,
    nodeName: r.nodeName,
    agentName: r.agentName,
    harness: r.harness,
    kind: r.kind,
    nodeStatus: r.nodeStatus,
    agentVersion: r.agentVersion,
    capabilities: r.capabilities ?? [],
    workspacePath: r.workspacePath,
    latestVersion,
    updateAvailable:
      r.agentVersion != null &&
      latestVersion != null &&
      r.agentVersion !== latestVersion,
  }));
}

/**
 * Compute FleetStats from an already-annotated agent list.
 * Pure function — exported for unit tests.
 *
 * Note: nodes.total counts DISTINCT nodeIds in the adopted-station list
 * (not the raw nodes table), so it reflects the nodes that actually have
 * at least one adopted agent.  updatesAvailable counts agents (stations),
 * not distinct nodes, so the console can show "N agents need an update".
 */
export function computeFleetStats(agents: FleetAgent[]): FleetStats {
  // Aggregate per-node status from the agent rows.
  const nodeOnline = new Map<string, boolean>();
  for (const a of agents) {
    // If ANY station on a node sees the node as online, it's online.
    // (In practice all rows for a node share the same status snapshot.)
    nodeOnline.set(a.nodeId, a.nodeStatus === "online");
  }

  return {
    nodes: {
      total: nodeOnline.size,
      online: [...nodeOnline.values()].filter(Boolean).length,
    },
    agents: { total: agents.length },
    updatesAvailable: agents.filter((a) => a.updateAvailable).length,
  };
}

// ─── Default DB query ─────────────────────────────────────────────────────────

/**
 * Real Drizzle join: adopted stations (all rows in the stations table are
 * adopted; there is no `adopted` boolean — presence in the table IS adoption)
 * inner-joined with their parent node, filtered by userId.
 */
async function defaultQueryFn(userId: string): Promise<RawFleetRow[]> {
  return db
    .select({
      stationId: stations.id,
      nodeId: nodes.id,
      nodeName: nodes.name,
      agentName: stations.displayName,
      harness: stations.harness,
      kind: stations.kind,
      nodeStatus: nodes.status,
      agentVersion: nodes.agentVersion,
      capabilities: stations.capabilities,
      workspacePath: stations.workspacePath,
    })
    .from(stations)
    .innerJoin(nodes, eq(stations.nodeId, nodes.id))
    .where(eq(stations.userId, userId));
}

// ─── Service factory ──────────────────────────────────────────────────────────

/**
 * Create a fleet service with optional dep overrides (for tests).
 *
 * Returns `{ listFleetAgents, getFleetStats }` scoped to a userId.
 */
export function createFleetService(deps?: FleetDeps) {
  const queryFn = deps?.queryFn ?? defaultQueryFn;
  const latestVersionFn = deps?.latestVersionFn ?? getLatestAgentVersion;

  /**
   * Return all adopted stations joined with their nodes, annotated with
   * latestVersion + updateAvailable.  Calls the version fetcher once per
   * invocation (the fetcher itself is cached module-level for 1 h).
   */
  async function listFleetAgents(userId: string): Promise<FleetAgent[]> {
    const [rows, latestVersion] = await Promise.all([
      queryFn(userId),
      latestVersionFn(),
    ]);
    return annotateFleetRows(rows, latestVersion);
  }

  /**
   * Aggregate counts derived from listFleetAgents.
   * updatesAvailable = number of agents (stations) with updateAvailable:true.
   */
  async function getFleetStats(userId: string): Promise<FleetStats> {
    const agents = await listFleetAgents(userId);
    return computeFleetStats(agents);
  }

  return { listFleetAgents, getFleetStats };
}

// ─── Default singleton (real DB + real version fetcher) ───────────────────────

const _defaultService = createFleetService();

/** List all adopted agents joined with node data for the given user. */
export const listFleetAgents = _defaultService.listFleetAgents;

/** Compute fleet aggregate stats for the given user. */
export const getFleetStats = _defaultService.getFleetStats;
