/**
 * OpenCode SSE Event Types
 * 
 * Re-exports event types from the OpenCode SDK and adds utility functions
 * for working with SSE events in the frontend.
 * 
 * @see https://github.com/opencode-ai/opencode for SDK documentation
 */

// =============================================================================
// Re-export all event types from the SDK
// =============================================================================

export type {
  // Session events
  EventSessionCreated,
  EventSessionUpdated,
  EventSessionStatus,
  EventSessionIdle,
  EventSessionError,
  EventSessionDeleted,
  EventSessionCompacted,
  EventSessionDiff,
  // Message events
  EventMessageUpdated,
  EventMessageRemoved,
  EventMessagePartUpdated,
  EventMessagePartRemoved,
  // Permission events
  EventPermissionUpdated,
  EventPermissionReplied,
  // File events
  EventFileEdited,
  EventFileWatcherUpdated,
  // Server events
  EventServerConnected,
  EventServerInstanceDisposed,
  // VCS events
  EventVcsBranchUpdated,
  // PTY events
  EventPtyCreated,
  EventPtyUpdated,
  EventPtyExited,
  EventPtyDeleted,
  // Other events
  EventCommandExecuted,
  EventInstallationUpdated,
  EventInstallationUpdateAvailable,
  EventLspClientDiagnostics,
  EventLspUpdated,
  EventTodoUpdated,
  // TUI events
  EventTuiPromptAppend,
  EventTuiCommandExecute,
  EventTuiToastShow,
  // Union type
  Event as OpenCodeEvent,
  GlobalEvent,
  // Shared types used in events
  FileDiff,
  Session,
  SessionStatus,
  Permission,
  Pty,
  Todo,
  // Error types
  ProviderAuthError,
  UnknownError,
  MessageOutputLengthError,
  MessageAbortedError,
  ApiError,
  // Message types used in events
  UserMessage,
  AssistantMessage,
  Message as MessageInfo,
} from "@opencode-ai/sdk/client";

// =============================================================================
// Event Type Enum (for type-safe event handling)
// =============================================================================

/**
 * All possible OpenCode SSE event types as string literals
 */
export type OpenCodeEventType =
  // Session events (8)
  | "session.created"
  | "session.updated"
  | "session.status"
  | "session.idle"
  | "session.error"
  | "session.deleted"
  | "session.compacted"
  | "session.diff"
  // Message events (4)
  | "message.updated"
  | "message.part.updated"
  | "message.removed"
  | "message.part.removed"
  // Permission events (2)
  | "permission.updated"
  | "permission.replied"
  // File events (2)
  | "file.edited"
  | "file.watcher.updated"
  // Server events (4)
  | "server.connected"
  | "server.heartbeat"
  | "server.instance.disposed"
  | "error"
  // VCS events (1)
  | "vcs.branch.updated"
  // PTY/Terminal events (4)
  | "pty.created"
  | "pty.updated"
  | "pty.exited"
  | "pty.deleted"
  // Tool events (2)
  | "tool.execute.before"
  | "tool.execute.after"
  // Other events (5)
  | "command.executed"
  | "installation.updated"
  | "installation.update-available"
  | "lsp.client.diagnostics"
  | "lsp.updated"
  | "todo.updated"
  // TUI events (3)
  | "tui.prompt.append"
  | "tui.command.execute"
  | "tui.toast.show";

// =============================================================================
// Session Status Types (convenience re-exports)
// =============================================================================

export type SessionStatusType = "idle" | "busy" | "retry";

// =============================================================================
// Raw SSE Event (as received from Tauri)
// =============================================================================

/**
 * Raw SSE event as received from the Tauri backend stream.
 * The shape may differ slightly from the SDK types because
 * it comes through the Rust -> JS bridge.
 */
export interface RawSSEEvent {
  eventType?: string;
  data?: {
    type?: string;
    properties?: Record<string, unknown>;
  } | unknown;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Helper to extract event type from raw SSE event
 */
export function getEventType(event: RawSSEEvent): OpenCodeEventType | string {
  if (event.data && typeof event.data === "object" && "type" in event.data) {
    return (event.data as { type: string }).type;
  }
  return event.eventType || "unknown";
}

/**
 * Helper to extract properties from raw SSE event
 */
export function getEventProperties<T = Record<string, unknown>>(event: RawSSEEvent): T | undefined {
  if (event.data && typeof event.data === "object" && "properties" in event.data) {
    return (event.data as { properties: T }).properties;
  }
  return undefined;
}

import type { Event as SDKEvent } from "@opencode-ai/sdk/client";

/**
 * Type guard for checking if an event is of a specific type
 */
export function isEventType<T extends SDKEvent>(
  event: SDKEvent,
  type: T["type"]
): event is T {
  return event.type === type;
}
