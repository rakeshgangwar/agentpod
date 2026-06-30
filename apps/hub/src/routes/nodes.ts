import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { EnrollRequest } from "@agentpod/contract";
import { enrollNode } from "../services/enrollment";
import { listNodes } from "../services/node-registry";
import { request as brokerRequest } from "../services/broker";

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestFn = (
  nodeId: string,
  verb: string,
  params: unknown
) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

// ─── Factory (allows broker injection for unit tests) ─────────────────────────

/**
 * Create the authenticated node management routes.
 *
 * An optional `deps.request` override replaces the real broker so tests can
 * assert the RPC call without needing a live WebSocket connection.
 */
export function createNodeRoutes(deps?: { request?: RequestFn }) {
  const _request: RequestFn = deps?.request ?? brokerRequest;

  return (
    new Hono()
      /**
       * GET /api/nodes → list nodes belonging to the current user.
       */
      .get("/", async (c) => c.json(await listNodes(c.get("user").id)))
      /**
       * POST /api/nodes/:id/update
       *
       * Sends an "update" RPC to the node via the broker.  The node
       * self-updates in-process and exits so systemd/Restart=always can
       * bring it back on the new binary.
       *
       * Returns the raw broker result:
       *   { ok: true,  updating: true, tag: "<latest>" }  — update kicked off
       *   { ok: false, error: "node offline" }             — node not connected
       *   { ok: false, error: "timeout" }                  — no response in 15 s
       */
      .post("/:id/update", async (c) => {
        const nodeId = c.req.param("id");
        const r = await _request(nodeId, "update", {});
        return c.json(r);
      })
  );
}

/**
 * Authenticated routes for node management.
 * Mounted at /api/nodes (under the authMiddleware guard).
 */
export const nodeRoutes = createNodeRoutes();

/**
 * Public (unauthenticated) node enrollment route.
 * Mounted at /public/nodes (OUTSIDE the /api/* auth guard).
 *
 * POST /public/nodes/enroll
 *   Body: { token: string; hostInfo: HostInfo }
 *   Returns: { nodeId: string; nodeSecret: string }
 */
export const nodeEnrollRoutes = new Hono().post(
  "/enroll",
  zValidator("json", EnrollRequest),
  async (c) => {
    const { token, hostInfo } = c.req.valid("json");
    try {
      return c.json(await enrollNode(token, hostInfo));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 401);
    }
  }
);
