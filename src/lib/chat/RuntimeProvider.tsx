/**
 * React Runtime Provider for assistant-ui
 * 
 * This component wraps assistant-ui's AssistantRuntimeProvider with our
 * custom OpenCode integration using External Store Runtime.
 * 
 * We use useExternalStoreRuntime which gives us full control over the message
 * state, allowing us to properly handle OpenCode's multi-message pattern
 * (multiple assistant messages per user question during tool calls).
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import {
  opencodeListMessages,
  opencodeListSessions,
  opencodeCreateSession,
  opencodeSendMessage,
  opencodeAbortSession,
  OpenCodeStream,
  type Message,
  type OpenCodeEvent,
  type ModelSelection,
} from "../api/tauri";

interface RuntimeProviderProps {
  projectId: string;
  sessionId?: string;
  selectedModel?: ModelSelection;
  children: ReactNode;
}

// Internal message type (mutable) that we manage
interface InternalMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls: Map<string, {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
  createdAt?: Date;
}

/**
 * Convert OpenCode message to our internal format
 */
function convertOpenCodeMessage(msg: Message): InternalMessage {
  const internal: InternalMessage = {
    id: msg.info.id,
    role: msg.info.role,
    text: "",
    toolCalls: new Map(),
    createdAt: msg.info.time?.created ? new Date(msg.info.time.created) : undefined,
  };

  for (const part of msg.parts) {
    if (part.type === "text" && part.text) {
      internal.text += part.text;
    } 
    // Handle tool-invocation format (legacy)
    else if (part.type === "tool-invocation" && part.toolInvocation) {
      internal.toolCalls.set(part.toolInvocation.toolCallId, {
        toolCallId: part.toolInvocation.toolCallId,
        toolName: part.toolInvocation.toolName,
        args: (part.toolInvocation.args ?? {}) as Record<string, unknown>,
        result: part.toolInvocation.result,
      });
    }
    // Handle "tool" format (current OpenCode format)
    // Structure: { type: "tool", callID, tool, state: { status, input, output, ... } }
    else if (part.type === "tool" && part.callID && part.state) {
      const callID = part.callID;
      const toolName = part.tool || "unknown";
      const state = part.state;
      const status = state.status;
      const input = state.input ?? {};
      const output = state.output;
      
      internal.toolCalls.set(callID, {
        toolCallId: callID,
        toolName,
        args: input,
        result: status === "completed" || status === "error" ? output : undefined,
      });
    }
    // Warn about unhandled tool parts
    else if (part.type === "tool") {
      console.warn("[ToolCall] Unhandled tool part - missing callID or state:", JSON.stringify(part).slice(0, 300));
    }
  }

  return internal;
}

/**
 * Convert internal message to ThreadMessageLike format for assistant-ui
 */
function convertToThreadMessage(msg: InternalMessage): ThreadMessageLike {
  const content: ThreadMessageLike["content"] = [];
  
  if (msg.text) {
    (content as unknown[]).push({ type: "text", text: msg.text });
  }
  
  for (const tc of msg.toolCalls.values()) {
    (content as unknown[]).push({
      type: "tool-call",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: tc.args,
      argsText: JSON.stringify(tc.args),
      result: tc.result,
    });
  }
  
  // Ensure at least one content part
  if (content.length === 0) {
    (content as unknown[]).push({ type: "text", text: "" });
  }

  return {
    id: msg.id,
    role: msg.role,
    content,
    createdAt: msg.createdAt,
  };
}

/**
 * RuntimeProvider wraps children with the assistant-ui runtime
 * configured for OpenCode using External Store Runtime.
 */
