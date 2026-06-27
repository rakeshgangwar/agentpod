import { eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { nodes } from "../db/schema/nodes";
import type { NodeSummary } from "@agentpod/contract";

export async function listNodes(userId: string): Promise<NodeSummary[]> {
  const rows = await db.select().from(nodes).where(eq(nodes.userId, userId));
  return rows.map((n) => ({
    id: n.id,
    name: n.name,
    hostname: n.hostname,
    os: n.os,
    arch: n.arch,
    cpuCount: n.cpuCount,
    status: n.status,
    lastSeenAt: n.lastSeenAt ? n.lastSeenAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
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
