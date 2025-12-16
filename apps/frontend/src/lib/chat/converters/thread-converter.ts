/**
 * Thread Converter
 * 
 * Converts InternalMessage to assistant-ui's ThreadMessageLike format.
 * This is used with useExternalStoreRuntime's convertMessage option.
 * 
 * All types are properly aligned with assistant-ui's expected format:
 * - TextMessagePart, ReasoningMessagePart, ImageMessagePart, FileMessagePart
 * - ToolCallMessagePart with ReadonlyJSONObject args
 * - DataMessagePart with required 'name' field
 * 
 * Message Grouping:
 * - Assistant messages with the same parentID are grouped together
 * - This enables multi-step tool call chains to display as single responses
 * - The convertMessagesGrouped function handles this grouping
 * 
 * @see https://www.assistant-ui.com/docs/runtimes/custom/external-store
 */

import type {
  ThreadMessageLike,
  TextMessagePart,
  ReasoningMessagePart,
  ImageMessagePart,
  FileMessagePart,
  ToolCallMessagePart,
  DataMessagePart,
  ThreadUserMessagePart,
  ThreadAssistantMessagePart,
} from "@assistant-ui/react";

import type { ReadonlyJSONObject, ReadonlyJSONValue } from "assistant-stream/utils";

import type {
  InternalMessage,
  InternalToolCall,
  InternalFilePart,
  InternalStep,
  InternalPatch,
  InternalSubtask,
} from "../types/messages";

// =============================================================================
// Main Conversion Function
// =============================================================================

/**
 * Convert an InternalMessage to ThreadMessageLike format.
 * 
 * This is the main converter function used with useExternalStoreRuntime.
 * 
 * Mapping:
 * - text -> TextMessagePart
 * - reasoning -> ReasoningMessagePart (native support!)
 * - toolCalls -> ToolCallMessagePart with result/error
 * - files -> ImageMessagePart or FileMessagePart based on mime type
 * - patches, subtasks -> DataMessagePart with name identifier
 * - cost, tokens -> metadata.custom
 */
export function convertMessage(message: InternalMessage): ThreadMessageLike {
  if (message.role === "user") {
    return convertUserMessage(message);
  }
  return convertAssistantMessage(message);
}

// =============================================================================
// Message Grouping Functions
// =============================================================================

/**
 * Group messages by parentID and convert to ThreadMessageLike array.
 * 
 * This function groups consecutive assistant messages that share the same parentID
 * into a single merged assistant message. This is how OpenCode represents multi-step
 * responses (e.g., tool call followed by final response) that should appear as one
 * cohesive assistant turn in the UI.
 * 
 * Grouping Rules:
 * 1. User messages are never grouped - they pass through as-is
 * 2. Assistant messages with the same parentID are merged together
 * 3. Assistant messages without parentID pass through as-is
 * 4. The merged message uses the first message's ID but accumulates all content
 * 
 * @param messages Array of InternalMessages from state
 * @returns Array of ThreadMessageLike ready for assistant-ui runtime
 */
export function convertMessagesGrouped(messages: InternalMessage[]): ThreadMessageLike[] {
  const result: ThreadMessageLike[] = [];
  
  // Group assistant messages by their parentID
  // Key: parentID (or message ID for user messages / assistant messages without parentID)
  // Value: Array of messages belonging to this group
  const groups = new Map<string, InternalMessage[]>();
  const groupOrder: string[] = []; // Maintain insertion order
  
  for (const msg of messages) {
    if (msg.role === "user") {
      // User messages are their own group
      const key = `user:${msg.id}`;
      groups.set(key, [msg]);
      groupOrder.push(key);
    } else if (msg.role === "assistant") {
      // Group assistant messages by parentID
      const parentId = msg.parentID;
      
      if (parentId) {
        const key = `assistant:${parentId}`;
        const existing = groups.get(key);
        
        if (existing) {
          // Add to existing group
          existing.push(msg);
        } else {
          // Start new group
          groups.set(key, [msg]);
          groupOrder.push(key);
        }
      } else {
        // No parentID - treat as its own group
        const key = `assistant-single:${msg.id}`;
        groups.set(key, [msg]);
        groupOrder.push(key);
      }
    }
  }
  
  // Convert each group to ThreadMessageLike
  for (const key of groupOrder) {
    const group = groups.get(key)!;
    
    if (group[0].role === "user") {
      // User message - convert directly
      result.push(convertUserMessage(group[0]));
    } else {
      // Assistant message(s) - merge if multiple
      if (group.length === 1) {
        result.push(convertAssistantMessage(group[0]));
      } else {
        result.push(mergeAssistantMessages(group));
      }
    }
  }
  
  return result;
}

