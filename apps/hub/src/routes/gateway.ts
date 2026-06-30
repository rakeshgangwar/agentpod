/**
 * Node Gateway WebSocket Route
 *
 * Node-agents dial in over WSS using long-term credentials.
 * Endpoint: GET /public/nodes/gateway (WebSocket upgrade)
 *
 * Auth: Authorization: Bearer <nodeId>:<nodeSecret>
 * On open:       register + set online
 * On heartbeat:  refresh online + ack
 * On close:      unregister + set offline
 */

import { Hono } from "hono";
import { GatewayClientMessage } from "@agentpod/contract";
import { verifyNodeCredential } from "../services/enrollment";
import { setNodeStatus, setNodeAgentVersion } from "../services/node-registry";
import { connectionManager } from "../services/connection-manager";
import { handleNodeMessage, dropNode } from "../services/broker";
import { upgradeWebSocket } from "../ws";
import { autoAdoptProvisionedHarness } from "../services/runtime-autoadopt";

// Node connects with `Authorization: Bearer <nodeId>:<nodeSecret>`.
export const gatewayRoutes = new Hono().get(
  "/gateway",
  upgradeWebSocket((c) => {
    const auth = c.req.header("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/, "");
    const colonIdx = token.indexOf(":");
    const nodeId = colonIdx !== -1 ? token.slice(0, colonIdx) : token;
    const nodeSecret = colonIdx !== -1 ? token.slice(colonIdx + 1) : "";
    let authed: string | null = null;

    return {
      async onOpen(_e, ws) {
        if (
          !nodeId ||
          !nodeSecret ||
          !(await verifyNodeCredential(nodeId, nodeSecret))
        ) {
          ws.close(1008, "unauthorized");
          return;
        }
        authed = nodeId;
        connectionManager.register(nodeId, (m) => ws.send(JSON.stringify(m)));
        await setNodeStatus(nodeId, "online");

        // Auto-adopt provisioned harness station once the node can answer detect.
        // Fire-and-forget with retries — never blocks or throws into the gateway.
        void (async () => {
          for (const delay of [1500, 4000, 9000]) {
            await new Promise((res) => setTimeout(res, delay));
            try {
              await autoAdoptProvisionedHarness(nodeId);
            } catch {
              // autoAdoptProvisionedHarness never throws, but guard anyway.
            }
          }
        })();
      },

      async onMessage(evt, _ws) {
        if (!authed) return;
        let parsed;
        try {
          parsed = GatewayClientMessage.safeParse(JSON.parse(String(evt.data)));
        } catch {
          return;
        }
        if (!parsed.success) return;
        if (parsed.data.type === "hello") {
          const version = parsed.data.version ?? null;
          await setNodeAgentVersion(authed, version);
        } else if (parsed.data.type === "heartbeat") {
          await setNodeStatus(authed, "online");
          connectionManager.send(authed, { type: "ack", ts: Date.now() });
        } else if (
          parsed.data.type === "res" ||
          parsed.data.type === "stream"
        ) {
          handleNodeMessage(authed, parsed.data);
        }
      },

      async onClose() {
        if (authed) {
          dropNode(authed);
          connectionManager.unregister(authed);
          await setNodeStatus(authed, "offline");
        }
      },
    };
  })
);
