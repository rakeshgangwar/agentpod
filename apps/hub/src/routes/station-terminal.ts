/**
 * Station Terminal WebSocket Route
 *
 * Bridges a browser WebSocket connection to a node-agent's PTY session.
 * Endpoint: GET /api/stations/:id/terminal (WebSocket upgrade)
 *
 * Auth: Better Auth session cookie, resolved via the authMiddleware that runs
 *       before all /api/* routes and stores the user in c.get("user").
 *       Closes with 1008 if the user is unauthenticated (anonymous).
 *
 * Protocol (hub ↔ client):
 *   Client → hub: { t: "input",  data: string }
 *                 { t: "resize", cols: number, rows: number }
 *   Hub → client: { t: "data",  data: string }   base64 PTY output chunk
 *                 { t: "exit" }                   session ended (eof or error)
 *
 * cols/rows at open: defaults 80×24 are used for term.open.  The client
 * should send a { t: "resize" } message immediately after connecting so the
 * PTY matches the viewport — the node will resize on the next frame.
 *
 * On client disconnect: sends a cancel frame to detach from the stream
 * (DETACH — leaves the PTY session alive on the node).  Does NOT send
 * term.close so reconnecting clients can re-attach.
 */

import { Hono } from "hono";
import { upgradeWebSocket } from "../ws";
import * as broker from "../services/broker";
import { getStation } from "../services/station-registry";
import { connectionManager } from "../services/connection-manager";
import { recordAudit } from "../services/audit";
import type { AuthUser } from "../auth/middleware";

export const stationTerminalRoutes = new Hono().get(
  "/stations/:id/terminal",
  upgradeWebSocket((c) => {
    // Capture context values at upgrade time — c is available here but NOT
    // inside the async onOpen callbacks (Hono closes over it for us).
    const user = c.get("user") as AuthUser | undefined;
    const stationId = c.req.param("id");

    // Mutable state shared across onOpen / onMessage / onClose.
    let nodeId: string | null = null;
    let attachCancel: (() => void) | null = null;
    let attachId: string | null = null;
    let auditDone:
      | ((result: "ok" | "error", error?: string) => Promise<void>)
      | null = null;

    return {
      async onOpen(_e, ws) {
        // ── 1. Authenticate ───────────────────────────────────────────────
        if (!user || user.id === "anonymous") {
          ws.close(1008, "Unauthorized");
          return;
        }

        // ── 2. Resolve station → node ─────────────────────────────────────
        const station = await getStation(user.id, stationId);
        if (!station) {
          ws.send(JSON.stringify({ t: "exit" }));
          ws.close(1011, "station not found");
          return;
        }

        // ── 3. Verify node is reachable ───────────────────────────────────
        if (!connectionManager.isOnline(station.nodeId)) {
          ws.send(JSON.stringify({ t: "exit" }));
          ws.close(1011, "node offline");
          return;
        }
        nodeId = station.nodeId;

        // ── 4. Audit (no-op until P2 Task 6) ─────────────────────────────
        const audit = await recordAudit({
          userId: user.id,
          nodeId: station.nodeId,
          stationKey: station.stationKey,
          verb: "term.open",
          params: {},
        });
        auditDone = audit.done.bind(audit);

        // ── 5. term.open — open a PTY session on the node ────────────────
        const openResult = await broker.request(station.nodeId, "term.open", {
          key: station.stationKey,
          cols: 80,
          rows: 24,
        });

        if (!openResult.ok) {
          ws.send(JSON.stringify({ t: "exit" }));
          ws.close(1011, openResult.error ?? "term.open failed");
          await auditDone("error", openResult.error);
          auditDone = null;
          return;
        }

        const { sessionId } = openResult.data as { sessionId: string };

        // ── 6. term.attach — subscribe to PTY output stream ───────────────
        const { cancel, id } = broker.stream(
          station.nodeId,
          "term.attach",
          { sessionId },
          (_seq, chunk, eof) => {
            if (chunk !== null) {
              try {
                ws.send(JSON.stringify({ t: "data", data: chunk }));
              } catch {
                // client already disconnected
              }
            }
            if (eof) {
              try {
                ws.send(JSON.stringify({ t: "exit" }));
                ws.close();
              } catch {
                // already closed
              }
              if (auditDone) {
                auditDone("ok").catch(() => {});
                auditDone = null;
              }
            }
          }
        );

        attachCancel = cancel;
        attachId = id;
      },

      onMessage(evt, _ws) {
        if (!nodeId || !attachId) return;

        let msg: unknown;
        try {
          msg = JSON.parse(String(evt.data));
        } catch {
          return;
        }
        if (!msg || typeof msg !== "object") return;
        const m = msg as Record<string, unknown>;

        if (m.t === "input" && typeof m.data === "string") {
          broker.sendFrame(nodeId, { type: "input", id: attachId, data: m.data });
        } else if (
          m.t === "resize" &&
          typeof m.cols === "number" &&
          typeof m.rows === "number"
        ) {
          broker.sendFrame(nodeId, {
            type: "resize",
            id: attachId,
            cols: m.cols,
            rows: m.rows,
          });
        }
      },

      async onClose() {
        // DETACH: cancel the attach stream so the node stops streaming to this
        // client.  The PTY session remains alive on the node for reconnects.
        if (attachCancel) {
          attachCancel();
          attachCancel = null;
        }
        // Finalise the audit record if onOpen completed but eof never arrived.
        if (auditDone) {
          await auditDone("ok").catch(() => {});
          auditDone = null;
        }
      },
    };
  })
);
