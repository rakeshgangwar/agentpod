/**
 * Handlers Index
 * 
 * Re-exports all SSE event handlers and types for clean imports.
 * 
 * Usage:
 * ```ts
 * import { handleSSEEvent, type HandlerContext, type HandlerAction } from './handlers';
 * ```
 */

// Main event handler and batch handler
export {
  handleSSEEvent,
  handleSSEEvents,
  type OpenCodeEventType,
} from "./sse-event-handler";

// Handler types and action creators
export {
  // Types
  type SessionStatusType,
  type RetryInfo,
  type HandlerContext,
  type HandlerResult,
  type HandlerAction,
  type UpdateMessageAction,
  type AddMessageAction,
  type RemoveMessageAction,
  type ReplaceMessageIdAction,
  type SetRunningAction,
  type SetSessionStatusAction,
  type SetErrorAction,
  type AddPermissionAction,
  type RemovePermissionAction,
  type NotifySessionCreatedAction,
  type NotifySessionUpdatedAction,
  type UpdateSessionActivityAction,
  type EventHandler,
  // Action creators
  notHandled,
  handled,
  updateMessage,
  addMessage,
  removeMessage,
  replaceMessageId,
  setRunning,
  setSessionStatus,
  setError,
  addPermission,
  removePermission,
  notifySessionCreated,
  notifySessionUpdated,
  updateSessionActivity,
} from "./types";

// Individual handlers (for testing or direct use)
export {
  handleSessionCreated,
  handleSessionUpdated,
  handleSessionStatus,
  handleSessionIdle,
  handleSessionError,
  handleSessionDeleted,
  handleSessionCompacted,
  handleSessionDiff,
} from "./session-events";

export {
  handleMessageUpdated,
  handleMessagePartUpdated,
  handleMessageRemoved,
  handleMessagePartRemoved,
} from "./message-events";

export {
  handlePermissionUpdated,
  handlePermissionReplied,
} from "./permission-events";

export {
  handleFileEdited,
  handleFileWatcherUpdated,
} from "./file-events";