/**
 * Merge multiple assistant messages into a single ThreadMessageLike.
 * 
 * This combines content from multiple assistant messages that share the same parentID.
 * The messages are sorted by creation time and content is preserved in chronological order.
 * 
 * IMPORTANT: Each message's content parts flow naturally in sequence:
 * - Message 1's reasoning, text, tools stay together
 * - Then Message 2's reasoning, text, tools
 * - etc.
 * 
 * This preserves the natural conversation flow where the AI might:
 * 1. Say something, call a tool
 * 2. See the result, say more, call another tool
 * 3. Finally provide a summary
 * 
 * @param messages Array of assistant InternalMessages to merge
 * @returns Single merged ThreadMessageLike
 */
function mergeAssistantMessages(messages: InternalMessage[]): ThreadMessageLike {
  if (messages.length === 0) {
    throw new Error("Cannot merge empty message array");
  }
  
  if (messages.length === 1) {
    return convertAssistantMessage(messages[0]);
  }
  
  // Sort messages by creation time to ensure chronological order
  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a.createdAt?.getTime() ?? 0;
    const timeB = b.createdAt?.getTime() ?? 0;
    return timeA - timeB;
  });
  
  // Use the first message as the base for ID and timestamps
  const firstMessage = sortedMessages[0];
  const lastMessage = sortedMessages[sortedMessages.length - 1];
  
  const content: ThreadAssistantMessagePart[] = [];
  
  // Accumulate metadata across all messages
  let totalCost = 0;
  let totalTokens = { input: 0, output: 0, reasoning: 0, cached: 0 };
  const allSteps: InternalStep[] = [];
  const allPatches: InternalPatch[] = [];
  const allSubtasks: InternalSubtask[] = [];
  const allRetries: { id: string; attempt: number; error: { name: string; message: string; statusCode?: number; isRetryable?: boolean }; createdAt: number }[] = [];
  let agent: string | undefined;
  let isCompacted = false;
  
  // Process each message in chronological order
  // Each message's content stays together to preserve the natural conversation flow
  for (const msg of sortedMessages) {
    // 1. Add reasoning parts (typically come first in a response)
    for (const reasoning of msg.reasoning) {
      const reasoningPart: ReasoningMessagePart = {
        type: "reasoning",
        text: reasoning.text,
      };
      content.push(reasoningPart);
    }
    
    // 2. Add text content (the main response text)
    // Add text BEFORE tool calls since that's the natural flow:
    // "Let me check..." -> [tool call] -> "Based on results..."
    if (msg.text && msg.text.trim()) {
      const textPart: TextMessagePart = {
        type: "text",
        text: msg.text,
      };
      content.push(textPart);
    }
    
    // 3. Add tool calls (after the text that introduces them)
    for (const [, toolCall] of msg.toolCalls) {
      content.push(convertToolCallToPart(toolCall));
    }
    
    // 4. Add file attachments
    for (const file of msg.files) {
      content.push(convertFileToAssistantPart(file));
    }
    
    // 5. Accumulate metadata
    if (msg.cost !== undefined) {
      totalCost += msg.cost;
    }
    if (msg.tokens) {
      totalTokens.input += msg.tokens.input;
      totalTokens.output += msg.tokens.output;
      totalTokens.reasoning += msg.tokens.reasoning;
      totalTokens.cached += msg.tokens.cached ?? 0;
    }
    allSteps.push(...msg.steps);
    allPatches.push(...msg.patches);
    allSubtasks.push(...msg.subtasks);
    for (const retry of msg.retries) {
      allRetries.push({
        id: retry.id,
        attempt: retry.attempt,
        error: {
          name: retry.error.name,
          message: retry.error.message,
          statusCode: retry.error.statusCode,
          isRetryable: retry.error.isRetryable,
        },
        createdAt: retry.createdAt,
      });
    }
    if (msg.agent) {
      agent = msg.agent;
    }
    if (msg.isCompacted) {
      isCompacted = true;
    }
  }
  
  // Add data parts for patches and subtasks (from accumulated data)
  if (allPatches.length > 0) {
    const patchesPart: DataMessagePart = {
      type: "data",
      name: "opencode-patches",
      data: serializePatches(allPatches),
    };
    content.push(patchesPart);
  }
  
  if (allSubtasks.length > 0) {
    const subtasksPart: DataMessagePart = {
      type: "data",
      name: "opencode-subtasks",
      data: serializeSubtasks(allSubtasks),
    };
    content.push(subtasksPart);
  }
  
  // Ensure at least one content part
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }
  
  // Build steps metadata for token display
  const finishedSteps = allSteps.filter(s => s.phase === "finish" && s.tokens);
  const steps = finishedSteps.map(step => ({
    usage: step.tokens ? {
      promptTokens: step.tokens.input,
      completionTokens: step.tokens.output,
    } : undefined,
  }));
  
  // Build custom metadata
  const custom: Record<string, ReadonlyJSONValue> = {};
  if (totalCost > 0) {
    custom.cost = totalCost;
  }
  if (totalTokens.input > 0 || totalTokens.output > 0) {
    custom.tokens = totalTokens;
  }
  if (agent) {
    custom.agent = agent;
  }
  if (isCompacted) {
    custom.isCompacted = true;
  }
  if (allRetries.length > 0) {
    custom.retries = allRetries;
  }
  if (allSteps.length > 0) {
    custom.steps = serializeSteps(allSteps);
  }
  if (allPatches.length > 0) {
    custom.patches = serializePatches(allPatches);
  }
  if (allSubtasks.length > 0) {
    custom.subtasks = serializeSubtasks(allSubtasks);
  }
  // Store the original message IDs for reference
  custom.mergedMessageIds = sortedMessages.map(m => m.id);
  
  // Determine message status - check last message's status
  const status = determineMessageStatus(lastMessage);
  
  return {
    role: "assistant",
    content,
    id: firstMessage.id, // Use first message ID for stability
    createdAt: firstMessage.createdAt,
    status,
    metadata: {
      steps: steps.length > 0 ? steps : undefined,
      custom: Object.keys(custom).length > 0 ? custom : undefined,
    },
  };
}

