/**
 * Unit Tests: broker (request/stream correlation)
 *
 * Stubs connectionManager.send to capture outgoing messages.
 * No DB required — purely in-process.
 */

import { test, expect } from "bun:test";
import * as broker from "../../src/services/broker";
import { connectionManager } from "../../src/services/connection-manager";
import type { GatewayServerMessage } from "@agentpod/contract";

// ─── Stub helpers ──────────────────────────────────────────────────────────────

function makeSendStub(onlineNodeId: string) {
  const msgs: GatewayServerMessage[] = [];
  const origSend = connectionManager.send.bind(connectionManager);

  (connectionManager as { send: typeof connectionManager.send }).send = (
    nodeId: string,
    msg: GatewayServerMessage
  ): boolean => {
    msgs.push(msg);
    return nodeId === onlineNodeId;
  };

  const restore = () => {
    (connectionManager as { send: typeof connectionManager.send }).send =
      origSend;
  };

  return { msgs, restore };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test("request sends a {type:req} and resolves on matching res", async () => {
  const { msgs, restore } = makeSendStub("node-1");
  try {
    const promise = broker.request("node-1", "detect", {});

    // The outgoing req must be captured synchronously
    expect(msgs).toHaveLength(1);
    const sent = msgs[0];
    expect(sent.type).toBe("req");
    if (sent.type !== "req") throw new Error("expected req msg");

    // Simulate node replying
    broker.handleNodeMessage("node-1", {
      type: "res",
      id: sent.id,
      ok: true,
      data: [{ key: "station-1" }],
    });

    const result = await promise;
    expect(result).toEqual({ ok: true, data: [{ key: "station-1" }] });
  } finally {
    restore();
  }
});

test("request resolves with {ok:false, error:'timeout'} after timeoutMs", async () => {
  const { msgs, restore } = makeSendStub("node-1");
  try {
    const promise = broker.request("node-1", "detect", {}, { timeoutMs: 50 });

    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("req");

    // Do NOT call handleNodeMessage — let the timer fire
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe("timeout");
  } finally {
    restore();
  }
});

test("request resolves immediately with {ok:false, error:'node offline'} when node not registered", async () => {
  // Override send to always return false (node offline)
  const origSend = connectionManager.send.bind(connectionManager);
  (connectionManager as { send: typeof connectionManager.send }).send = (
    _nodeId,
    _msg
  ) => false;
  try {
    const result = await broker.request("node-offline", "detect", {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offline/i);
  } finally {
    (connectionManager as { send: typeof connectionManager.send }).send =
      origSend;
  }
});

test("stream delivers chunks via onChunk and auto-drops handler on eof", async () => {
  const { msgs, restore } = makeSendStub("node-1");
  const received: Array<{ seq: number; chunk: string | null; eof: boolean }> =
    [];

  try {
    broker.stream(
      "node-1",
      "logs.tail",
      { key: "k1", follow: true },
      (seq, chunk, eof) => {
        received.push({ seq, chunk, eof });
      }
    );

    expect(msgs).toHaveLength(1);
    const sent = msgs[0];
    expect(sent.type).toBe("req");
    if (sent.type !== "req") throw new Error("expected req msg");
    const id = sent.id;

    broker.handleNodeMessage("node-1", {
      type: "stream",
      id,
      seq: 0,
      chunk: "line1",
      eof: false,
    });
    broker.handleNodeMessage("node-1", {
      type: "stream",
      id,
      seq: 1,
      chunk: "line2",
      eof: false,
    });
    broker.handleNodeMessage("node-1", {
      type: "stream",
      id,
      seq: 2,
      chunk: null,
      eof: true,
    });

    expect(received).toHaveLength(3);
    expect(received[2]).toEqual({ seq: 2, chunk: null, eof: true });

    // Handler auto-dropped after eof — further messages are silently ignored
    broker.handleNodeMessage("node-1", {
      type: "stream",
      id,
      seq: 3,
      chunk: "ghost",
      eof: false,
    });
    expect(received).toHaveLength(3);
  } finally {
    restore();
  }
});

test("cancel() sends {type:cancel} and drops the stream handler", async () => {
  const { msgs, restore } = makeSendStub("node-1");
  const received: unknown[] = [];

  try {
    const { cancel } = broker.stream(
      "node-1",
      "logs.tail",
      { key: "k1", follow: true },
      (seq, chunk, eof) => {
        received.push({ seq, chunk, eof });
      }
    );

    const sent = msgs[0];
    if (sent.type !== "req") throw new Error("expected req msg");
    const id = sent.id;

    cancel();

    // Second outgoing msg should be cancel
    expect(msgs).toHaveLength(2);
    const cancelMsg = msgs[1];
    expect(cancelMsg.type).toBe("cancel");
    if (cancelMsg.type !== "cancel") throw new Error("expected cancel msg");
    expect(cancelMsg.id).toBe(id);

    // Handler dropped — further stream messages are ignored
    broker.handleNodeMessage("node-1", {
      type: "stream",
      id,
      seq: 0,
      chunk: "ignored",
      eof: false,
    });
    expect(received).toHaveLength(0);

    // Double-cancel is a no-op (does not send another cancel)
    cancel();
    expect(msgs).toHaveLength(2);
  } finally {
    restore();
  }
});
