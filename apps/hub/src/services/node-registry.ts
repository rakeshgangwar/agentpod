import { eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { nodes, provisionedRuntimes } from "../db/schema/nodes";
import type { NodeSummary } from "@agentpod/contract";

export type NodeWithProvisioning = NodeSummary & {
  provisioned: { runtimeId: string; provider: string } | null;
};

export async function listNodes(userId: string): Promise<NodeWithProvisioning[]> {
  // Left-join provisioned_runtimes on node_id so each node carries its
  // provisioned-runtime info (null if the node was attached manually).
  const rows = await db
    .select({
      id: nodes.id,
      name: nodes.name,
      hostname: nodes.hostname,
      os: nodes.os,
      arch: nodes.arch,
      cpuCount: nodes.cpuCount,
      agentVersion: nodes.agentVersion,
      status: nodes.status,
      lastSeenAt: nodes.lastSeenAt,
      createdAt: nodes.createdAt,
      runtimeId: provisionedRuntimes.id,
      runtimeProvider: provisionedRuntimes.provider,
    })
    .from(nodes)
    .leftJoin(provisionedRuntimes, eq(provisionedRuntimes.nodeId, nodes.id))
    .where(eq(nodes.userId, userId));

  return rows.map((n) => ({
    id: n.id,
    name: n.name,
    hostname: n.hostname,
    os: n.os,
    arch: n.arch,
    cpuCount: n.cpuCount,
    agentVersion: n.agentVersion ?? null,
    status: n.status,
    lastSeenAt: n.lastSeenAt ? n.lastSeenAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
    provisioned:
      n.runtimeId && n.runtimeProvider
        ? { runtimeId: n.runtimeId, provider: n.runtimeProvider }
        : null,
  }));
}

export async function setNodeStatus(
  nodeId: string,
  status: "online" | "offline"
) {
  await db
    .update(nodes)
    .set({ status, lastSeenAt: new Date() })
    .where(eq(nodes.id, nodeId));
}

export async function setNodeAgentVersion(
  nodeId: string,
  agentVersion: string | null
) {
  await db
    .update(nodes)
    .set({ agentVersion })
    .where(eq(nodes.id, nodeId));
}
