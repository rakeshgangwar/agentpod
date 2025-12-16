/**
 * Message Event Handlers
 * 
 * Handles all message.* SSE events:
 * - message.updated - New message created or metadata updated
 * - message.part.updated - Streaming content update
 * - message.removed - Message was removed
 * - message.part.removed - Message part was removed
 */

import type { InternalMessage } from "../types/messages";
import { createEmptyInternalMessage } from "../types/messages";
import { applySSEPartToMessage, type RawSSEPart } from "../converters/message-converter";
import type { HandlerContext, HandlerResult, HandlerAction } from "./types";
import {
  handled,
  notHandled,
  addMessage,
  updateMessage,
  removeMessage,
  replaceMessageId,
} from "./types";

// =============================================================================
// Event Property Types
// =============================================================================

interface MessageInfo {
  id: string;
  sessionID?: string;
  role: "user" | "assistant";
  time?: {
    created: number;
    completed?: number;
  };
  agent?: string;
  mode?: string;
  /**
   * Parent message ID - links assistant messages that respond to the same user message.
   * Multiple assistant messages with the same parentID form a logical "turn".
   */
  parentID?: string;
}

interface MessageUpdatedProperties {
  info?: MessageInfo;
}

interface MessagePartUpdatedProperties {
  messageID?: string;
  part?: RawSSEPart;
  delta?: string;
}

interface MessageRemovedProperties {
  messageID?: string;
  sessionID?: string;
}

