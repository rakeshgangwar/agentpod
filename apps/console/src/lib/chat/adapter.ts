/**
 * OpenCode Chat Model Adapter for assistant-ui
 * 
 * @deprecated This adapter is not currently used. The active SSE implementation
 * is in RuntimeProvider.tsx which uses BrowserSSEClient directly.
 * This file is kept for reference but may be removed in the future.
 * 
 * SSE Event Flow:
 * 1. message.updated (role: "user") - User message registered
 * 2. message.updated (role: "assistant") - Assistant message created (initially empty)
 * 3. message.part.updated (type: "text") - Text streaming updates with delta
 * 4. message.part.updated (type: "tool-invocation") - Tool calls
 * 5. session.idle - Processing complete
 */

import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult } from "@assistant-ui/react";
import type { ReadonlyJSONObject } from "assistant-stream/utils";
import {
  sandboxOpencodeCreateSession,
  sandboxOpencodeListSessions,
  sandboxOpencodeSendMessage,
  sandboxOpencodeAbortSession,
  sandboxOpencodeListMessages,
  type Session,
  type Message,
} from "$lib/api/tauri";
import {
  BrowserSSEClient,
  toLegacyFormat,
  type SSEOpenCodeEvent,
  type SSEStatus,
} from "$lib/api/browser-sse";

/**
 * State for tracking the current session
 */
interface SessionState {
  projectId: string;
  sessionId: string | null;
}

/**
 * Tool call tracking for UI display
 */
interface ToolCall {
  id: string;
  name: string;
  args?: unknown;
  state: "pending" | "running" | "complete" | "error";
  result?: unknown;
}

/**
 * Create an OpenCode chat model adapter for a specific project
 * 
 * @param projectId - The project ID to connect to
 * @param initialSessionId - Optional session ID to use (if not provided, uses most recent or creates new)
 * @returns ChatModelAdapter compatible with assistant-ui
 */
