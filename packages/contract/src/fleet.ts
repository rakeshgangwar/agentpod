import { z } from "zod";

// ─── FleetAgent ───────────────────────────────────────────────────────────────

/**
 * A single adopted station joined with its parent node.
 * Produced by GET /api/fleet/agents; consumed by the Overview home table.
 */
export const FleetAgent = z.object({
  /** stations.id */
  stationId: z.string(),
  /** nodes.id */
  nodeId: z.string(),
  /** nodes.name */
  nodeName: z.string(),
  /** stations.display_name */
  agentName: z.string(),
  /** stations.harness */
  harness: z.string(),
  /** stations.kind */
  kind: z.string(),
  /** nodes.status — node reachability only (true running/idle = P2) */
  nodeStatus: z.enum(["online", "offline"]),
  /** nodes.agent_version — null when the node has never reported a version */
  agentVersion: z.string().nullable(),
  /** latest published release tag (from GitHub, cached 1 h) */
  latestVersion: z.string().nullable(),
  /** true when agentVersion and latestVersion are both non-null and differ */
  updateAvailable: z.boolean(),
  /** stations.capabilities */
  capabilities: z.array(z.string()),
  /** stations.workspace_path */
  workspacePath: z.string().nullable(),
});
export type FleetAgent = z.infer<typeof FleetAgent>;

// ─── FleetStats ───────────────────────────────────────────────────────────────

/**
 * Aggregate counts for the stat-band at the top of the Overview home.
 * Produced by GET /api/fleet/stats (and embedded in GET /api/fleet/agents).
 */
export const FleetStats = z.object({
  nodes: z.object({
    total: z.number().int().nonnegative(),
    online: z.number().int().nonnegative(),
  }),
  agents: z.object({
    total: z.number().int().nonnegative(),
  }),
  /**
   * Number of adopted agents (stations) whose node is running an outdated
   * agent binary.  Counts agents (not distinct nodes) so the console can
   * show "N agents need an update".
   */
  updatesAvailable: z.number().int().nonnegative(),
});
export type FleetStats = z.infer<typeof FleetStats>;
