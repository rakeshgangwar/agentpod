/**
 * File Event Handlers
 * 
 * Handles all file.* SSE events:
 * - file.edited - A file was edited (e.g., by a tool)
 * - file.watcher.updated - File watcher detected changes
 * 
 * These events are informational - the chat UI can display them
 * but they don't directly modify message state. They could be used
 * to show real-time file modification indicators in the UI.
 */

import type { HandlerContext, HandlerResult } from "./types";
import { handled, notHandled } from "./types";

// =============================================================================
// Event Property Types
// =============================================================================

interface FileEditedProperties {
  sessionID?: string;
  path?: string;
  diff?: {
    additions: number;
    deletions: number;
    changes: Array<{
      type: "add" | "delete" | "modify";
      lineNumber: number;
      content: string;
    }>;
  };
  timestamp?: number;
}

interface FileWatcherUpdatedProperties {
  sessionID?: string;
  paths?: string[];
  event?: "create" | "modify" | "delete";
  timestamp?: number;
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle file.edited event
 * 
 * A file was edited, typically by a tool. This could be used to:
 * - Show a toast notification
 * - Update a file tree view
 * - Highlight recently modified files
 * 
 * For now, we just log it. Future implementations could emit
 * custom events that UI components can subscribe to.
 */
export function handleFileEdited(
  properties: FileEditedProperties,
  context: HandlerContext
): HandlerResult {
  // Filter by session if needed
  const eventSessionId = properties?.sessionID;
  if (eventSessionId && eventSessionId !== context.sessionId) {
    return notHandled();
  }
  
  const path = properties?.path;
  const diff = properties?.diff;
  
  if (!path) {
    console.warn("[FileEvents] file.edited missing path");
    return notHandled();
  }
  
  console.log("[FileEvents] File edited:", path, {
    additions: diff?.additions,
    deletions: diff?.deletions,
  });
  
  // In the future, we could emit a custom action type that gets
  // dispatched to a file state store. For now, just acknowledge.
  return handled();
}

/**
 * Handle file.watcher.updated event
 * 
 * File watcher detected changes to monitored files. This could be used to:
 * - Refresh the file tree
 * - Show notifications about external changes
 * - Auto-reload certain UI components
 * 
 * For now, we just log it.
 */
export function handleFileWatcherUpdated(
  properties: FileWatcherUpdatedProperties,
  context: HandlerContext
): HandlerResult {
  // Filter by session if needed
  const eventSessionId = properties?.sessionID;
  if (eventSessionId && eventSessionId !== context.sessionId) {
    return notHandled();
  }
  
  const paths = properties?.paths;
  const event = properties?.event;
  
  if (!paths || paths.length === 0) {
    return notHandled();
  }
  
  console.log("[FileEvents] File watcher updated:", event, paths);
  
  // In the future, we could emit a custom action type for file watching.
  return handled();
}
