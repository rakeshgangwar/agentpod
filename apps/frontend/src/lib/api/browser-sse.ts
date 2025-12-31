/**
 * Browser-native SSE client for OpenCode events using EventSource API.
 * Uses async iterator pattern for clean event consumption.
 */

import { getAuthApiUrl } from "../stores/auth.svelte";
import { authGetToken } from "./tauri";

export type SSEStatus = "connecting" | "connected" | "disconnected" | "error";

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

export interface SSESubscription {
  stream: AsyncIterable<SSEOpenCodeEvent>;
  close: () => void;
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

export class SSEClient {
  private sandboxId: string;

  constructor(sandboxId: string) {
    this.sandboxId = sandboxId;
  }

  async subscribe(options?: {
    onStatus?: (status: SSEStatus, error?: string) => void;
  }): Promise<SSESubscription> {
    const apiUrl = getAuthApiUrl();
    
    if (!apiUrl) {
      throw new Error("No API URL configured");
    }

    const token = await authGetToken();
    if (!token) {
      throw new Error("No auth token available");
    }

    const sseUrl = `${apiUrl}/api/v2/sandboxes/${this.sandboxId}/opencode/event?token=${encodeURIComponent(token)}`;
    
    console.log("[SSE] Connecting to:", this.sandboxId);
    options?.onStatus?.("connecting");

    const eventSource = new EventSource(sseUrl, { withCredentials: true });
    
    // Queue for buffering events until consumed
    const eventQueue: SSEOpenCodeEvent[] = [];
    let resolveNext: ((value: IteratorResult<SSEOpenCodeEvent>) => void) | null = null;
    let closed = false;
    let connected = false;

    const pushEvent = (event: SSEOpenCodeEvent) => {
      if (closed) return;
      
      if (resolveNext) {
        resolveNext({ value: event, done: false });
        resolveNext = null;
      } else {
        eventQueue.push(event);
      }
    };

    const handleEventData = (data: string, eventType: string): void => {
      try {
        const parsed = JSON.parse(data);
        
        const event: SSEOpenCodeEvent = {
          type: parsed.type || eventType,
          properties: parsed.properties || parsed,
        };

        console.debug("[SSE] Event:", event.type);
        pushEvent(event);
        
      } catch (err) {
        console.warn("[SSE] Failed to parse event:", data.slice(0, 100), err);
      }
    };

    eventSource.onopen = () => {
      console.log("[SSE] Connected to", this.sandboxId);
      connected = true;
      options?.onStatus?.("connected");
    };

    eventSource.onmessage = (e) => {
      handleEventData(e.data, "message");
    };

    OPENCODE_EVENT_TYPES.forEach((eventType) => {
      eventSource.addEventListener(eventType, (e: Event) => {
        const messageEvent = e as MessageEvent;
        handleEventData(messageEvent.data, eventType);
      });
    });

    eventSource.onerror = () => {
      if (!closed) {
        console.warn("[SSE] Connection error, browser will auto-reconnect");
        if (connected) {
          options?.onStatus?.("disconnected");
          connected = false;
        }
      }
    };

    const close = () => {
      if (closed) return;
      closed = true;
      
      console.log("[SSE] Closing connection to", this.sandboxId);
      eventSource.close();
      options?.onStatus?.("disconnected");
      
      // Resolve any pending iterator with done
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as SSEOpenCodeEvent, done: true });
        resolveNext = null;
      }
    };

    const stream: AsyncIterable<SSEOpenCodeEvent> = {
      [Symbol.asyncIterator](): AsyncIterator<SSEOpenCodeEvent> {
        return {
          async next(): Promise<IteratorResult<SSEOpenCodeEvent>> {
            if (closed && eventQueue.length === 0) {
              return { value: undefined as unknown as SSEOpenCodeEvent, done: true };
            }

            // Return buffered event if available
            if (eventQueue.length > 0) {
              return { value: eventQueue.shift()!, done: false };
            }

            // Wait for next event
            return new Promise((resolve) => {
              resolveNext = resolve;
            });
          },
        };
      },
    };

    return { stream, close };
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

export function createSSEClient(sandboxId: string): SSEClient {
  return new SSEClient(sandboxId);
}

/** @deprecated Use SSEClient with async iterator pattern instead */
export class BrowserSSEClient {
  private sandboxId: string;
  private options: { onEvent: (event: SSEOpenCodeEvent) => void; onStatus?: (status: SSEStatus, error?: string) => void };
  private closeRef: (() => void) | null = null;

  constructor(sandboxId: string, options: { onEvent: (event: SSEOpenCodeEvent) => void; onStatus?: (status: SSEStatus, error?: string) => void }) {
    this.sandboxId = sandboxId;
    this.options = options;
  }

  async connect(): Promise<void> {
    const client = new SSEClient(this.sandboxId);
    const subscription = await client.subscribe({ onStatus: this.options.onStatus });
    this.closeRef = subscription.close;

    (async () => {
      for await (const event of subscription.stream) {
        this.options.onEvent(event);
      }
    })();
  }

  disconnect(): void {
    this.closeRef?.();
    this.closeRef = null;
  }

  get isConnected(): boolean {
    return this.closeRef !== null;
  }
}
