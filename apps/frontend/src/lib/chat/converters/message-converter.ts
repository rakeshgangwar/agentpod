/**
 * Message Converter
 * 
 * Converts OpenCode messages (from API/SSE) to our internal message format
 * used by RuntimeProvider. This handles the full message structure including
 * all 12+ part types.
 * 
 * @see /apps/frontend/src/lib/chat/types/messages.ts for type definitions
 */

import type {
  ExtendedPart,
  InternalMessage,
  InternalToolCall,
  InternalFilePart,
  InternalStep,
  InternalPatch,
  InternalReasoning,
  InternalSubtask,
  InternalRetry,
  AccumulatedTokens,
} from "../types/messages";

import {
  createEmptyInternalMessage,
} from "../types/messages";

import { convertPart, type PartConversionResult } from "./part-converters";

// =============================================================================
// Types for OpenCode API Messages
// =============================================================================

/**
 * Raw message structure from OpenCode API
 * This matches what we receive from sandboxOpencodeListMessages
 */
export interface OpenCodeMessage {
  info: {
    id: string;
    sessionID: string;
    role: "user" | "assistant";
    time?: {
      created: number;
      completed?: number;
    };
    // Assistant-specific fields
    modelID?: string;
    providerID?: string;
    mode?: string;
    cost?: number;
    tokens?: {
      input: number;
      output: number;
      reasoning: number;
      cache: {
        read: number;
        write: number;
      };
    };
    // User-specific fields
    agent?: string;
    model?: {
      providerID: string;
      modelID: string;
    };
    /**
     * Parent message ID - links assistant messages that respond to the same user message.
     * Multiple assistant messages with the same parentID form a logical "turn" (e.g., tool call + final response).
     */
    parentID?: string;
  };
  parts: ExtendedPart[];
}

// =============================================================================
// Main Conversion Function
// =============================================================================

/**
 * Convert an OpenCode message to our internal format
 * 
 * This processes all parts in the message and builds up the internal
 * representation with all the different content types properly categorized.
 */
export function convertOpenCodeMessage(msg: OpenCodeMessage): InternalMessage {
  const internal = createEmptyInternalMessage(msg.info.id, msg.info.role);
  
  // Set timestamps
  if (msg.info.time?.created) {
    internal.createdAt = new Date(msg.info.time.created);
  }
  if (msg.info.time?.completed) {
    internal.completedAt = new Date(msg.info.time.completed);
  }
  
  // Set cost and tokens from message info (for assistant messages)
  if (msg.info.cost !== undefined) {
    internal.cost = msg.info.cost;
  }
  if (msg.info.tokens) {
    internal.tokens = {
      input: msg.info.tokens.input,
      output: msg.info.tokens.output,
      reasoning: msg.info.tokens.reasoning,
      cached: msg.info.tokens.cache.read + msg.info.tokens.cache.write,
    };
  }
  
  // Set agent from user message or mode from assistant message
  if (msg.info.role === "user" && msg.info.agent) {
    internal.agent = msg.info.agent;
  } else if (msg.info.role === "assistant" && msg.info.mode) {
    internal.agent = msg.info.mode;
  }
  
  // Set parentID for message grouping (typically used by assistant messages)
  if (msg.info.parentID) {
    internal.parentID = msg.info.parentID;
  }
  
  // Process all parts
  for (const part of msg.parts) {
    applyPartToMessage(internal, convertPart(part as ExtendedPart));
  }
  
  return internal;
}

/**
 * Apply a part conversion result to an internal message
 */
export function applyPartToMessage(
  message: InternalMessage,
  result: PartConversionResult
): void {
  if (result.text !== undefined) {
    message.text += result.text;
  }
  
  if (result.reasoning) {
    message.reasoning.push(result.reasoning);
  }
  
  if (result.toolCall) {
    message.toolCalls.set(result.toolCall.toolCallId, result.toolCall);
  }
  
  if (result.toolResult) {
    // Update existing tool call with result
    const existingCall = message.toolCalls.get(result.toolResult.callID);
    if (existingCall) {
      existingCall.result = result.toolResult.result;
      existingCall.status = "completed";
    }
  }
  
  if (result.file) {
    message.files.push(result.file);
  }
  
  if (result.step) {
    // Check if we already have a step with this ID
    const existingStepIndex = message.steps.findIndex(s => s.id === result.step!.id);
    if (existingStepIndex >= 0) {
      // Merge step-start with step-finish
      const existing = message.steps[existingStepIndex];
      message.steps[existingStepIndex] = {
        ...existing,
        ...result.step,
        phase: result.step.phase,
      };
    } else {
      message.steps.push(result.step);
    }
  }
  
  if (result.patch) {
    message.patches.push(result.patch);
  }
  
  if (result.subtask) {
    message.subtasks.push(result.subtask);
  }
  
  if (result.retry) {
    message.retries.push(result.retry);
  }
  
  if (result.agent !== undefined) {
    message.agent = result.agent;
  }
  
  if (result.isCompacted !== undefined) {
    message.isCompacted = result.isCompacted;
  }
}

