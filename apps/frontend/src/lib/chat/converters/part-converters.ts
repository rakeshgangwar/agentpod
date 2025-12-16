/**
 * Part Converters
 * 
 * Individual converter functions for each OpenCode message part type.
 * These handle the conversion from raw OpenCode parts to our internal
 * representation used by RuntimeProvider.
 * 
 * @see /apps/frontend/src/lib/chat/types/messages.ts for type definitions
 */

import type {
  Part,
  ExtendedPart,
  TextPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  ToolInvocationPart,
  ToolResultPart,
  StepStartPart,
  StepFinishPart,
  PatchPart,
  SubtaskPart,
  RetryPart,
  CompactionPart,
  AgentPart,
  InternalToolCall,
  InternalFilePart,
  InternalStep,
  InternalPatch,
  InternalReasoning,
  InternalSubtask,
  InternalRetry,
  ToolCallStatus,
} from "../types/messages";

// =============================================================================
// Text Part Converter
// =============================================================================

/**
 * Extract text content from a text part
 */
export function convertTextPart(part: TextPart): string {
  return part.text || "";
}

// =============================================================================
// Reasoning Part Converter
// =============================================================================

/**
 * Convert a reasoning part to internal reasoning format
 */
export function convertReasoningPart(part: ReasoningPart): InternalReasoning {
  return {
    id: part.id,
    text: part.text,
    startTime: part.time?.start,
    endTime: part.time?.end,
  };
}

// =============================================================================
// File Part Converter
// =============================================================================

/**
 * Convert a file part to internal file format
 */
export function convertFilePart(part: FilePart): InternalFilePart {
  return {
    id: part.id,
    url: part.url,
    filename: part.filename,
    mime: part.mime,
    source: part.source ? {
      type: part.source.type,
      path: part.source.path,
    } : undefined,
  };
}

// =============================================================================
// Tool Part Converter (Current Format)
// =============================================================================

/**
 * Convert a tool part (current OpenCode format) to internal tool call
 */
export function convertToolPart(part: ToolPart): InternalToolCall {
  const { callID, tool, state } = part;
  
  // Determine result based on status
  let result: string | undefined;
  let error: string | undefined;
  let title: string | undefined;
  let attachments: InternalFilePart[] | undefined;
  let startTime: number | undefined;
  let endTime: number | undefined;
  
  if (state.status === "completed") {
    result = state.output;
    title = state.title;
    startTime = state.time.start;
    endTime = state.time.end;
    if (state.attachments && state.attachments.length > 0) {
      attachments = state.attachments.map(convertFilePart);
    }
  } else if (state.status === "error") {
    error = state.error;
    startTime = state.time.start;
    endTime = state.time.end;
  } else if (state.status === "running") {
    title = state.title;
    startTime = state.time.start;
  }
  
  return {
    toolCallId: callID,
    toolName: tool,
    args: state.input,
    argsRaw: state.status === "pending" ? state.raw : undefined,
    result,
    status: state.status,
    error,
    title,
    metadata: state.status !== "pending" ? state.metadata : undefined,
    startTime,
    endTime,
    attachments,
  };
}

// =============================================================================
// Tool Invocation Part Converter (Legacy Format)
// =============================================================================

/**
 * Convert a tool-invocation part (legacy format) to internal tool call
 */
export function convertToolInvocationPart(part: ToolInvocationPart): InternalToolCall {
  const { toolInvocation } = part;
  
  // Map legacy state to our status
  let status: ToolCallStatus = "pending";
  if (toolInvocation.state === "running") {
    status = "running";
  } else if (toolInvocation.result !== undefined) {
    status = "completed";
  }
  
  return {
    toolCallId: toolInvocation.toolCallId,
    toolName: toolInvocation.toolName,
    args: (toolInvocation.args as Record<string, unknown>) ?? {},
    result: toolInvocation.result !== undefined 
      ? (typeof toolInvocation.result === "string" 
          ? toolInvocation.result 
          : JSON.stringify(toolInvocation.result))
      : undefined,
    status,
    startTime: part.time?.start,
    endTime: part.time?.end,
  };
}

// =============================================================================
// Tool Result Part Converter
// =============================================================================

/**
 * Process a tool-result part to update an existing tool call
 * Returns the callID and result text
 */
