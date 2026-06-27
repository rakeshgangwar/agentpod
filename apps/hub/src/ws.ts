/**
 * Shared Bun WebSocket instance.
 *
 * Bun requires a single `websocket` handler on the server export.
 * All WebSocket routes (terminal, gateway, etc.) must share the same
 * `upgradeWebSocket` helper that was created from the same
 * `createBunWebSocket()` call.
 *
 * Import `upgradeWebSocket` in any route that needs WS upgrades.
 * Import `websocket` in `index.ts` for the Bun.serve export.
 */
import { createBunWebSocket } from "hono/bun";

export const { upgradeWebSocket, websocket } = createBunWebSocket();
