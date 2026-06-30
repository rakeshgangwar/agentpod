/**
 * Unit Tests: POST /api/nodes/:id/update (self-update slice 3)
 *
 * Verifies that the route:
 *   1. Calls broker.request(nodeId, "update", {}) and returns its result.
 *   2. Reflects an offline-node error from the broker.
 *
 * No database or live WebSocket required — the broker is injected via the
 * createNodeRoutes() factory.
 */

import { test, expect } from "bun:test";
import { Hono } from "hono";
import { createNodeRoutes } from "../../src/routes/nodes";
import type { AuthUser } from "../../src/auth/middleware";

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_USER_ID = "user-unit-001";
const TEST_NODE_ID = "node-unit-abc123";

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal Hono test app that mounts createNodeRoutes() under
 * /api/nodes, with a fake auth middleware that stamps TEST_USER_ID on
 * every request.
 */
function makeTestApp(
  mockRequest: (
    nodeId: string,
    verb: string,
    params: unknown
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>
) {
  const routes = createNodeRoutes({ request: mockRequest });

  return new Hono()
    .use("/api/nodes/*", async (c, next) => {
      c.set("user", {
        id: TEST_USER_ID,
        authType: "api_key",
      } satisfies AuthUser);
      return next();
    })
    .route("/api/nodes", routes);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("POST /api/nodes/:id/update → calls broker.request(nodeId, 'update', {}) and returns its result", async () => {
  const calls: Array<[string, string, unknown]> = [];

  const mockRequest = async (
    nodeId: string,
    verb: string,
    params: unknown
  ): Promise<{ ok: boolean; updating?: boolean; tag?: string }> => {
    calls.push([nodeId, verb, params]);
    return { ok: true, updating: true, tag: "v0.1.3" };
  };

  const testApp = makeTestApp(mockRequest);

  const res = await testApp.request(`/api/nodes/${TEST_NODE_ID}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  expect(res.status).toBe(200);

  // Broker must have been called exactly once with the right args
  expect(calls).toHaveLength(1);
  const [calledNodeId, calledVerb, calledParams] = calls[0]!;
  expect(calledNodeId).toBe(TEST_NODE_ID);
  expect(calledVerb).toBe("update");
  expect(calledParams).toEqual({});

  // The broker result is returned verbatim
  const body = (await res.json()) as {
    ok: boolean;
    updating?: boolean;
    tag?: string;
  };
  expect(body.ok).toBe(true);
  expect(body.updating).toBe(true);
  expect(body.tag).toBe("v0.1.3");
});

test("POST /api/nodes/:id/update → offline node (broker returns error) is reflected", async () => {
  const mockRequest = async (
    _nodeId: string,
    _verb: string,
    _params: unknown
  ): Promise<{ ok: boolean; error?: string }> => ({
    ok: false,
    error: "node offline",
  });

  const testApp = makeTestApp(mockRequest);

  const res = await testApp.request(`/api/nodes/${TEST_NODE_ID}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  expect(res.status).toBe(200);

  const body = (await res.json()) as { ok: boolean; error?: string };
  expect(body.ok).toBe(false);
  expect(body.error).toBe("node offline");
});