export function createOpenCodeAdapter(projectId: string, initialSessionId?: string): ChatModelAdapter {
  // Session state - persisted across runs
  const state: SessionState = {
    projectId,
    sessionId: initialSessionId || null,
  };

  let sseClient: BrowserSSEClient | null = null;

  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult> {
      try {
        // Ensure we have a session (projectId is actually sandboxId in v2 API)
        if (!state.sessionId) {
          // Try to get existing sessions first
          const sessions = await sandboxOpencodeListSessions(state.projectId);
          if (sessions.length > 0) {
            // Use the most recent session
            state.sessionId = sessions[0].id;
          } else {
            // Create a new session
            const session = await sandboxOpencodeCreateSession(state.projectId);
            state.sessionId = session.id;
          }
        }

        // Get the last user message
        const lastUserMessage = messages[messages.length - 1];
        if (!lastUserMessage || lastUserMessage.role !== "user") {
          throw new Error("No user message to send");
        }

        // Extract text from the user message
        const textContent = lastUserMessage.content.find(
          (part) => part.type === "text"
        );
        if (!textContent || textContent.type !== "text") {
          throw new Error("No text content in user message");
        }

        // Streaming state - use a mutable object so SSE callbacks can update it
        const streamState = {
          accumulatedText: "",
          toolCalls: new Map<string, ToolCall>(),
          assistantMessageId: null as string | null,
          isComplete: false,
          error: null as Error | null,
          lastUpdate: Date.now(),
        };

        console.log('[OpenCode Adapter] Connecting to SSE for project:', state.projectId);
        
        let receivedAnyEvent = false;
        
        const handleSSEEvent = (event: SSEOpenCodeEvent) => {
          receivedAnyEvent = true;
          streamState.lastUpdate = Date.now();
          
          const legacyEvent = toLegacyFormat(event);
          console.log('[OpenCode Adapter] SSE Event:', legacyEvent.eventType, JSON.stringify(legacyEvent.data).slice(0, 300));
          
          const eventData = legacyEvent.data as Record<string, unknown>;
          const properties = eventData?.properties as Record<string, unknown> | undefined;
          
          if (legacyEvent.eventType === "message.updated") {
            const info = properties?.info as Record<string, unknown> | undefined;
            if (info?.role === "assistant" && typeof info.id === "string") {
              streamState.assistantMessageId = info.id;
              console.log('[OpenCode Adapter] Assistant message ID:', streamState.assistantMessageId);
            }
          }
          
          if (legacyEvent.eventType === "message.part.updated") {
            const part = properties?.part as Record<string, unknown> | undefined;
            const delta = properties?.delta as string | undefined;
            
            console.log('[OpenCode Adapter] Part update - type:', part?.type, 'has text:', !!part?.text, 'has delta:', !!delta);
            
            if (part?.type === "text") {
              if (typeof part.text === "string") {
                streamState.accumulatedText = part.text;
                console.log('[OpenCode Adapter] Text update (full), length:', streamState.accumulatedText.length);
              } else if (delta) {
                streamState.accumulatedText += delta;
                console.log('[OpenCode Adapter] Text update (delta), total length:', streamState.accumulatedText.length);
              }
            }
            
            if (part?.type === "tool-invocation") {
              const toolInvocation = part.toolInvocation as Record<string, unknown> | undefined;
              if (toolInvocation?.toolCallId && typeof toolInvocation.toolCallId === "string") {
                const toolCall: ToolCall = {
                  id: toolInvocation.toolCallId,
                  name: (toolInvocation.toolName as string) || "unknown",
                  args: toolInvocation.args,
                  state: (toolInvocation.state as "pending" | "running" | "complete" | "error") || "running",
                  result: toolInvocation.result,
                };
                streamState.toolCalls.set(toolCall.id, toolCall);
                console.log('[OpenCode Adapter] Tool call (legacy):', toolCall.name, toolCall.state);
              }
            }
            
            if (part?.type === "tool") {
              const callID = part.callID as string | undefined;
              const toolName = part.tool as string | undefined;
              const partState = part.state as Record<string, unknown> | undefined;
              
              if (callID && toolName) {
                const status = partState?.status as string | undefined;
                const toolCall: ToolCall = {
                  id: callID,
                  name: toolName,
                  args: partState?.input,
                  state: status === "completed" ? "complete" : status === "error" ? "error" : "running",
                  result: partState?.output,
                };
                streamState.toolCalls.set(toolCall.id, toolCall);
                console.log('[OpenCode Adapter] Tool call:', toolCall.name, toolCall.state);
              }
            }
          }
          
          if (legacyEvent.eventType === "session.idle") {
            console.log('[OpenCode Adapter] Session idle - streaming complete');
            streamState.isComplete = true;
          }
          
          if (legacyEvent.eventType === "session.updated") {
            const info = properties?.info as Record<string, unknown> | undefined;
            const status = info?.status as Record<string, unknown> | undefined;
            if (status?.type === "idle") {
              console.log('[OpenCode Adapter] Session status idle via session.updated - streaming complete');
              streamState.isComplete = true;
            }
          }
          
          if (legacyEvent.eventType === "error") {
            console.error('[OpenCode Adapter] Error event:', legacyEvent.data);
            streamState.error = new Error(String(legacyEvent.data));
            streamState.isComplete = true;
          }
          
          if (legacyEvent.eventType === "session.error") {
            const errorMessage = (properties?.error as string) || 
                                (properties?.message as string) || 
                                "Session error occurred";
            console.error('[OpenCode Adapter] Session error:', errorMessage, properties);
            streamState.error = new Error(errorMessage);
            streamState.isComplete = true;
          }
        };
        
        const handleSSEStatus = (status: SSEStatus, error?: string) => {
          console.log('[OpenCode Adapter] SSE status:', status, error);
          if (status === "error") {
            streamState.error = new Error(error || "SSE error");
            streamState.isComplete = true;
          } else if (status === "disconnected") {
            if (streamState.accumulatedText) {
              streamState.isComplete = true;
            }
          }
        };
        
        sseClient = new BrowserSSEClient(state.projectId, {
          onEvent: handleSSEEvent,
          onStatus: handleSSEStatus,
        });
        sseClient.connect();

        const abortHandler = () => {
          console.log('[OpenCode Adapter] Abort signal received');
          if (state.sessionId) {
            sandboxOpencodeAbortSession(state.projectId, state.sessionId).catch(console.error);
          }
          sseClient?.disconnect();
          streamState.isComplete = true;
        };
        abortSignal?.addEventListener("abort", abortHandler);

        // Small delay to ensure stream is fully established
        await new Promise((resolve) => setTimeout(resolve, 100));
        console.log('[OpenCode Adapter] Stream connected, sending message...');

        // Send the message WITHOUT awaiting - this is fire-and-forget
        // The actual response comes through SSE events
        console.log('[OpenCode Adapter] Sending message to session:', state.sessionId);
        let sendPromise: Promise<unknown> | null = null;
        try {
          // Fire and forget - don't await here! (projectId is actually sandboxId in v2 API)
          sendPromise = sandboxOpencodeSendMessage(state.projectId, state.sessionId, textContent.text)
            .then((response: Message | null) => {
              console.log('[OpenCode Adapter] Message send completed, response has parts:', response?.parts?.length);
            })
            .catch((sendError: unknown) => {
              console.error('[OpenCode Adapter] Failed to send message:', sendError);
              streamState.error = sendError instanceof Error ? sendError : new Error(String(sendError));
              streamState.isComplete = true;
            });
        } catch (sendError) {
          console.error('[OpenCode Adapter] Failed to initiate send:', sendError);
          throw sendError;
        }

        // Polling loop - yield updates as they come in
        let lastYieldedText = "";
        let lastYieldedToolCount = 0;
        const maxWaitTime = 120000; // 2 minutes max wait
        const startTime = Date.now();
        const idleTimeout = 5000; // Consider complete if no updates for 5 seconds after getting text
        let pollCount = 0;
        
        while (!streamState.isComplete && (Date.now() - startTime) < maxWaitTime) {
          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 50));
          pollCount++;
          
          // Log progress every 2 seconds
          if (pollCount % 40 === 0) {
            console.log('[OpenCode Adapter] Poll check:', {
              pollCount,
              receivedAnyEvent,
              isComplete: streamState.isComplete,
              textLength: streamState.accumulatedText.length,
              toolCalls: streamState.toolCalls.size,
              elapsedMs: Date.now() - startTime,
            });
          }

          // Check if we have text and should yield an update
          const hasNewText = streamState.accumulatedText !== lastYieldedText;
          const hasNewTools = streamState.toolCalls.size !== lastYieldedToolCount;
          
          if (hasNewText || hasNewTools) {
            lastYieldedText = streamState.accumulatedText;
            lastYieldedToolCount = streamState.toolCalls.size;
            
            // Build the content array with text and tool calls
            const contentParts: Array<
              | { type: "text"; text: string }
              | { type: "tool-call"; toolCallId: string; toolName: string; args: ReadonlyJSONObject; argsText: string; result?: unknown }
            > = [];
            
            // Add text if we have any
            if (streamState.accumulatedText) {
              contentParts.push({ type: "text" as const, text: streamState.accumulatedText });
            }
            
            // Add tool calls
            for (const [, toolCall] of streamState.toolCalls) {
              const args = (toolCall.args ?? {}) as ReadonlyJSONObject;
              contentParts.push({
                type: "tool-call" as const,
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                args,
                argsText: JSON.stringify(args),
                result: toolCall.state === "complete" ? toolCall.result : undefined,
              });
            }
            
            if (contentParts.length > 0) {
              console.log('[OpenCode Adapter] Yielding update, text length:', streamState.accumulatedText.length, 'tool calls:', streamState.toolCalls.size);
              yield { content: contentParts as ChatModelRunResult["content"] };
            }
          }
          
          // If we have text and haven't received updates for a while, consider it complete
          if (streamState.accumulatedText && (Date.now() - streamState.lastUpdate) > idleTimeout) {
            console.log('[OpenCode Adapter] Idle timeout - marking complete');
            streamState.isComplete = true;
          }
        }

        abortSignal?.removeEventListener("abort", abortHandler);
        sseClient?.disconnect();
        sseClient = null;

        if (streamState.error) {
          throw streamState.error;
        }

        // Final yield with complete response
        const hasNewContent = streamState.accumulatedText !== lastYieldedText || streamState.toolCalls.size !== lastYieldedToolCount;
        if (hasNewContent) {
          const contentParts: Array<
            | { type: "text"; text: string }
            | { type: "tool-call"; toolCallId: string; toolName: string; args: ReadonlyJSONObject; argsText: string; result?: unknown }
          > = [];
          
          if (streamState.accumulatedText) {
            contentParts.push({ type: "text" as const, text: streamState.accumulatedText });
          }
          
          for (const [, toolCall] of streamState.toolCalls) {
            const args = (toolCall.args ?? {}) as ReadonlyJSONObject;
            contentParts.push({
              type: "tool-call" as const,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              args,
              argsText: JSON.stringify(args),
              result: toolCall.state === "complete" ? toolCall.result : undefined,
            });
          }
          
          if (contentParts.length > 0) {
            console.log('[OpenCode Adapter] Final yield, text length:', streamState.accumulatedText.length, 'tool calls:', streamState.toolCalls.size);
            yield { content: contentParts as ChatModelRunResult["content"] };
          }
        }
        
        // If we never got any text, this might be an issue
        if (!streamState.accumulatedText) {
          console.warn('[OpenCode Adapter] No text accumulated during streaming. Events received:', receivedAnyEvent);
        }
        
        console.log('[OpenCode Adapter] Streaming complete:', {
          receivedAnyEvent,
          finalTextLength: streamState.accumulatedText.length,
          toolCallsCount: streamState.toolCalls.size,
          totalPolls: pollCount,
          elapsedMs: Date.now() - startTime,
        });

      } catch (error) {
        console.error('[OpenCode Adapter] Error in run:', error);
        sseClient?.disconnect();
        sseClient = null;
        throw error;
      }
    },
  };
}