export function convertToolResultPart(part: ToolResultPart): {
  callID?: string;
  result?: string;
} {
  return {
    callID: part.callID,
    result: part.text,
  };
}

// =============================================================================
// Step Part Converters
// =============================================================================

/**
 * Convert a step-start part to internal step
 */
export function convertStepStartPart(part: StepStartPart): InternalStep {
  return {
    id: part.id,
    phase: "start",
    snapshot: part.snapshot,
  };
}

/**
 * Convert a step-finish part to internal step
 */
export function convertStepFinishPart(part: StepFinishPart): InternalStep {
  return {
    id: part.id,
    phase: "finish",
    reason: part.reason,
    snapshot: part.snapshot,
    cost: part.cost,
    tokens: {
      input: part.tokens.input,
      output: part.tokens.output,
      reasoning: part.tokens.reasoning,
      cached: part.tokens.cache.read + part.tokens.cache.write,
    },
  };
}

// =============================================================================
// Patch Part Converter
// =============================================================================

/**
 * Convert a patch part to internal patch
 */
export function convertPatchPart(part: PatchPart): InternalPatch {
  return {
    id: part.id,
    hash: part.hash,
    files: part.files,
  };
}

// =============================================================================
// Subtask Part Converter
// =============================================================================

/**
 * Convert a subtask part to internal subtask
 */
export function convertSubtaskPart(part: SubtaskPart): InternalSubtask {
  return {
    id: part.id,
    prompt: part.prompt,
    description: part.description,
    agent: part.agent,
  };
}

// =============================================================================
// Agent Part Converter
// =============================================================================

/**
 * Extract agent name from an agent part
 */
export function convertAgentPart(part: AgentPart): string {
  return part.name;
}

// =============================================================================
// Retry Part Converter
// =============================================================================

/**
 * Convert a retry part to internal retry
 */
export function convertRetryPart(part: RetryPart): InternalRetry {
  return {
    id: part.id,
    attempt: part.attempt,
    error: {
      name: part.error.name,
      message: part.error.data.message,
      statusCode: part.error.data.statusCode,
      isRetryable: part.error.data.isRetryable,
    },
    createdAt: part.time.created,
  };
}

// =============================================================================
// Compaction Part Converter
// =============================================================================

/**
 * Check if a compaction part indicates auto-compaction
 */
export function convertCompactionPart(part: CompactionPart): boolean {
  return part.auto;
}

// =============================================================================
// Generic Part Converter
// =============================================================================

/**
 * Result of converting a part - can update multiple fields of InternalMessage
 */
export interface PartConversionResult {
  text?: string;
  reasoning?: InternalReasoning;
  toolCall?: InternalToolCall;
  toolResult?: { callID: string; result: string };
  file?: InternalFilePart;
  step?: InternalStep;
  patch?: InternalPatch;
  subtask?: InternalSubtask;
  retry?: InternalRetry;
  agent?: string;
  isCompacted?: boolean;
}

/**
 * Convert any part type to the appropriate internal format.
 * Accepts ExtendedPart to handle legacy tool-invocation and tool-result types.
 */
export function convertPart(part: ExtendedPart): PartConversionResult {
  switch (part.type) {
    case "text":
      return { text: convertTextPart(part) };
      
    case "reasoning":
      return { reasoning: convertReasoningPart(part) };
      
    case "file":
      return { file: convertFilePart(part) };
      
    case "tool":
      return { toolCall: convertToolPart(part) };
      
    case "tool-invocation":
      return { toolCall: convertToolInvocationPart(part) };
      
    case "tool-result":
      const toolResult = convertToolResultPart(part);
      if (toolResult.callID && toolResult.result) {
        return { toolResult: { callID: toolResult.callID, result: toolResult.result } };
      }
      return {};
      
    case "step-start":
      return { step: convertStepStartPart(part) };
      
    case "step-finish":
      return { step: convertStepFinishPart(part) };
      
    case "patch":
      return { patch: convertPatchPart(part) };
      
    case "subtask":
      return { subtask: convertSubtaskPart(part) };
      
    case "agent":
      return { agent: convertAgentPart(part) };
      
    case "retry":
      return { retry: convertRetryPart(part) };
      
    case "compaction":
      return { isCompacted: convertCompactionPart(part) };
      
    default:
      // Handle unknown part types gracefully
      console.warn("[PartConverter] Unknown part type:", (part as { type: string }).type);
      return {};
  }
}
