/**
 * Terminal WebSocket Routes
 *
 * Provides interactive terminal access to sandbox containers via WebSocket.
 * Uses dockerode's exec with hijack mode for bidirectional PTY communication.
 *
 * Endpoint:
 * - GET /api/v2/sandboxes/:id/terminal (WebSocket upgrade)
 */

import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { getSandboxManager } from "../services/sandbox-manager.ts";
import { createLogger } from "../utils/logger.ts";
import type { InteractiveExecSession } from "../services/orchestrator/types.ts";
import { auth } from "../auth/drizzle-auth.ts";
import { config } from "../config.ts";

const log = createLogger("terminal-routes");

// Create Bun WebSocket handler
const { upgradeWebSocket, websocket } = createBunWebSocket();

// Track active terminal sessions for cleanup
const activeSessions = new Map<string, InteractiveExecSession>();

/**
 * WebSocket message types
 */
interface ClientMessage {
  type: "input" | "resize";
  data?: string;
  cols?: number;
  rows?: number;
}

interface ServerMessage {
  type: "output" | "connected" | "exit" | "error";
  data?: string;
  shell?: string;
  code?: number;
  message?: string;
}

function sendMessage(ws: WSContext, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    log.error("Failed to send WebSocket message", { error: err });
  }
}

/**
 * Verify authentication for WebSocket connection
 * WebSocket upgrades don't go through normal middleware, so we check auth manually
 */
async function verifyAuth(headers: Headers): Promise<{ userId: string } | null> {
  // Try Better Auth session first
  try {
    const session = await auth.api.getSession({ headers });
    if (session) {
      log.debug("WebSocket auth via Better Auth", { userId: session.user.id });
      return { userId: session.user.id };
    }
  } catch (error) {
    log.debug("Better Auth session check failed for WebSocket", { error });
  }

  // Fall back to API key / Bearer token
  const authHeader = headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === config.auth.token) {
      log.debug("WebSocket auth via API key");
      return { userId: config.defaultUserId };
    }
  }

  return null;
}

/**
 * Terminal WebSocket route
 */
export const terminalRoutes = new Hono()
  .get(
    "/:id/terminal",
    upgradeWebSocket((c) => {
      const sandboxId = c.req.param("id");
      const requestHeaders = c.req.raw.headers;
      let session: InteractiveExecSession | null = null;
      let sessionId: string | null = null;

      return {
        async onOpen(_event, ws) {
          log.info("Terminal WebSocket opened", { sandboxId });

          // Verify authentication
          log.debug("Verifying auth with headers", { 
            hasAuthHeader: !!requestHeaders.get("Authorization"),
            hasCookie: !!requestHeaders.get("Cookie"),
          });
          const authResult = await verifyAuth(requestHeaders);
          if (!authResult) {
            log.warn("Terminal WebSocket auth failed", { sandboxId });
            sendMessage(ws, {
              type: "error",
              message: "Authentication required",
            });
            ws.close(1008, "Authentication required");
            return;
          }
          log.debug("Auth verified", { userId: authResult.userId });

          try {
            const manager = getSandboxManager();
            log.debug("Got sandbox manager", { sandboxId });

            // Verify sandbox exists and is running
            const sandbox = await manager.getSandbox(sandboxId);
            log.debug("Got sandbox", { sandboxId, found: !!sandbox, status: sandbox?.status });
            if (!sandbox) {
              sendMessage(ws, {
                type: "error",
                message: "Sandbox not found",
              });
              ws.close(1008, "Sandbox not found");
              return;
            }

            if (sandbox.status !== "running") {
              sendMessage(ws, {
                type: "error",
                message: `Sandbox is not running (status: ${sandbox.status})`,
              });
              ws.close(1008, "Sandbox not running");
              return;
            }

            log.debug("Starting interactive terminal session", { sandboxId });
            // Start interactive terminal session
            session = await manager.execInteractive(sandboxId, {
              cols: 80,
              rows: 24,
            });
            log.debug("Interactive session started", { sandboxId });

            // Generate session ID and store for cleanup
            sessionId = `${sandboxId}-${Date.now()}`;
            activeSessions.set(sessionId, session);

            // Get the shell that was detected
            log.debug("Detecting shell", { sandboxId });
            const shell = await manager.detectShell(sandboxId);
            log.debug("Shell detected", { sandboxId, shell });

            // Send connected message
            sendMessage(ws, {
              type: "connected",
              shell,
            });

            log.info("Terminal session started", { sandboxId, sessionId, shell });

            // Forward Docker stream output to WebSocket
            session.stream.on("data", (chunk: Buffer) => {
              sendMessage(ws, {
                type: "output",
                data: chunk.toString("utf-8"),
              });
            });

            session.stream.on("end", () => {
              log.info("Terminal stream ended", { sandboxId, sessionId });
              sendMessage(ws, {
                type: "exit",
                code: 0,
              });
              ws.close(1000, "Terminal session ended");
            });

            session.stream.on("error", (err: Error) => {
              log.error("Terminal stream error", { sandboxId, sessionId, error: err });
              sendMessage(ws, {
                type: "error",
                message: err.message,
              });
            });
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to start terminal";
            const errorStack = err instanceof Error ? err.stack : undefined;
            log.error("Failed to start terminal session", { 
              sandboxId, 
              error: errorMessage,
              stack: errorStack,
            });
            sendMessage(ws, {
              type: "error",
              message: errorMessage,
            });
            ws.close(1011, "Failed to start terminal");
          }
        },

        async onMessage(event, ws) {
          if (!session) {
            // Session not ready yet - this can happen if messages arrive
            // before onOpen finishes setting up the session.
            // Just ignore the message rather than sending an error.
            log.debug("Ignoring message - session not initialized yet", { sandboxId });
            return;
          }

          try {
            const message: ClientMessage =
              typeof event.data === "string"
                ? JSON.parse(event.data)
                : JSON.parse(event.data.toString());

            switch (message.type) {
              case "input":
                if (message.data) {
                  // Write input to Docker exec stream
                  session.stream.write(message.data);
                }
                break;

              case "resize":
                if (message.cols && message.rows) {
                  await session.resize(message.cols, message.rows);
                  log.debug("Terminal resized", {
                    sandboxId,
                    cols: message.cols,
                    rows: message.rows,
                  });
                }
                break;

              default:
                log.warn("Unknown message type", { type: (message as { type: string }).type });
            }
          } catch (err) {
            log.error("Failed to process WebSocket message", { error: err });
            sendMessage(ws, {
              type: "error",
              message: "Invalid message format",
            });
          }
        },

        onClose(_event, ws) {
          log.info("Terminal WebSocket closed", { sandboxId, sessionId });

          // Cleanup session
          if (session) {
            session.close();
          }
          if (sessionId) {
            activeSessions.delete(sessionId);
          }
        },

        onError(event, ws) {
          log.error("Terminal WebSocket error", { sandboxId, sessionId, error: event });

          // Cleanup session
          if (session) {
            session.close();
          }
          if (sessionId) {
            activeSessions.delete(sessionId);
          }
        },
      };
    })
  );

/**
 * Export the WebSocket handler for Bun.serve()
 */
export { websocket as terminalWebsocket };

/**
 * Cleanup all active terminal sessions
 * Called on server shutdown
 */
export function cleanupTerminalSessions(): void {
  log.info("Cleaning up terminal sessions", { count: activeSessions.size });
  for (const [sessionId, session] of activeSessions) {
    try {
      session.close();
    } catch (err) {
      log.error("Failed to close terminal session", { sessionId, error: err });
    }
  }
  activeSessions.clear();
}