// =============================================================================
// SSE Part Update Handler
// =============================================================================

/**
 * Raw part data from SSE message.part.updated event
 * This is less typed than the stored Part type
 */
export interface RawSSEPart {
  type: string;
  id?: string;
  sessionID?: string;
  messageID?: string;
  // Text part
  text?: string;
  // Tool part
  callID?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
    title?: string;
    metadata?: Record<string, unknown>;
    time?: {
      start?: number;
      end?: number;
    };
    raw?: string;
    attachments?: Array<{
      id: string;
      url: string;
      filename?: string;
      mime: string;
    }>;
  };
  // Tool invocation (legacy)
  toolInvocation?: {
    toolCallId: string;
    toolName: string;
    args?: unknown;
    state?: string;
    result?: unknown;
  };
  // File part
  url?: string;
  filename?: string;
  mime?: string;
  // Step parts
  snapshot?: string;
  reason?: string;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  // Patch part
  hash?: string;
  files?: string[];
  // Subtask part
  prompt?: string;
  description?: string;
  agent?: string;
  // Agent part
  name?: string;
  // Retry part
  attempt?: number;
  error?: {
    name: string;
    data: {
      message: string;
      statusCode?: number;
      isRetryable?: boolean;
    };
  };
  time?: {
    start?: number;
    end?: number;
    created?: number;
  };
  // Compaction part
  auto?: boolean;
  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Apply a raw SSE part update to an internal message
 * 
 * This handles the incremental updates from message.part.updated events,
 * which may have different field structures than stored messages.
 * 
 * @param message The internal message to update
 * @param part The raw part data from SSE
 * @param delta Optional text delta for streaming text updates
 */
export function applySSEPartToMessage(
  message: InternalMessage,
  part: RawSSEPart,
  delta?: string
): void {
  switch (part.type) {
    case "text":
      // Handle streaming text with delta
      if (delta) {
        message.text += delta;
      } else if (typeof part.text === "string") {
        message.text = part.text;
      }
      break;
      
    case "reasoning":
      if (part.id && part.text !== undefined) {
        const existingIndex = message.reasoning.findIndex(r => r.id === part.id);
        const reasoning: InternalReasoning = {
          id: part.id,
          text: part.text,
          startTime: part.time?.start,
          endTime: part.time?.end,
        };
        if (existingIndex >= 0) {
          message.reasoning[existingIndex] = reasoning;
        } else {
          message.reasoning.push(reasoning);
        }
      }
      break;
      
    case "file":
      if (part.id && part.url && part.mime) {
        const file: InternalFilePart = {
          id: part.id,
          url: part.url,
          filename: part.filename,
          mime: part.mime,
        };
        const existingFileIndex = message.files.findIndex(f => f.id === part.id);
        if (existingFileIndex >= 0) {
          message.files[existingFileIndex] = file;
        } else {
          message.files.push(file);
        }
      }
      break;
      
    case "tool":
      if (part.callID && part.state) {
        const toolCall = convertSSEToolPart(part);
        message.toolCalls.set(part.callID, toolCall);
      }
      break;
      
    case "tool-invocation":
      if (part.toolInvocation?.toolCallId) {
        const toolCall = convertSSEToolInvocationPart(part);
        message.toolCalls.set(part.toolInvocation.toolCallId, toolCall);
      }
      break;
      
    case "tool-result":
      if (part.callID) {
        const existingCall = message.toolCalls.get(part.callID);
        if (existingCall) {
          existingCall.result = part.text || part.state?.output;
          existingCall.status = "completed";
        }
      }
      break;
      
    case "step-start":
      if (part.id) {
        const step: InternalStep = {
          id: part.id,
          phase: "start",
          snapshot: part.snapshot,
        };
        message.steps.push(step);
      }
      break;
      
    case "step-finish":
      if (part.id) {
        const step: InternalStep = {
          id: part.id,
          phase: "finish",
          reason: part.reason,
          snapshot: part.snapshot,
          cost: part.cost,
          tokens: part.tokens ? {
            input: part.tokens.input,
            output: part.tokens.output,
            reasoning: part.tokens.reasoning,
            cached: part.tokens.cache.read + part.tokens.cache.write,
          } : undefined,
        };
        
        // Try to merge with existing step-start
        const existingIndex = message.steps.findIndex(s => s.id === part.id);
        if (existingIndex >= 0) {
          message.steps[existingIndex] = {
            ...message.steps[existingIndex],
            ...step,
          };
        } else {
          message.steps.push(step);
        }
        
        // Accumulate tokens
        if (step.tokens) {
          if (!message.tokens) {
            message.tokens = { input: 0, output: 0, reasoning: 0, cached: 0 };
          }
          message.tokens.input += step.tokens.input;
          message.tokens.output += step.tokens.output;
          message.tokens.reasoning += step.tokens.reasoning;
          message.tokens.cached = (message.tokens.cached || 0) + (step.tokens.cached || 0);
        }
        
        // Accumulate cost
        if (step.cost !== undefined) {
          message.cost = (message.cost || 0) + step.cost;
        }
      }
      break;
      
    case "patch":
      if (part.id && part.hash && part.files) {
        const patch: InternalPatch = {
          id: part.id,
          hash: part.hash,
          files: part.files,
        };
        message.patches.push(patch);
      }
      break;
      
    case "subtask":
      if (part.id && part.prompt && part.description && part.agent) {
        const subtask: InternalSubtask = {
          id: part.id,
          prompt: part.prompt,
          description: part.description,
          agent: part.agent,
        };
        message.subtasks.push(subtask);
      }
      break;
      
    case "agent":
      if (part.name) {
        message.agent = part.name;
      }
      break;
      
    case "retry":
      if (part.id && part.attempt !== undefined && part.error) {
        const retry: InternalRetry = {
          id: part.id,
          attempt: part.attempt,
          error: {
            name: part.error.name,
            message: part.error.data.message,
            statusCode: part.error.data.statusCode,
            isRetryable: part.error.data.isRetryable,
          },
          createdAt: part.time?.created || Date.now(),
        };
        message.retries.push(retry);
      }
      break;
      
    case "compaction":
      message.isCompacted = part.auto ?? true;
      break;
      
    case "snapshot":
      // Snapshot parts are typically handled by step-start/step-finish
      // but can appear independently - we just note it for now
      break;
      
    default:
      console.warn("[MessageConverter] Unknown SSE part type:", part.type);
  }
}

