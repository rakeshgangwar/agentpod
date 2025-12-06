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
} from "../api/tauri";

interface RuntimeProviderProps {
  projectId: string;
  sessionId?: string;
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
    } else if (part.type === "tool-invocation" && part.toolInvocation) {
      internal.toolCalls.set(part.toolInvocation.toolCallId, {
        toolCallId: part.toolInvocation.toolCallId,
        toolName: part.toolInvocation.toolName,
        args: (part.toolInvocation.args ?? {}) as Record<string, unknown>,
        result: part.toolInvocation.result,
      });
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
export function RuntimeProvider({ projectId, sessionId: initialSessionId, children }: RuntimeProviderProps) {
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
        console.log("[RuntimeProvider] Loading messages for session:", sessionId);
        const opencodeMessages = await opencodeListMessages(projectId, sessionId);

        if (cancelled) return;

        const converted = opencodeMessages.map(convertOpenCodeMessage);
        console.log("[RuntimeProvider] Loaded messages:", converted.length);
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
          // Check if message already exists
          const exists = prev.some((m) => m.id === messageId);
          if (exists) return prev;

          // Add new message
          console.log("[RuntimeProvider] Adding new message:", messageId, role);
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

      if (!messageId || !part) return;

      setInternalMessages((prev) =>
        prev.map((m) => {
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

          if (part.type === "tool-invocation") {
            const toolInvocation = part.toolInvocation as Record<string, unknown> | undefined;
            if (toolInvocation?.toolCallId) {
              updated.toolCalls.set(toolInvocation.toolCallId as string, {
                toolCallId: toolInvocation.toolCallId as string,
                toolName: (toolInvocation.toolName as string) || "unknown",
                args: (toolInvocation.args as Record<string, unknown>) ?? {},
                result: toolInvocation.result,
              });
            }
          }

          return updated;
        })
      );
    }

    // Handle session.idle - processing complete
    if (event.eventType === "session.idle") {
      console.log("[RuntimeProvider] Session idle - streaming complete");
      setIsRunning(false);
    }

    // Handle session.updated for status changes
    if (event.eventType === "session.updated") {
      const info = properties?.info as Record<string, unknown> | undefined;
      const status = info?.status as Record<string, unknown> | undefined;
      if (status?.type === "idle") {
        console.log("[RuntimeProvider] Session status idle");
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

      console.log("[RuntimeProvider] Connecting to SSE stream");
      stream.connect(
        handleSSEEvent,
        (status, err) => {
          console.log("[RuntimeProvider] Stream status:", status, err);
          // Don't set error state for stream errors - just log them
          // Stream errors are transient and shouldn't break the UI
          if (status === "error") {
            console.warn("[RuntimeProvider] Stream error (non-fatal):", err);
          }
          // Try to reconnect after disconnection (unless we're cleaning up)
          if (status === "disconnected" && !isCleaningUp) {
            console.log("[RuntimeProvider] Stream disconnected, will reconnect in 2s");
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
      console.log("[RuntimeProvider] Disconnecting SSE stream");
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

    console.log("[RuntimeProvider] Sending message:", textPart.text.slice(0, 50));
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
      await opencodeSendMessage(projectId, sessionId, textPart.text);
      console.log("[RuntimeProvider] Message sent successfully");
    } catch (err) {
      console.error("[RuntimeProvider] Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      setIsRunning(false);
    }
  }, [projectId, sessionId]);

  // Handle cancellation
  const onCancel = useCallback(async () => {
    if (!sessionId) return;
    console.log("[RuntimeProvider] Cancelling...");
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