// =============================================================================
// User Message Conversion
// =============================================================================

/**
 * Convert a user message to ThreadMessageLike
 */
function convertUserMessage(message: InternalMessage): ThreadMessageLike {
  const content: ThreadUserMessagePart[] = [];
  
  // Add text content
  if (message.text) {
    const textPart: TextMessagePart = {
      type: "text",
      text: message.text,
    };
    content.push(textPart);
  }
  
  // Add file attachments
  for (const file of message.files) {
    content.push(convertFileToUserPart(file));
  }
  
  // Ensure at least one content part
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }
  
  return {
    role: "user",
    content,
    id: message.id,
    createdAt: message.createdAt,
  };
}

// =============================================================================
// Assistant Message Conversion
// =============================================================================

/**
 * Convert an assistant message to ThreadMessageLike
 */
function convertAssistantMessage(message: InternalMessage): ThreadMessageLike {
  const content: ThreadAssistantMessagePart[] = [];
  
  // 1. Add reasoning parts first (they typically come before the main response)
  for (const reasoning of message.reasoning) {
    const reasoningPart: ReasoningMessagePart = {
      type: "reasoning",
      text: reasoning.text,
    };
    content.push(reasoningPart);
  }
  
  // 2. Add main text content
  if (message.text) {
    const textPart: TextMessagePart = {
      type: "text",
      text: message.text,
    };
    content.push(textPart);
  }
  
  // 3. Add tool calls
  for (const [, toolCall] of message.toolCalls) {
    content.push(convertToolCallToPart(toolCall));
  }
  
  // 4. Add file attachments (e.g., from tool outputs)
  for (const file of message.files) {
    content.push(convertFileToAssistantPart(file));
  }
  
  // 5. Add custom data parts for OpenCode-specific content
  if (message.patches.length > 0) {
    const patchesPart: DataMessagePart = {
      type: "data",
      name: "opencode-patches",
      data: serializePatches(message.patches),
    };
    content.push(patchesPart);
  }
  
  if (message.subtasks.length > 0) {
    const subtasksPart: DataMessagePart = {
      type: "data",
      name: "opencode-subtasks",
      data: serializeSubtasks(message.subtasks),
    };
    content.push(subtasksPart);
  }
  
  // Ensure at least one content part
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }
  
  // Build metadata
  const steps = buildStepsMetadata(message);
  const custom = buildCustomMetadata(message);
  
  // Determine message status
  const status = determineMessageStatus(message);
  
  return {
    role: "assistant",
    content,
    id: message.id,
    createdAt: message.createdAt,
    status,
    metadata: {
      steps: steps.length > 0 ? steps : undefined,
      custom: Object.keys(custom).length > 0 ? custom : undefined,
    },
  };
}

