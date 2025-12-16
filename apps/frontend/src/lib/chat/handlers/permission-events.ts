/**
 * Permission Event Handlers
 * 
 * Handles all permission.* SSE events:
 * - permission.updated - New permission request received
 * - permission.replied - Permission was responded to (from another client/source)
 */

import type { PermissionRequest } from "../../api/tauri";
import type { HandlerContext, HandlerResult } from "./types";
import {
  handled,
  notHandled,
  addPermission,
  removePermission,
} from "./types";

// =============================================================================
// Event Property Types
// =============================================================================

interface PermissionUpdatedProperties {
  id?: string;
  type?: string;
  pattern?: string | string[];
  sessionID?: string;
  messageID?: string;
  callID?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  time?: {
    created: number;
  };
}

interface PermissionRepliedProperties {
  permissionID?: string;
  // Could also include:
  // allow?: boolean;
  // respondedAt?: number;
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle permission.updated event
 * 
 * Adds a new permission request to state for human-in-the-loop approval.
 * The permission data is passed directly in properties.
 */
export function handlePermissionUpdated(
  properties: PermissionUpdatedProperties,
  context: HandlerContext
): HandlerResult {
  console.log("[PermissionEvents] Permission request received:", properties);
  
  if (!properties || typeof properties.id !== "string") {
    console.warn("[PermissionEvents] permission.updated missing id");
    return notHandled();
  }
  
  // Build the PermissionRequest object
  const permission: PermissionRequest = {
    id: properties.id,
    type: properties.type || "unknown",
    pattern: properties.pattern,
    sessionID: properties.sessionID || context.sessionId || "",
    messageID: properties.messageID || "",
    callID: properties.callID,
    title: properties.title || "Permission Required",
    metadata: properties.metadata || {},
    time: properties.time || { created: Date.now() },
  };
  
  return handled(addPermission(permission));
}

/**
 * Handle permission.replied event
 * 
 * Removes a permission request from state after it was responded to.
 * This can happen when another client/session responds to the permission.
 */
export function handlePermissionReplied(
  properties: PermissionRepliedProperties,
  _context: HandlerContext
): HandlerResult {
  console.log("[PermissionEvents] Permission replied:", properties);
  
  const permissionId = properties?.permissionID;
  
  if (!permissionId) {
    console.warn("[PermissionEvents] permission.replied missing permissionID");
    return notHandled();
  }
  
  return handled(removePermission(permissionId));
}
