import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { EnrollRequest } from "@agentpod/contract";
import { enrollNode } from "../services/enrollment";
import { listNodes } from "../services/node-registry";

/**
 * Authenticated routes for node management.
 * Mounted at /api/nodes (under the authMiddleware guard).
 *
 * GET /api/nodes → list nodes belonging to the current user.
 */
export const nodeRoutes = new Hono().get("/", async (c) =>
  c.json(await listNodes(c.get("user").id))
);

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