interface MessagePartRemovedProperties {
  messageID?: string;
  sessionID?: string;
  partID?: string;
  partType?: string;
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle message.updated event
 * 
 * Creates new message in state or updates existing message metadata.
 * For user messages, may replace an optimistic message with the real one.
 */
export function handleMessageUpdated(
  properties: MessageUpdatedProperties,
  context: HandlerContext
): HandlerResult {
  const info = properties?.info;
  
  if (!info || typeof info.id !== "string" || typeof info.role !== "string") {
    console.warn("[MessageEvents] message.updated missing required fields");
    return notHandled();
  }
  
  // Filter by session - only process messages for the current session
  const messageSessionId = info.sessionID;
  if (messageSessionId && messageSessionId !== context.sessionId) {
    return notHandled(); // Skip messages from other sessions (e.g., child sessions from task tool)
  }
  
  const messageId = info.id;
  const role = info.role as "user" | "assistant";
  
  // Check if message already exists
  const existsById = context.messages.some((m) => m.id === messageId);
  if (existsById) {
    // Message exists - could update metadata if needed
    return notHandled();
  }
  
  const actions: HandlerAction[] = [];
  
  // For user messages, check if there's an optimistic message we should replace
  if (role === "user") {
    const optimisticMessage = context.messages.find(
      (m) => m.role === "user" && m.id.startsWith("user-")
    );
    if (optimisticMessage) {
      // Replace the optimistic message ID with the real one
      actions.push(replaceMessageId(optimisticMessage.id, messageId));
      return handled(...actions);
    }
  }
  
  // Create new message
  const newMessage = createEmptyInternalMessage(messageId, role);
  
  // Set agent from user message or mode from assistant message
  if (role === "user" && info.agent) {
    newMessage.agent = info.agent;
  } else if (role === "assistant" && info.mode) {
    newMessage.agent = info.mode;
  }
  
  // Set timestamp if available
  if (info.time?.created) {
    newMessage.createdAt = new Date(info.time.created);
  }
  
  // Set parentID for message grouping (links assistant messages to user message)
  if (info.parentID) {
    newMessage.parentID = info.parentID;
  }
  
  actions.push(addMessage(newMessage));
  return handled(...actions);
}

/**
 * Handle message.part.updated event
 * 
 * Updates message content with streaming parts (text, tool calls, etc.)
 * If the message doesn't exist yet (race condition), creates it first.
 */
export function handleMessagePartUpdated(
  properties: MessagePartUpdatedProperties,
  context: HandlerContext
): HandlerResult {
  const part = properties?.part;
  const messageId = properties?.messageID || part?.messageID;
  
  if (!messageId) {
    console.warn("[MessageEvents] message.part.updated missing messageID");
    return notHandled();
  }
  
  if (!part) {
    console.warn("[MessageEvents] message.part.updated missing part");
    return notHandled();
  }
  
  // Filter by session - only process parts for the current session
  const partSessionId = part.sessionID;
  if (partSessionId && partSessionId !== context.sessionId) {
    return notHandled(); // Skip parts from other sessions
  }
  
  const delta = properties?.delta;
  
  // Check if message exists
  const messageExists = context.messages.some((m) => m.id === messageId);
  
  if (!messageExists) {
    // Message doesn't exist yet (race condition: part.updated arrived before message.updated)
    // Create the message now. This typically happens with assistant messages during streaming.
    const newMessage = createEmptyInternalMessage(messageId, "assistant");
    
    // Apply the part update to the new message
    applySSEPartToMessage(newMessage, part, delta);
    
    return handled(addMessage(newMessage));
  }
  
  // Message exists, update it
  return handled(
    updateMessage(messageId, (msg) => {
      // Clone the message to update
      const updated: InternalMessage = {
        ...msg,
        // Clone arrays to avoid mutation
        reasoning: [...msg.reasoning],
        files: [...msg.files],
        steps: [...msg.steps],
        patches: [...msg.patches],
        subtasks: [...msg.subtasks],
        retries: [...msg.retries],
        // Clone Map
        toolCalls: new Map(msg.toolCalls),
      };
      
      // Apply the SSE part update
      applySSEPartToMessage(updated, part, delta);
      
      return updated;
    })
  );
}

/**
 * Handle message.removed event
 * 
 * Removes a message from state.
 */
export function handleMessageRemoved(
  properties: MessageRemovedProperties,
  context: HandlerContext
): HandlerResult {
  const messageId = properties?.messageID;
  const removedSessionId = properties?.sessionID;
  
  // Filter by session - only process removals for the current session
  if (removedSessionId && removedSessionId !== context.sessionId) {
    return notHandled(); // Skip removals from other sessions
  }
  
  if (!messageId) {
    console.warn("[MessageEvents] message.removed missing messageID");
    return notHandled();
  }
  
  console.log("[MessageEvents] Message removed:", messageId);
  return handled(removeMessage(messageId));
}

/**
 * Handle message.part.removed event
 * 
 * Removes a specific part from a message.
 * This is less common but can happen during edits or compaction.
 */
export function handleMessagePartRemoved(
  properties: MessagePartRemovedProperties,
  context: HandlerContext
): HandlerResult {
  const messageId = properties?.messageID;
  const removedSessionId = properties?.sessionID;
  const partId = properties?.partID;
  const partType = properties?.partType;
  
  // Filter by session
  if (removedSessionId && removedSessionId !== context.sessionId) {
    return notHandled();
  }
  
  if (!messageId || !partId) {
    console.warn("[MessageEvents] message.part.removed missing messageID or partID");
    return notHandled();
  }
  
  console.log("[MessageEvents] Message part removed:", messageId, partType, partId);
  
  return handled(
    updateMessage(messageId, (msg) => {
      const updated: InternalMessage = {
        ...msg,
        reasoning: [...msg.reasoning],
        files: [...msg.files],
        steps: [...msg.steps],
        patches: [...msg.patches],
        subtasks: [...msg.subtasks],
        retries: [...msg.retries],
        toolCalls: new Map(msg.toolCalls),
      };
      
      // Remove the part based on type
      switch (partType) {
        case "text":
          // Can't really remove text, but could clear it
          updated.text = "";
          break;
          
        case "reasoning":
          updated.reasoning = updated.reasoning.filter(r => r.id !== partId);
          break;
          
        case "tool":
        case "tool-invocation":
          updated.toolCalls.delete(partId);
          break;
          
        case "file":
          updated.files = updated.files.filter(f => f.id !== partId);
          break;
          
        case "step-start":
        case "step-finish":
          updated.steps = updated.steps.filter(s => s.id !== partId);
          break;
          
        case "patch":
          updated.patches = updated.patches.filter(p => p.id !== partId);
          break;
          
        case "subtask":
          updated.subtasks = updated.subtasks.filter(s => s.id !== partId);
          break;
          
        case "retry":
          updated.retries = updated.retries.filter(r => r.id !== partId);
          break;
          
        default:
          console.warn("[MessageEvents] Unknown part type for removal:", partType);
      }
      
      return updated;
    })
  );
}
