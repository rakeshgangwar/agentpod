/**
 * Session Event Handlers
 * 
 * Handles all session.* SSE events:
 * - session.created - New session created (e.g., child session from task tool)
 * - session.updated - Session info updated (e.g., title changed)
 * - session.status - Explicit status updates (idle/busy/retry)
 * - session.idle - Processing complete
 * - session.error - Session error occurred
 * - session.deleted - Session was deleted
 * - session.compacted - Session history was compacted
 * - session.diff - Session diff for history
 */

import type { Session } from "../../api/tauri";
import type { HandlerContext, HandlerResult, RetryInfo } from "./types";
import {
  handled,
  notHandled,
  setRunning,
  setSessionStatus,
  setError,
  notifySessionCreated,
  notifySessionUpdated,
  updateSessionActivity,
} from "./types";
import {
  setSessionStatus as setGlobalSessionStatus,
  type SessionStatusType,
} from "../../stores/session-status.svelte";

// =============================================================================
// Event Property Types
// =============================================================================

interface SessionInfo {
  id: string;
  parentID?: string;
  title?: string;
  time?: {
    created: number;
    updated: number;
  };
  status?: {
    type?: string;
    attempt?: number;
    message?: string;
    next?: number;
  };
}

interface SessionCreatedProperties {
  info?: SessionInfo;
}

interface SessionUpdatedProperties {
  info?: SessionInfo;
}

interface SessionStatusProperties {
  sessionID?: string;
  status?: {
    type?: string;
    attempt?: number;
    message?: string;
    next?: number;
  };
}

interface SessionErrorProperties {
  error?: {
    name?: string;
    data?: {
      message?: string;
    };
  } | string;
  message?: string;
}