export function RuntimeProvider({ projectId, sessionId: initialSessionId, selectedModel, children }: RuntimeProviderProps) {
  // Internal message state (mutable, managed by us)
  const [internalMessages, setInternalMessages] = useState<InternalMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  
  // Stream reference for SSE
  const streamRef = useRef<OpenCodeStream | null>(null);

  // Load initial messages when session changes
  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      if (!sessionId) {
        // Try to get or create a session
        try {
          const sessions = await opencodeListSessions(projectId);
          if (sessions.length > 0) {
            setSessionId(sessions[0].id);
          } else {
            const newSession = await opencodeCreateSession(projectId);
            setSessionId(newSession.id);
          }
        } catch (err) {
          console.error("[RuntimeProvider] Failed to get/create session:", err);
          setError(err instanceof Error ? err.message : "Failed to create session");
        }
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const opencodeMessages = await opencodeListMessages(projectId, sessionId);

        if (cancelled) return;

        const converted = opencodeMessages.map(convertOpenCodeMessage);
        setInternalMessages(converted);
      } catch (err) {
        if (cancelled) return;
        console.error("[RuntimeProvider] Failed to load messages:", err);
        setError(err instanceof Error ? err.message : "Failed to load messages");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [projectId, sessionId]);

  // Handle SSE event to update message state
  const handleSSEEvent = useCallback((event: OpenCodeEvent) => {
    const eventData = event.data as Record<string, unknown>;
    const properties = eventData?.properties as Record<string, unknown> | undefined;

    // Handle message.updated - new message created
    if (event.eventType === "message.updated") {
      const info = properties?.info as Record<string, unknown> | undefined;
      if (info && typeof info.id === "string" && typeof info.role === "string") {
        const messageId = info.id;
        const role = info.role as "user" | "assistant";

        setInternalMessages((prev) => {
          // Check if message already exists by ID
          const existsById = prev.some((m) => m.id === messageId);
          if (existsById) return prev;

          // For user messages, check if there's an optimistic message we should replace
          if (role === "user") {
            const optimisticIndex = prev.findIndex(
              (m) => m.role === "user" && m.id.startsWith("user-")
            );
            if (optimisticIndex !== -1) {
              // Replace the optimistic message with the real one
              const newMessages = [...prev];
              newMessages[optimisticIndex] = {
                ...newMessages[optimisticIndex],
                id: messageId, // Update to real ID
              };
              return newMessages;
            }
          }

          return [
            ...prev,
            {
              id: messageId,
              role,
              text: "",
              toolCalls: new Map(),
              createdAt: new Date(),
            },
          ];
        });
      }
    }

    // Handle message.part.updated - streaming content update
    if (event.eventType === "message.part.updated") {
      const part = properties?.part as Record<string, unknown> | undefined;
      const messageId = (properties?.messageID || (part as Record<string, unknown>)?.messageID) as string | undefined;

      if (!messageId) {
        return;
      }
      
      if (!part) return;

      setInternalMessages((prev) => {
        return prev.map((m) => {
          if (m.id !== messageId) return m;

          // Clone the message to update
          const updated: InternalMessage = {
            ...m,
            toolCalls: new Map(m.toolCalls),
          };

          if (part.type === "text") {
            const delta = properties?.delta as string | undefined;
            if (typeof part.text === "string") {
              updated.text = part.text;
            } else if (delta) {
              updated.text = m.text + delta;
            }
          }

          // Handle tool-invocation format (legacy)
          if (part.type === "tool-invocation") {
            const toolInvocation = part.toolInvocation as Record<string, unknown> | undefined;
            if (toolInvocation?.toolCallId) {
              const toolName = (toolInvocation.toolName as string) || "unknown";
              updated.toolCalls.set(toolInvocation.toolCallId as string, {
                toolCallId: toolInvocation.toolCallId as string,
                toolName,
                args: (toolInvocation.args as Record<string, unknown>) ?? {},
                result: toolInvocation.result,
              });
            }
          }

          // Handle "tool" format (from SSE stream)
          // Format: { type: "tool", callID, tool, state: { input, status, output, ... } }
          if (part.type === "tool") {
            const callID = part.callID as string | undefined;
            const toolName = (part.tool as string | undefined) || "unknown";
            const state = part.state as Record<string, unknown> | undefined;
            
            if (callID) {
              const status = state?.status as string | undefined;
              const input = (state?.input as Record<string, unknown>) ?? {};
              const output = state?.output;
              
              updated.toolCalls.set(callID, {
                toolCallId: callID,
                toolName,
                args: input,
                result: status === "completed" || status === "error" ? output : undefined,
              });
            }
          }

          return updated;
        });
      });
    }

    // Handle session.idle - processing complete
    if (event.eventType === "session.idle") {
      setIsRunning(false);
    }

    // Handle session.updated for status changes
    if (event.eventType === "session.updated") {
      const info = properties?.info as Record<string, unknown> | undefined;
      const status = info?.status as Record<string, unknown> | undefined;
      if (status?.type === "idle") {
        setIsRunning(false);
      }
    }
  }, []);

  // Connect to SSE stream when session is available
  useEffect(() => {
    if (!sessionId || isLoading) return;

    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isCleaningUp = false;
    
    const connectStream = () => {
      if (isCleaningUp) return;
      
      const stream = new OpenCodeStream(projectId);
      streamRef.current = stream;

      stream.connect(
        handleSSEEvent,
        (status, err) => {
          if (status === "error") {
            console.warn("[RuntimeProvider] Stream error:", err);
          }
          // Try to reconnect after disconnection (unless we're cleaning up)
          if (status === "disconnected" && !isCleaningUp) {
            reconnectTimeout = setTimeout(connectStream, 2000);
          }
        }
      ).catch((err) => {
        console.error("[RuntimeProvider] Failed to connect SSE:", err);
        // Try to reconnect after failure (unless we're cleaning up)
        if (!isCleaningUp) {
          reconnectTimeout = setTimeout(connectStream, 2000);
        }
      });
    };

    connectStream();

    return () => {
      isCleaningUp = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (streamRef.current) {
        streamRef.current.disconnect().catch(console.error);
        streamRef.current = null;
      }
    };
  }, [projectId, sessionId, isLoading, handleSSEEvent]);

  // Handle sending a new message
  const onNew = useCallback(async (message: AppendMessage) => {
    if (!sessionId) {
      console.error("[RuntimeProvider] No session ID");
      return;
    }

    // Extract text from message
    const textPart = message.content.find((p) => p.type === "text");
    if (!textPart || textPart.type !== "text") {
      console.error("[RuntimeProvider] No text content in message");
      return;
    }

    setIsRunning(true);

    // Add user message to state immediately (optimistic update)
    const userMessageId = `user-${Date.now()}`;
    setInternalMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: "user" as const,
        text: textPart.text,
        toolCalls: new Map(),
        createdAt: new Date(),
      },
    ]);

    try {
      // Send message to OpenCode - response comes via SSE
      await opencodeSendMessage(projectId, sessionId, textPart.text, selectedModel);
    } catch (err) {
      console.error("[RuntimeProvider] Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      setIsRunning(false);
    }
  }, [projectId, sessionId, selectedModel]);

  // Handle cancellation
  const onCancel = useCallback(async () => {
    if (!sessionId) return;
    try {
      await opencodeAbortSession(projectId, sessionId);
    } catch (err) {
      console.error("[RuntimeProvider] Failed to abort:", err);
    }
    setIsRunning(false);
  }, [projectId, sessionId]);

  // Convert internal messages to ThreadMessageLike for the runtime
  const threadMessages = internalMessages.map(convertToThreadMessage);

  // Identity converter since we already convert to ThreadMessageLike
  const convertMessage = useCallback((msg: ThreadMessageLike): ThreadMessageLike => msg, []);

  // Create the external store runtime
  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    convertMessage,
    isRunning,
    onNew,
    onCancel,
  });

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading conversation...</p>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-destructive">Error: {error}</p>
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

export default RuntimeProvider;
