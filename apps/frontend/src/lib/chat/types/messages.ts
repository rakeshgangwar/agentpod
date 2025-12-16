/**
 * OpenCode Message Part Types
 * 
 * Re-exports part types from the OpenCode SDK and defines internal
 * message types used by RuntimeProvider for state management.
 * 
 * SDK Types: Used for data coming from/going to the OpenCode API
 * Internal Types: Used for React state management with assistant-ui
 * 
 * @see https://github.com/opencode-ai/opencode for SDK documentation
 */

// =============================================================================
// Re-export all part types from the SDK
// =============================================================================

export type {
  // Part types
  TextPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  PatchPart,
  SnapshotPart,
  AgentPart,
  RetryPart,
  CompactionPart,
  Part,
  // Tool state types
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  ToolState,
  // File source types
  FilePartSourceText,
  FileSource,
  SymbolSource,
  FilePartSource,
  Range,
  // Error types (for retry parts)
  ApiError,
} from "@opencode-ai/sdk/client";

// =============================================================================
// Part Type Enum
// =============================================================================

/**
 * All possible message part types as string literal union
 */
export type PartType =
  | "text"
  | "reasoning"
  | "tool"
  | "tool-invocation"  // Legacy format
  | "tool-result"
  | "file"
  | "patch"
  | "step-start"
  | "step-finish"
  | "subtask"
  | "snapshot"
  | "agent"
  | "retry"
  | "compaction";

// =============================================================================
// Tool Call Status (convenience type)
// =============================================================================

export type ToolCallStatus = "pending" | "running" | "completed" | "error";

// =============================================================================
// Legacy Tool Invocation Part (not in SDK, but supported for backwards compat)
// =============================================================================

export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  state?: string;
  result?: unknown;
}

export interface ToolInvocationPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool-invocation";
  toolInvocation: ToolInvocation;
  time?: {
    start: number;
    end?: number;
  };
}

// =============================================================================
// Tool Result Part (not in SDK union, but appears in SSE)
// =============================================================================

export interface ToolResultPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool-result";
  callID?: string;
  tool?: string;
  text?: string;
  time?: {
    start: number;
    end?: number;
  };
}

// =============================================================================
// Subtask Part (inline in SDK, explicit here for convenience)
// =============================================================================

export interface SubtaskPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "subtask";
  prompt: string;
  description: string;
  agent: string;
}

// =============================================================================
// Extended Part Type (includes legacy/extra types not in SDK union)
// =============================================================================

import type { Part as SDKPart } from "@opencode-ai/sdk/client";

export type ExtendedPart = SDKPart | ToolInvocationPart | ToolResultPart;

// =============================================================================
// Internal Message Types (for RuntimeProvider state management)
// =============================================================================

/**
 * Internal representation of a tool call.
 * This is our own format optimized for React state and assistant-ui.
 */
export interface InternalToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsRaw?: string;
  result?: string;
  status: ToolCallStatus;
  error?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
  attachments?: InternalFilePart[];
}

/**
 * Internal representation of a file part.
 */
export interface InternalFilePart {
  id: string;
  url: string;
  filename?: string;
  mime: string;
  source?: {
    type: "file" | "symbol";
    path: string;
  };
}

/**
 * Internal representation of a processing step.
 */
export interface InternalStep {
  id: string;
  phase: "start" | "finish";
  startTime?: number;
  endTime?: number;
  reason?: string;
  snapshot?: string;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cached?: number;
  };
}

/**
 * Internal representation of a patch.
 */
export interface InternalPatch {
  id: string;
  hash: string;
  files: string[];
}

/**
 * Internal representation of reasoning content.
 */
export interface InternalReasoning {
  id: string;
  text: string;
  startTime?: number;
  endTime?: number;
}

/**
 * Internal representation of a subtask.
 */
export interface InternalSubtask {
  id: string;
  prompt: string;
  description: string;
  agent: string;
}

/**
 * Internal representation of a retry.
 */
export interface InternalRetry {
  id: string;
  attempt: number;
  error: {
    name: string;
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
  };
  createdAt: number;
}