/**
 * Get or create a session for a sandbox (projectId is actually sandboxId in v2 API)
 */
export async function getOrCreateSession(sandboxId: string): Promise<Session> {
  const sessions = await sandboxOpencodeListSessions(sandboxId);
  if (sessions.length > 0) {
    return sessions[0];
  }
  return sandboxOpencodeCreateSession(sandboxId);
}

/**
 * Load message history for a session (projectId is actually sandboxId in v2 API)
 */
export async function loadMessageHistory(
  sandboxId: string,
  sessionId: string
): Promise<Message[]> {
  return sandboxOpencodeListMessages(sandboxId, sessionId);
}

/**
 * Convert OpenCode messages to assistant-ui format
 * Includes both text and tool-call parts for proper history display
 */
export function convertToAssistantMessages(messages: Message[]): Array<{
  role: "user" | "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown>; argsText: string; result?: unknown }
  >;
}> {
  return messages.map((msg) => {
    const contentParts: Array<
      | { type: "text"; text: string }
      | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown>; argsText: string; result?: unknown }
    > = [];
    
    for (const part of msg.parts) {
      // Handle text parts
      if (part.type === "text" && part.text) {
        contentParts.push({ type: "text" as const, text: part.text });
      }
      
      // Handle tool parts (OpenCode format)
      if (part.type === "tool" && part.callID && part.tool) {
        const args = (part.state?.input ?? {}) as Record<string, unknown>;
        contentParts.push({
          type: "tool-call" as const,
          toolCallId: part.callID,
          toolName: part.tool,
          args,
          argsText: JSON.stringify(args),
          result: part.state?.output,
        });
      }
      
      // Handle tool-invocation parts (legacy format)
      if (part.type === "tool-invocation" && part.toolInvocation) {
        const ti = part.toolInvocation;
        const args = (ti.args ?? {}) as Record<string, unknown>;
        contentParts.push({
          type: "tool-call" as const,
          toolCallId: ti.toolCallId,
          toolName: ti.toolName,
          args,
          argsText: JSON.stringify(args),
          result: ti.result,
        });
      }
    }
    
    // Ensure we always have at least one content part
    if (contentParts.length === 0) {
      contentParts.push({ type: "text", text: "" });
    }

    return {
      role: msg.info.role,
      content: contentParts,
    };
  });
}
