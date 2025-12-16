/**
 * Handler Types
 * 
 * Defines the shared context and types used by all SSE event handlers.
 * This allows handlers to be pure functions that receive context and return actions.
 */

import type { InternalMessage } from "../types/messages";
import type { PermissionRequest, Session } from "../../api/tauri";

// =============================================================================
// Session Status Types
// =============================================================================

export type SessionStatusType = "idle" | "busy" | "retry";

export interface RetryInfo {
  attempt: number;
  message: string;
  /** Timestamp (ms) when the next retry will occur */
  next: number;
}

// =============================================================================
// Handler Context
// =============================================================================

/**
 * Read-only context passed to event handlers.
 * Handlers should not mutate this directly.
 */
export interface HandlerContext {
  /** Current project/sandbox ID */
  projectId: string;
  /** Current session ID (may be null during initialization) */
  sessionId: string | null;
  /** Current messages in state */
  messages: InternalMessage[];
}

// =============================================================================
// Handler Actions (Commands returned by handlers)
// =============================================================================

/**
 * Action to update a message in state
 */
export interface UpdateMessageAction {
  type: "update_message";
  messageId: string;
  updater: (message: InternalMessage) => InternalMessage;
}

/**
 * Action to add a new message to state
 */
export interface AddMessageAction {
  type: "add_message";
  message: InternalMessage;
}

/**
 * Action to remove a message from state
 */
export interface RemoveMessageAction {
  type: "remove_message";
  messageId: string;
}

/**
 * Action to replace an optimistic message ID with a real one
 */
export interface ReplaceMessageIdAction {
  type: "replace_message_id";
  optimisticId: string;
  realId: string;
}

/**
 * Action to set running state
 */
export interface SetRunningAction {
  type: "set_running";
  isRunning: boolean;
}

/**
 * Action to set session status
 */
export interface SetSessionStatusAction {
  type: "set_session_status";
  status: SessionStatusType;
  retryInfo?: RetryInfo | null;
}

/**
 * Action to set error state
 */
export interface SetErrorAction {
  type: "set_error";
  error: string | null;
}

/**
 * Action to add a permission request
 */
export interface AddPermissionAction {
  type: "add_permission";
  permission: PermissionRequest;
}

/**
 * Action to remove a permission request
 */
export interface RemovePermissionAction {
  type: "remove_permission";
  permissionId: string;
}

/**
 * Action to notify about session creation
 */
export interface NotifySessionCreatedAction {
  type: "notify_session_created";
  session: Session;
}

/**
 * Action to notify about session update
 */
export interface NotifySessionUpdatedAction {
  type: "notify_session_updated";
  session: Session;
}

/**
 * Action to update session activity (for projects page indicator)
 */
export interface UpdateSessionActivityAction {
  type: "update_session_activity";
  isActive: boolean;
}

/**
 * Union of all possible handler actions
 */
export type HandlerAction =
  | UpdateMessageAction
  | AddMessageAction
  | RemoveMessageAction
  | ReplaceMessageIdAction
  | SetRunningAction
  | SetSessionStatusAction
  | SetErrorAction
  | AddPermissionAction
  | RemovePermissionAction
  | NotifySessionCreatedAction
  | NotifySessionUpdatedAction
  | UpdateSessionActivityAction;

// =============================================================================
// Handler Result
// =============================================================================

/**
 * Result returned by an event handler.
 * Contains zero or more actions to apply to state.
 */
export interface HandlerResult {
  /** Actions to apply to state */
  actions: HandlerAction[];
  /** Whether the event was handled (for logging/debugging) */
  handled: boolean;
}

// =============================================================================
// Event Handler Function Type
// =============================================================================

/**
 * Generic event handler function signature
 */
export type EventHandler<TEvent> = (
  event: TEvent,
  context: HandlerContext
) => HandlerResult;

// =============================================================================
// Helper Functions for Creating Actions
// =============================================================================

/**
 * Create a result indicating the event was not handled
 */
export function notHandled(): HandlerResult {
  return { actions: [], handled: false };
}

/**
 * Create a result with actions
 */
export function handled(...actions: HandlerAction[]): HandlerResult {
  return { actions, handled: true };
}

/**
 * Create an update message action
 */
export function updateMessage(
  messageId: string,
  updater: (message: InternalMessage) => InternalMessage
): UpdateMessageAction {
  return { type: "update_message", messageId, updater };
}

/**
 * Create an add message action
 */
export function addMessage(message: InternalMessage): AddMessageAction {
  return { type: "add_message", message };
}

/**
 * Create a remove message action
 */
export function removeMessage(messageId: string): RemoveMessageAction {
  return { type: "remove_message", messageId };
}

/**
 * Create a replace message ID action
 */
export function replaceMessageId(
  optimisticId: string,
  realId: string
): ReplaceMessageIdAction {
  return { type: "replace_message_id", optimisticId, realId };
}

/**
 * Create a set running action
 */
export function setRunning(isRunning: boolean): SetRunningAction {
  return { type: "set_running", isRunning };
}

/**
 * Create a set session status action
 */
export function setSessionStatus(
  status: SessionStatusType,
  retryInfo?: RetryInfo | null
): SetSessionStatusAction {
  return { type: "set_session_status", status, retryInfo };
}

/**
 * Create a set error action
 */
export function setError(error: string | null): SetErrorAction {
  return { type: "set_error", error };
}

/**
 * Create an add permission action
 */
export function addPermission(permission: PermissionRequest): AddPermissionAction {
  return { type: "add_permission", permission };
}

/**
 * Create a remove permission action
 */
export function removePermission(permissionId: string): RemovePermissionAction {
  return { type: "remove_permission", permissionId };
}

/**
 * Create a notify session created action
 */
export function notifySessionCreated(session: Session): NotifySessionCreatedAction {
  return { type: "notify_session_created", session };
}

/**
 * Create a notify session updated action
 */
export function notifySessionUpdated(session: Session): NotifySessionUpdatedAction {
  return { type: "notify_session_updated", session };
}

/**
 * Create an update session activity action
 */
export function updateSessionActivity(isActive: boolean): UpdateSessionActivityAction {
  return { type: "update_session_activity", isActive };
}