// =============================================================================
// Part Converters
// =============================================================================

/**
 * Convert an InternalToolCall to a ToolCallMessagePart
 */
function convertToolCallToPart(toolCall: InternalToolCall): ToolCallMessagePart {
  // Serialize result - can be string or object
  let result: unknown = undefined;
  if (toolCall.result !== undefined) {
    result = toolCall.result;
  } else if (toolCall.status === "error" && toolCall.error) {
    result = { error: toolCall.error };
  }
  
  return {
    type: "tool-call",
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    args: serializeArgs(toolCall.args),
    argsText: toolCall.argsRaw ?? JSON.stringify(toolCall.args),
    result,
    isError: toolCall.status === "error",
  };
}

/**
 * Convert an InternalFilePart to a user message part (ImageMessagePart or FileMessagePart)
 */
function convertFileToUserPart(file: InternalFilePart): ImageMessagePart | FileMessagePart {
  if (file.mime.startsWith("image/")) {
    return {
      type: "image",
      image: file.url,
      filename: file.filename,
    };
  }
  
  return {
    type: "file",
    data: file.url,
    mimeType: file.mime,
    filename: file.filename,
  };
}

/**
 * Convert an InternalFilePart to an assistant message part
 */
function convertFileToAssistantPart(file: InternalFilePart): ImageMessagePart | FileMessagePart {
  // Same conversion for assistant messages
  return convertFileToUserPart(file);
}

// =============================================================================
// Metadata Builders
// =============================================================================

/**
 * Build ThreadStep[] metadata from InternalSteps
 * This enables assistant-ui's token usage display
 */
function buildStepsMetadata(message: InternalMessage): Array<{
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}> {
  const finishedSteps = message.steps.filter(s => s.phase === "finish" && s.tokens);
  
  return finishedSteps.map(step => ({
    usage: step.tokens ? {
      promptTokens: step.tokens.input,
      completionTokens: step.tokens.output,
    } : undefined,
  }));
}

/**
 * Build custom metadata for OpenCode-specific data
 */
function buildCustomMetadata(message: InternalMessage): Record<string, ReadonlyJSONValue> {
  const custom: Record<string, ReadonlyJSONValue> = {};
  
  if (message.cost !== undefined) {
    custom.cost = message.cost;
  }
  
  if (message.tokens) {
    custom.tokens = {
      input: message.tokens.input,
      output: message.tokens.output,
      reasoning: message.tokens.reasoning,
      cached: message.tokens.cached ?? 0,
    };
  }
  
  if (message.agent) {
    custom.agent = message.agent;
  }
  
  if (message.isCompacted) {
    custom.isCompacted = true;
  }
  
  if (message.retries.length > 0) {
    custom.retries = message.retries.map(r => ({
      id: r.id,
      attempt: r.attempt,
      error: {
        name: r.error.name,
        message: r.error.message,
        statusCode: r.error.statusCode ?? null,
        isRetryable: r.error.isRetryable ?? null,
      },
      createdAt: r.createdAt,
    }));
  }
  
  if (message.steps.length > 0) {
    custom.steps = serializeSteps(message.steps);
  }
  
  if (message.patches.length > 0) {
    custom.patches = serializePatches(message.patches);
  }
  
  if (message.subtasks.length > 0) {
    custom.subtasks = serializeSubtasks(message.subtasks);
  }
  
  return custom;
}

/**
 * Determine the message status based on tool call states
 */
function determineMessageStatus(message: InternalMessage): ThreadMessageLike["status"] {
  // Check if any tool calls are pending/running
  for (const [, toolCall] of message.toolCalls) {
    if (toolCall.status === "pending" || toolCall.status === "running") {
      return { type: "running" };
    }
  }
  
  // Check if message has a completion time (fully done)
  if (message.completedAt) {
    return { type: "complete", reason: "stop" };
  }
  
  // Default to complete if no active tool calls
  return { type: "complete", reason: "stop" };
}

// =============================================================================
// Serialization Helpers (ensure JSON-safe values matching ReadonlyJSONValue)
// =============================================================================

