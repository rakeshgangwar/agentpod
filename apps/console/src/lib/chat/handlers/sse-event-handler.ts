/**
 * SSE Event Handler
 * 
 * Main router for all OpenCode SSE events. Routes events to the appropriate
 * specialized handlers and aggregates the results.
 * 
 * This provides a clean separation between event routing and state management.
 * The RuntimeProvider calls handleSSEEvent() and applies the returned actions.
 */

import type { OpenCodeEvent } from "../../api/tauri";
import type { HandlerContext, HandlerResult } from "./types";
import type { OpenCodeEventType } from "../types/events";
import { notHandled } from "./types";

// Session event handlers
import {
  handleSessionCreated,
  handleSessionUpdated,
  handleSessionStatus,
  handleSessionIdle,
  handleSessionError,
  handleSessionDeleted,
  handleSessionCompacted,
  handleSessionDiff,
} from "./session-events";

// Message event handlers
import {
  handleMessageUpdated,
  handleMessagePartUpdated,
  handleMessageRemoved,
  handleMessagePartRemoved,
} from "./message-events";

// Permission event handlers
import {
  handlePermissionUpdated,
  handlePermissionReplied,
} from "./permission-events";

// File event handlers
import {
  handleFileEdited,
  handleFileWatcherUpdated,
} from "./file-events";

// =============================================================================
// Event Type Re-export
// =============================================================================

export type { OpenCodeEventType } from "../types/events";

// =============================================================================
// Main Event Handler
// =============================================================================

/**
 * Handle an SSE event and return actions to apply to state.
 * 
 * This is a pure function that takes an event and context, and returns
 * a result with zero or more actions. The caller (RuntimeProvider) is
 * responsible for applying these actions to state.
 * 
 * @param event The raw SSE event from Tauri
 * @param context Read-only context with current state
 * @returns Handler result with actions to apply
 */
export function handleSSEEvent(
  event: OpenCodeEvent,
  context: HandlerContext
): HandlerResult {
  const eventData = event.data as Record<string, unknown>;
  const properties = eventData?.properties as Record<string, unknown> | undefined;
  const eventType = event.eventType as OpenCodeEventType;

  // Log all events for debugging
  console.log("[SSEEventHandler] Event:", eventType, properties);

  // Route to appropriate handler based on event type
  switch (eventType) {
    // Session events
    case "session.created":
      return handleSessionCreated(properties || {}, context);
    
    case "session.updated":
      return handleSessionUpdated(properties || {}, context);
    
    case "session.status":
      return handleSessionStatus(properties || {}, context);
    
    case "session.idle":
      return handleSessionIdle(properties || {}, context);
    
    case "session.error":
      return handleSessionError(properties || {}, context);
    
    case "session.deleted":
      return handleSessionDeleted(properties || {}, context);
    
    case "session.compacted":
      return handleSessionCompacted(properties || {}, context);
    
    case "session.diff":
      return handleSessionDiff(properties || {}, context);

    // Message events
    case "message.updated":
      return handleMessageUpdated(properties || {}, context);
    
    case "message.part.updated":
      return handleMessagePartUpdated(properties || {}, context);
    
    case "message.removed":
      return handleMessageRemoved(properties || {}, context);
    
    case "message.part.removed":
      return handleMessagePartRemoved(properties || {}, context);

    // Permission events
    case "permission.updated":
      return handlePermissionUpdated(properties || {}, context);
    
    case "permission.replied":
      return handlePermissionReplied(properties || {}, context);

    // File events
    case "file.edited":
      return handleFileEdited(properties || {}, context);
    
    case "file.watcher.updated":
      return handleFileWatcherUpdated(properties || {}, context);

    // Server events - informational, no state changes needed
    case "server.connected":
      console.log("[SSEEventHandler] Server connected:", properties);
      return notHandled();
    
    case "server.heartbeat":
      console.debug("[SSEEventHandler] Heartbeat received");
      return notHandled();
    
    case "server.instance.disposed":
      console.log("[SSEEventHandler] Server instance disposed:", properties);
      return notHandled();
    
    case "server.heartbeat":
      // Heartbeat events keep the SSE connection alive during long operations
      // No state changes needed, just acknowledge receipt
      console.debug("[SSEEventHandler] Server heartbeat received");
      return notHandled();
    
    case "server.instance.disposed":
      console.log("[SSEEventHandler] Server instance disposed:", properties);
      return notHandled();
    
    case "error":
      console.error("[SSEEventHandler] Server error:", properties);
      return notHandled();

    // VCS events - informational for now
    case "vcs.branch.updated":
      console.log("[SSEEventHandler] VCS branch updated:", properties);
      return notHandled();

    // PTY/Terminal events - could be used for terminal UI
    case "pty.created":
    case "pty.updated":
    case "pty.exited":
    case "pty.deleted":
      console.log("[SSEEventHandler] PTY event:", eventType, properties);
      return notHandled();

    // Tool events - could be used for tool execution UI
    case "tool.execute.before":
    case "tool.execute.after":
      console.log("[SSEEventHandler] Tool event:", eventType, properties);
      return notHandled();

    // Other informational events
    case "command.executed":
    case "installation.updated":
    case "installation.update-available":
    case "lsp.client.diagnostics":
    case "lsp.updated":
    case "todo.updated":
      console.log("[SSEEventHandler] Info event:", eventType, properties);
      return notHandled();

    // TUI events - not used in desktop app
    case "tui.prompt.append":
    case "tui.command.execute":
    case "tui.toast.show":
      // TUI events are for terminal UI, not desktop
      return notHandled();

    default:
      console.warn("[SSEEventHandler] Unknown event type:", eventType);
      return notHandled();
  }
}

// =============================================================================
// Batch Handler (for processing multiple events)
// =============================================================================

/**
 * Handle multiple SSE events and return combined actions.
 * 
 * This is useful when events arrive in batches and you want to
 * minimize state updates by combining all actions.
 * 
 * @param events Array of SSE events
 * @param context Read-only context with current state
 * @returns Combined handler result with all actions
 */
export function handleSSEEvents(
  events: OpenCodeEvent[],
  context: HandlerContext
): HandlerResult {
  const allActions = [];
  let anyHandled = false;
  
  for (const event of events) {
    const result = handleSSEEvent(event, context);
    allActions.push(...result.actions);
    if (result.handled) {
      anyHandled = true;
    }
  }
  
  return {
    actions: allActions,
    handled: anyHandled,
  };
}
