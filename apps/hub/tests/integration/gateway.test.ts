/**
 * Integration Test: Node Gateway WebSocket
 *
 * Tests that a node-agent can connect to the gateway, is marked online,
 * and is marked offline when it disconnects.
 *
 * Uses the local Docker test-postgres (agentpod-test-postgres on localhost:5434).
 * DATABASE_URL MUST be set before any src/ modules are imported — the import
 * of this setup module is hoisted first so drizzle picks up the right URL.
 */

// ─── Set env vars BEFORE any src/ imports (ESM evaluation order) ───────────
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://agentpod:agentpod-dev-password@localhost:5434/agentpod";
process.env.NODE_ENV = "test";

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";

// src/ imports — DB URL is already set above
import { rawSql } from "../../src/db/drizzle";
import { createTestUser } from "../helpers/database";
import {
  mintEnrollmentToken,
  enrollNode,
} from "../../src/services/enrollment";
import { listNodes } from "../../src/services/node-registry";
import { gatewayRoutes } from "../../src/routes/gateway";
import { websocket } from "../../src/ws";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal test server (avoids importing full index.ts which has many side effects)
// ─────────────────────────────────────────────────────────────────────────────

const testApp = new Hono().route("/public/nodes", gatewayRoutes);

const TEST_USER_ID = "test-user-gateway-001";

// ─────────────────────────────────────────────────────────────────────────────
// Setup & Teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await createTestUser({
    id: TEST_USER_ID,
    email: "gateway-test@example.com",
    name: "Gateway Test User",
  });
});

afterAll(async () => {
  try {
    await rawSql`DELETE FROM nodes              WHERE user_id = ${TEST_USER_ID}`;
    await rawSql`DELETE FROM enrollment_tokens  WHERE user_id = ${TEST_USER_ID}`;
    await rawSql`DELETE FROM "user"             WHERE id      = ${TEST_USER_ID}`;
  } catch {
    // Ignore cleanup errors
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test("a node that connects to the gateway shows online via listNodes", async () => {
  // Start the minimal test app on a random port to avoid conflicts
  const server = Bun.serve({ fetch: testApp.fetch, websocket, port: 0 });

  try {
    // Enroll a node so we have valid credentials
    const { token } = await mintEnrollmentToken(TEST_USER_ID);
    const { nodeId, nodeSecret } = await enrollNode(token, {
      hostname: "ws-host",
      os: "linux",
      arch: "amd64",
      cpuCount: 2,
    });

    // Connect the node to the gateway
    const ws = new WebSocket(
      `ws://localhost:${server.port}/public/nodes/gateway`,
      {
        headers: { Authorization: `Bearer ${nodeId}:${nodeSecret}` },
      } as RequestInit & { headers: Record<string, string> }
    );

    await new Promise<void>((res, rej) => {
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error("WebSocket connection error"));
    });

    // Give the onOpen handler time to call setNodeStatus
    await new Promise((r) => setTimeout(r, 200));

    // Node should be online
    const list = await listNodes(TEST_USER_ID);
    const node = list.find((n) => n.id === nodeId);
    expect(node?.status).toBe("online");

    // Close the connection — node should go offline
    ws.close();
    await new Promise((r) => setTimeout(r, 200));

    const listAfterClose = await listNodes(TEST_USER_ID);
    const nodeAfterClose = listAfterClose.find((n) => n.id === nodeId);
    expect(nodeAfterClose?.status).toBe("offline");
  } finally {
    server.stop(true);
  }
});

test("a node with invalid credentials is rejected", async () => {
  // Enroll a real node so auth machinery is exercised, then connect with a
  // deliberately WRONG secret — this proves the rejection is credential-based,
  // not a missing-node-id shortcut.
  const server = Bun.serve({ fetch: testApp.fetch, websocket, port: 0 });

  try {
    const { token } = await mintEnrollmentToken(TEST_USER_ID);
    const { nodeId } = await enrollNode(token, {
      hostname: "bad-creds-host",
      os: "linux",
      arch: "amd64",
      cpuCount: 1,
    });

    const ws = new WebSocket(
      `ws://localhost:${server.port}/public/nodes/gateway`,
      {
        // Valid nodeId, deliberately wrong secret
        headers: { Authorization: `Bearer ${nodeId}:totally-wrong-secret` },
      } as RequestInit & { headers: Record<string, string> }
    );

    let closeCode: number | null = null;
    await new Promise<void>((res, rej) => {
      ws.onclose = (e) => {
        closeCode = e.code;
        res();
      };
      ws.onopen = () => {
        ws.close();
        rej(new Error("connection should have been rejected but was accepted"));
      };
    });

    // Server calls ws.close(1008, "unauthorized"); Bun's WS client normalises
    // the server-sent 1008 to 1000 on the receiving end (a Bun quirk), so we
    // accept either.  The unconditional assertion still proves the connection
    // was terminated — the hardened onopen handler above is what proves no
    // successful open ever happened.
    expect([1000, 1008]).toContain(closeCode);
  } finally {
    server.stop(true);
  }
});

test("heartbeat keeps node online and receives ack", async () => {
  const server = Bun.serve({ fetch: testApp.fetch, websocket, port: 0 });

  try {
    const { token } = await mintEnrollmentToken(TEST_USER_ID);
    const { nodeId, nodeSecret } = await enrollNode(token, {
      hostname: "hb-host",
      os: "linux",
      arch: "amd64",
      cpuCount: 1,
    });

    const ws = new WebSocket(
      `ws://localhost:${server.port}/public/nodes/gateway`,
      {
        headers: { Authorization: `Bearer ${nodeId}:${nodeSecret}` },
      } as RequestInit & { headers: Record<string, string> }
    );

    await new Promise<void>((res, rej) => {
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error("WebSocket connection error"));
    });

    await new Promise((r) => setTimeout(r, 100));

    // Send a heartbeat and await the ack
    const ackPromise = new Promise<unknown>((res) => {
      ws.onmessage = (e) => res(JSON.parse(String(e.data)));
    });
    ws.send(JSON.stringify({ type: "heartbeat", ts: Date.now() }));
    const ack = await ackPromise;
    expect((ack as { type: string }).type).toBe("ack");

    ws.close();
  } finally {
    server.stop(true);
  }
});