interface SessionDeletedProperties {
  sessionID?: string;
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle session.created event
 * 
 * Only notifies for child sessions (sessions with parentID) to avoid
 * interfering with manually created sessions via the "+ New" button.
 */
export function handleSessionCreated(
  properties: SessionCreatedProperties,
  context: HandlerContext
): HandlerResult {
  const info = properties?.info;
  
  if (!info || typeof info.id !== "string") {
    console.warn("[SessionEvents] session.created missing info.id");
    return notHandled();
  }
  
  const parentID = info.parentID;
  
  // Only handle child sessions here - top-level sessions are handled by createNewSession
  if (!parentID) {
    return notHandled();
  }
  
  console.log("[SessionEvents] New child session created:", info);
  
  // Build Session object from the event info
  const newSession: Session = {
    id: info.id,
    parentID: parentID,
    title: info.title,
    time: info.time,
    status: info.status?.type,
  };
  
  return handled(notifySessionCreated(newSession));
}

/**
 * Handle session.updated event
 * 
 * Handles status changes and title updates.
 */
export function handleSessionUpdated(
  properties: SessionUpdatedProperties,
  _ctx: HandlerContext
): HandlerResult {
  const info = properties?.info;
  
  if (!info || typeof info.id !== "string") {
    console.warn("[SessionEvents] session.updated missing info.id");
    return notHandled();
  }
  
  const actions = [];
  
  // Check for status change to idle
  const status = info.status;
  if (status?.type === "idle") {
    actions.push(setRunning(false));
  }
  
  // Build Session object and notify about updates (e.g., title change)
  const updatedSession: Session = {
    id: info.id,
    parentID: info.parentID,
    title: info.title,
    time: info.time,
    status: status?.type,
  };
  
  console.log("[SessionEvents] Session updated:", updatedSession.id, updatedSession.title);
  actions.push(notifySessionUpdated(updatedSession));
  
  return handled(...actions);
}

/**
 * Handle session.status event
 * 
 * Explicit status updates for idle/busy/retry states.
 */
export function handleSessionStatus(
  properties: SessionStatusProperties,
  context: HandlerContext
): HandlerResult {
  const eventSessionId = properties?.sessionID;
  const status = properties?.status;
  
  if (!status) {
    console.warn("[SessionEvents] session.status missing status object");
    return notHandled();
  }
  
  const statusType = status.type as SessionStatusType | undefined;
  console.log("[SessionEvents] Session status:", statusType, status, "for session:", eventSessionId);
  
  if (eventSessionId && statusType) {
    const retryInfo = statusType === "retry" ? {
      attempt: status.attempt ?? 1,
      message: status.message ?? "Retrying...",
      next: status.next ?? Date.now() + 5000,
    } : null;
    
    setGlobalSessionStatus(eventSessionId, statusType, retryInfo);
  }
  
  if (eventSessionId && eventSessionId !== context.sessionId) {
    return notHandled();
  }
  
  const actions = [];
  
  if (statusType === "idle") {
    actions.push(setSessionStatus("idle", null));
    actions.push(setRunning(false));
    actions.push(updateSessionActivity(false));
  } else if (statusType === "busy") {
    actions.push(setSessionStatus("busy", null));
    actions.push(setRunning(true));
    actions.push(updateSessionActivity(true));
  } else if (statusType === "retry") {
    const retryInfo: RetryInfo = {
      attempt: status.attempt ?? 1,
      message: status.message ?? "Retrying...",
      next: status.next ?? Date.now() + 5000,
    };
    actions.push(setSessionStatus("retry", retryInfo));
    actions.push(setRunning(true));
  }
  
  return handled(...actions);
}

/**
 * Handle session.idle event
 * 
 * Processing complete notification.
 */
export function handleSessionIdle(
  _properties: Record<string, unknown>,
  _context: HandlerContext
): HandlerResult {
  return handled(
    setRunning(false),
    setSessionStatus("idle", null),
    updateSessionActivity(false)
  );
}

/**
 * Handle session.error event
 * 
 * Display error to user and stop running state.
 */
export function handleSessionError(
  properties: SessionErrorProperties,
  _context: HandlerContext
): HandlerResult {
  console.error("[SessionEvents] Session error:", properties);
  
  // Error can be an object with { name, data: { message } } structure
  const errorObj = properties?.error;
  let errorMessage: string;
  
  if (typeof errorObj === "object" && errorObj !== null) {
    // Handle structured error object from OpenCode API
    errorMessage = errorObj.data?.message || errorObj.name || "An error occurred";
  } else if (typeof errorObj === "string") {
    errorMessage = errorObj;
  } else if (typeof properties?.message === "string") {
    errorMessage = properties.message;
  } else {
    errorMessage = "An error occurred";
  }
  
  return handled(
    setError(errorMessage),
    setRunning(false)
  );
}

/**
 * Handle session.deleted event
 * 
 * Session was deleted - could trigger navigation or cleanup.
 * For now, just log it. The parent component should handle session deletion
 * by watching the session list.
 */
export function handleSessionDeleted(
  properties: SessionDeletedProperties,
  context: HandlerContext
): HandlerResult {
  const deletedSessionId = properties?.sessionID;
  
  console.log("[SessionEvents] Session deleted:", deletedSessionId);
  
  // If the deleted session is the current one, we might want to navigate away
  // For now, just acknowledge the event
  if (deletedSessionId === context.sessionId) {
    console.warn("[SessionEvents] Current session was deleted!");
  }
  
  // No direct state changes - the session list should be refreshed by the parent
  return handled();
}

/**
 * Handle session.compacted event
 * 
 * Session history was compacted to reduce context size.
 * This is informational - the messages should be reloaded if needed.
 */
export function handleSessionCompacted(
  properties: Record<string, unknown>,
  _context: HandlerContext
): HandlerResult {
  console.log("[SessionEvents] Session compacted:", properties);
  
  // Messages should be reloaded to get the compacted state
  // For now, just acknowledge the event
  return handled();
}

/**
 * Handle session.diff event
 * 
 * Session diff information for history tracking.
 * This is primarily for TUI use cases.
 */
export function handleSessionDiff(
  properties: Record<string, unknown>,
  _context: HandlerContext
): HandlerResult {
  // session.diff is primarily for TUI - log for now
  console.log("[SessionEvents] Session diff:", properties);
  return notHandled();
}