/**
 * Convert SSE tool part to internal tool call
 */
function convertSSEToolPart(part: RawSSEPart): InternalToolCall {
  const state = part.state!;
  const status = (state.status as InternalToolCall["status"]) || "pending";
  
  let attachments: InternalFilePart[] | undefined;
  if (state.attachments && state.attachments.length > 0) {
    attachments = state.attachments.map(att => ({
      id: att.id,
      url: att.url,
      filename: att.filename,
      mime: att.mime,
    }));
  }
  
  return {
    toolCallId: part.callID!,
    toolName: part.tool || "unknown",
    args: state.input || {},
    argsRaw: state.raw,
    result: status === "completed" ? state.output : status === "error" ? state.error : undefined,
    status,
    error: state.error,
    title: state.title,
    metadata: state.metadata,
    startTime: state.time?.start,
    endTime: state.time?.end,
    attachments,
  };
}

/**
 * Convert SSE tool-invocation part (legacy) to internal tool call
 */
function convertSSEToolInvocationPart(part: RawSSEPart): InternalToolCall {
  const inv = part.toolInvocation!;
  
  let status: InternalToolCall["status"] = "pending";
  if (inv.state === "running") {
    status = "running";
  } else if (inv.result !== undefined) {
    status = "completed";
  }
  
  return {
    toolCallId: inv.toolCallId,
    toolName: inv.toolName,
    args: (inv.args as Record<string, unknown>) ?? {},
    result: inv.result !== undefined 
      ? (typeof inv.result === "string" ? inv.result : JSON.stringify(inv.result))
      : undefined,
    status,
    startTime: part.time?.start,
    endTime: part.time?.end,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate total tokens from all step-finish parts
 */
export function calculateTotalTokens(message: InternalMessage): AccumulatedTokens {
  return message.steps.reduce(
    (acc, step) => {
      if (step.tokens) {
        acc.input += step.tokens.input;
        acc.output += step.tokens.output;
        acc.reasoning += step.tokens.reasoning;
        acc.cached = (acc.cached || 0) + (step.tokens.cached || 0);
      }
      return acc;
    },
    { input: 0, output: 0, reasoning: 0, cached: 0 }
  );
}

/**
 * Calculate total cost from all step-finish parts
 */
export function calculateTotalCost(message: InternalMessage): number {
  return message.steps.reduce((acc, step) => acc + (step.cost || 0), 0);
}

/**
 * Check if a message has any active (non-completed) tool calls
 */
export function hasActiveToolCalls(message: InternalMessage): boolean {
  for (const toolCall of message.toolCalls.values()) {
    if (toolCall.status === "pending" || toolCall.status === "running") {
      return true;
    }
  }
  return false;
}

/**
 * Get the count of completed tool calls
 */
export function getCompletedToolCallCount(message: InternalMessage): number {
  let count = 0;
  for (const toolCall of message.toolCalls.values()) {
    if (toolCall.status === "completed") {
      count++;
    }
  }
  return count;
}

/**
 * Get the count of errored tool calls
 */
export function getErroredToolCallCount(message: InternalMessage): number {
  let count = 0;
  for (const toolCall of message.toolCalls.values()) {
    if (toolCall.status === "error") {
      count++;
    }
  }
  return count;
}