/**
 * Accumulated token usage.
 */
export interface AccumulatedTokens {
  input: number;
  output: number;
  reasoning: number;
  cached?: number;
}

/**
 * Internal representation of a message for RuntimeProvider state.
 * This is our React state format, not the API format.
 */
export interface InternalMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning: InternalReasoning[];
  toolCalls: Map<string, InternalToolCall>;
  files: InternalFilePart[];
  steps: InternalStep[];
  patches: InternalPatch[];
  subtasks: InternalSubtask[];
  retries: InternalRetry[];
  agent?: string;
  isCompacted?: boolean;
  createdAt?: Date;
  completedAt?: Date;
  cost?: number;
  tokens?: AccumulatedTokens;
  /**
   * Parent message ID - used to group assistant messages that are part of the same turn.
   * When a user sends a message, all assistant responses to that message share the same parentID.
   * This enables multi-step tool call chains to be displayed as a single cohesive response.
   */
  parentID?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an empty internal message
 */
export function createEmptyInternalMessage(
  id: string,
  role: "user" | "assistant"
): InternalMessage {
  return {
    id,
    role,
    text: "",
    reasoning: [],
    toolCalls: new Map(),
    files: [],
    steps: [],
    patches: [],
    subtasks: [],
    retries: [],
    createdAt: new Date(),
  };
}

// =============================================================================
// Type Guards (using SDK types)
// =============================================================================

import type {
  TextPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  PatchPart,
  RetryPart,
  CompactionPart,
  ToolState,
  ToolStateCompleted,
  ToolStateError,
  ToolStateRunning,
  ToolStatePending,
} from "@opencode-ai/sdk/client";

/**
 * Type guard for tool part
 */
export function isToolPart(part: ExtendedPart): part is ToolPart {
  return part.type === "tool";
}

/**
 * Type guard for text part
 */
export function isTextPart(part: ExtendedPart): part is TextPart {
  return part.type === "text";
}

/**
 * Type guard for reasoning part
 */
export function isReasoningPart(part: ExtendedPart): part is ReasoningPart {
  return part.type === "reasoning";
}

/**
 * Type guard for file part
 */
export function isFilePart(part: ExtendedPart): part is FilePart {
  return part.type === "file";
}

/**
 * Type guard for step-start part
 */
export function isStepStartPart(part: ExtendedPart): part is StepStartPart {
  return part.type === "step-start";
}

/**
 * Type guard for step-finish part
 */
export function isStepFinishPart(part: ExtendedPart): part is StepFinishPart {
  return part.type === "step-finish";
}

/**
 * Type guard for patch part
 */
export function isPatchPart(part: ExtendedPart): part is PatchPart {
  return part.type === "patch";
}

/**
 * Type guard for subtask part
 */
export function isSubtaskPart(part: ExtendedPart): part is SubtaskPart {
  return part.type === "subtask";
}

/**
 * Type guard for retry part
 */
export function isRetryPart(part: ExtendedPart): part is RetryPart {
  return part.type === "retry";
}

/**
 * Type guard for compaction part
 */
export function isCompactionPart(part: ExtendedPart): part is CompactionPart {
  return part.type === "compaction";
}

/**
 * Type guard for tool invocation part (legacy)
 */
export function isToolInvocationPart(part: ExtendedPart): part is ToolInvocationPart {
  return part.type === "tool-invocation";
}

/**
 * Type guard for tool result part
 */
export function isToolResultPart(part: ExtendedPart): part is ToolResultPart {
  return part.type === "tool-result";
}

/**
 * Check if tool state is completed
 */
export function isToolCompleted(state: ToolState): state is ToolStateCompleted {
  return state.status === "completed";
}

/**
 * Check if tool state is error
 */
export function isToolError(state: ToolState): state is ToolStateError {
  return state.status === "error";
}

/**
 * Check if tool state is running
 */
export function isToolRunning(state: ToolState): state is ToolStateRunning {
  return state.status === "running";
}

/**
 * Check if tool state is pending
 */
export function isToolPending(state: ToolState): state is ToolStatePending {
  return state.status === "pending";
}