/**
 * Serialize args to ReadonlyJSONObject (required by ToolCallMessagePart)
 */
function serializeArgs(args: Record<string, unknown>): ReadonlyJSONObject {
  const result: Record<string, ReadonlyJSONValue> = {};
  for (const [key, value] of Object.entries(args)) {
    result[key] = serializeValue(value);
  }
  return result;
}

/**
 * Serialize any value to ReadonlyJSONValue
 */
function serializeValue(value: unknown): ReadonlyJSONValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (typeof value === "object") {
    const result: Record<string, ReadonlyJSONValue> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serializeValue(v);
    }
    return result;
  }
  return String(value);
}

/**
 * Serialize patches for JSON storage
 */
function serializePatches(patches: InternalPatch[]): ReadonlyJSONValue {
  return patches.map(p => ({
    id: p.id,
    hash: p.hash,
    files: p.files,
  }));
}

/**
 * Serialize subtasks for JSON storage
 */
function serializeSubtasks(subtasks: InternalSubtask[]): ReadonlyJSONValue {
  return subtasks.map(s => ({
    id: s.id,
    prompt: s.prompt,
    description: s.description,
    agent: s.agent,
  }));
}

/**
 * Serialize steps for JSON storage
 */
function serializeSteps(steps: InternalStep[]): ReadonlyJSONValue {
  return steps.map(s => ({
    id: s.id,
    phase: s.phase,
    startTime: s.startTime ?? null,
    endTime: s.endTime ?? null,
    reason: s.reason ?? null,
    snapshot: s.snapshot ?? null,
    cost: s.cost ?? null,
    tokens: s.tokens ? {
      input: s.tokens.input,
      output: s.tokens.output,
      reasoning: s.tokens.reasoning,
      cached: s.tokens.cached ?? 0,
    } : null,
  }));
}

// =============================================================================
// Metadata Extractors (for use in UI components)
// =============================================================================

/**
 * Extract cost from message metadata
 */
export function getMessageCost(message: ThreadMessageLike): number | undefined {
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  return typeof custom?.cost === "number" ? custom.cost : undefined;
}

/**
 * Extract tokens from message metadata
 */
export function getMessageTokens(message: ThreadMessageLike): {
  input: number;
  output: number;
  reasoning: number;
  cached?: number;
} | undefined {
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const tokens = custom?.tokens as Record<string, number> | undefined;
  if (!tokens) return undefined;
  
  return {
    input: tokens.input ?? 0,
    output: tokens.output ?? 0,
    reasoning: tokens.reasoning ?? 0,
    cached: tokens.cached,
  };
}

/**
 * Extract agent name from message metadata
 */
export function getMessageAgent(message: ThreadMessageLike): string | undefined {
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  return typeof custom?.agent === "string" ? custom.agent : undefined;
}

/**
 * Extract patches from message metadata
 */
export function getMessagePatches(message: ThreadMessageLike): InternalPatch[] {
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const patches = custom?.patches;
  if (!Array.isArray(patches)) return [];
  return patches as InternalPatch[];
}

/**
 * Extract subtasks from message metadata
 */
export function getMessageSubtasks(message: ThreadMessageLike): InternalSubtask[] {
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const subtasks = custom?.subtasks;
  if (!Array.isArray(subtasks)) return [];
  return subtasks as InternalSubtask[];
}

/**
 * Extract steps from message metadata
 */
export function getMessageSteps(message: ThreadMessageLike): InternalStep[] {
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const steps = custom?.steps;
  if (!Array.isArray(steps)) return [];
  return steps as InternalStep[];
}

/**
 * Check if message is compacted
 */
export function isMessageCompacted(message: ThreadMessageLike): boolean {
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  return custom?.isCompacted === true;
}

// =============================================================================
// Type Guards for DataMessageParts
// =============================================================================

/**
 * Check if a content part is a patches data part
 */
export function isPatchesDataPart(
  part: ThreadAssistantMessagePart
): part is DataMessagePart & { data: Array<{ id: string; hash: string; files: string[] }> } {
  return part.type === "data" && (part as DataMessagePart).name === "opencode-patches";
}

/**
 * Check if a content part is a subtasks data part
 */
export function isSubtasksDataPart(
  part: ThreadAssistantMessagePart
): part is DataMessagePart & { data: Array<{ id: string; prompt: string; description: string; agent: string }> } {
  return part.type === "data" && (part as DataMessagePart).name === "opencode-subtasks";
}
