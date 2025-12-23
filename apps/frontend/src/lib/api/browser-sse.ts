/**
 * Browser-native SSE client for OpenCode events using EventSource API.
 * Replaces Tauri Rust SSE proxy. Other APIs continue through Tauri.
 */

import { getAuthApiUrl } from "../stores/auth.svelte";
import { authGetToken } from "./tauri";

export type SSEStatus = "connecting" | "connected" | "disconnected" | "error";

export interface BrowserSSEClientOptions {
  onEvent: (event: SSEOpenCodeEvent) => void;
  onStatus?: (status: SSEStatus, error?: string) => void;
}

export interface SSEOpenCodeEvent {
  type: string;
  properties: Record<string, unknown>;
}

export interface LegacyOpenCodeEvent {
  eventType: string;
  data: {
    type: string;
    properties: Record<string, unknown>;
  };
}

const OPENCODE_EVENT_TYPES = [
  "session.created",
  "session.updated",
  "session.status",
  "session.idle",
  "session.error",
  "session.deleted",
  "session.compacted",
  "session.diff",
  "message.updated",
  "message.part.updated",
  "message.removed",
  "message.part.removed",
  "permission.updated",
  "permission.replied",
  "file.edited",
  "file.watcher.updated",
  "server.connected",
  "server.heartbeat",
  "server.instance.disposed",
  "vcs.branch.updated",
  "pty.created",
  "pty.updated",
  "pty.exited",
  "pty.deleted",
  "todo.updated",
  "lsp.client.diagnostics",
  "lsp.updated",
] as const;

export class BrowserSSEClient {
  private eventSource: EventSource | null = null;
  private sandboxId: string;
  private options: BrowserSSEClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50;
  private isManuallyDisconnected = false;

  constructor(sandboxId: string, options: BrowserSSEClientOptions) {
    this.sandboxId = sandboxId;
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.eventSource) {
      console.warn("[BrowserSSE] Already connected, ignoring");
      return;
    }

    this.isManuallyDisconnected = false;
    const apiUrl = getAuthApiUrl();
    
    if (!apiUrl) {
      console.error("[BrowserSSE] No API URL configured");
      this.options.onStatus?.("error", "No API URL configured");
      return;
    }

    const token = await authGetToken();
    if (!token) {
      console.error("[BrowserSSE] No auth token available");
      this.options.onStatus?.("error", "No auth token available");
      return;
    }

    const sseUrl = `${apiUrl}/api/v2/sandboxes/${this.sandboxId}/opencode/event?token=${encodeURIComponent(token)}`;
    
    console.log("[BrowserSSE] Connecting to:", apiUrl + "/api/v2/sandboxes/" + this.sandboxId + "/opencode/event");
    this.options.onStatus?.("connecting");

    try {
      this.eventSource = new EventSource(sseUrl, { withCredentials: true });

      this.eventSource.onopen = () => {
        console.log("[BrowserSSE] Connected to", this.sandboxId);
        this.reconnectAttempts = 0;
        this.options.onStatus?.("connected");
      };

      this.eventSource.onmessage = (e) => {
        this.handleEventData(e.data, "message");
      };

      OPENCODE_EVENT_TYPES.forEach((eventType) => {
        this.eventSource!.addEventListener(eventType, (e: Event) => {
          const messageEvent = e as MessageEvent;
          this.handleEventData(messageEvent.data, eventType);
        });
      });

      this.eventSource.onerror = (e) => {
        if (!this.isManuallyDisconnected) {
          console.warn("[BrowserSSE] Connection error, browser will auto-reconnect", e);
          this.options.onStatus?.("disconnected");
          
          this.reconnectAttempts++;
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("[BrowserSSE] Max reconnect attempts reached, giving up");
            this.disconnect();
            this.options.onStatus?.("error", "Max reconnect attempts reached");
          }
        }
      };

    } catch (err) {
      console.error("[BrowserSSE] Failed to create EventSource:", err);
      this.options.onStatus?.("error", err instanceof Error ? err.message : "Unknown error");
    }
  }

  private handleEventData(data: string, eventType: string): void {
    try {
      const parsed = JSON.parse(data);
      
      const event: SSEOpenCodeEvent = {
        type: parsed.type || eventType,
        properties: parsed.properties || parsed,
      };

      console.debug("[BrowserSSE] Event:", event.type);
      this.options.onEvent(event);
      
    } catch (err) {
      console.warn("[BrowserSSE] Failed to parse event data:", data.slice(0, 100), err);
    }
  }

  disconnect(): void {
    this.isManuallyDisconnected = true;
    
    if (this.eventSource) {
      console.log("[BrowserSSE] Disconnecting from", this.sandboxId);
      this.eventSource.close();
      this.eventSource = null;
      this.options.onStatus?.("disconnected");
    }
  }

  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  get readyState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED;
  }
}

export function toLegacyFormat(event: SSEOpenCodeEvent): LegacyOpenCodeEvent {
  return {
    eventType: event.type,
    data: {
      type: event.type,
      properties: event.properties,
    },
  };
}

export async function createBrowserSSEClient(
  sandboxId: string,
  onEvent: (event: SSEOpenCodeEvent) => void,
  onStatus?: (status: SSEStatus, error?: string) => void
): Promise<BrowserSSEClient> {
  const client = new BrowserSSEClient(sandboxId, { onEvent, onStatus });
  await client.connect();
  return client;
}
