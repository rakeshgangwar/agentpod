/**
 * React Runtime Provider for assistant-ui
 * 
 * This component wraps assistant-ui's AssistantRuntimeProvider with our
 * custom OpenCode integration using External Store Runtime.
 * 
 * We use useExternalStoreRuntime which gives us full control over the message
 * state, allowing us to properly handle OpenCode's multi-message pattern
 * (multiple assistant messages per user question during tool calls).
 * 
 * This also integrates the Permission system for human-in-the-loop approvals.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import {
  sandboxOpencodeListMessages,
  sandboxOpencodeListSessions,
  sandboxOpencodeCreateSession,
  sandboxOpencodeSendMessage,
  sandboxOpencodeAbortSession,
  OpenCodeStream,
  type Message,
  type OpenCodeEvent,
  type ModelSelection,
  type PermissionRequest,
} from "../api/tauri";
import { PermissionProvider, usePermissions } from "./PermissionContext";
import { PermissionBar } from "./PermissionBar";

interface RuntimeProviderProps {
  projectId: string;
  sessionId?: string;
  selectedModel?: ModelSelection;
  onSessionModelDetected?: (model: ModelSelection) => void;
  children: ReactNode;
}

// Tool call status for tracking state
type ToolCallStatus = "pending" | "running" | "completed" | "error";

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
    status?: ToolCallStatus;
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
      const status = state.status as ToolCallStatus | undefined;
      const input = state.input ?? {};
      const output = state.output;
      
      internal.toolCalls.set(callID, {
        toolCallId: callID,
        toolName,
        args: input,
        result: status === "completed" || status === "error" ? output : undefined,
        status: status,
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
    // For tool calls with error status but no result, provide an error result
    // so assistant-ui knows the tool is no longer running
    let result = tc.result;
    if (tc.status === "error" && result === undefined) {
      result = { error: "Tool execution failed or was rejected" };
    }
    
    (content as unknown[]).push({
      type: "tool-call",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: tc.args,
      argsText: JSON.stringify(tc.args),
      result: result,
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
 * Inner runtime component that has access to the permission context.
 * This is where all the SSE handling and runtime logic lives.
 */
function RuntimeProviderInner({ projectId, sessionId: initialSessionId, selectedModel, onSessionModelDetected, children }: RuntimeProviderProps) {
  // Internal message state (mutable, managed by us)
  const [internalMessages, setInternalMessages] = useState<InternalMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  
  // Stream reference for SSE
  const streamRef = useRef<OpenCodeStream | null>(null);
  
  // Permission context
  const { addPermission, removePermission, clearPermissions } = usePermissions();

  // Clear permissions when session changes
  useEffect(() => {
    clearPermissions();
  }, [sessionId, clearPermissions]);

  // Load initial messages when session changes
  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      if (!sessionId) {
        // Try to get or create a session (projectId is actually sandboxId in v2 API)
        try {
          const sessions = await sandboxOpencodeListSessions(projectId);
          if (sessions.length > 0) {
            setSessionId(sessions[0].id);
          } else {
            const newSession = await sandboxOpencodeCreateSession(projectId);
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
        // projectId is actually sandboxId in v2 API
        const opencodeMessages = await sandboxOpencodeListMessages(projectId, sessionId);

        if (cancelled) return;

        const converted = opencodeMessages.map(convertOpenCodeMessage);
        setInternalMessages(converted);
        
        // Detect model from the last assistant message that has model info
        if (onSessionModelDetected) {
          // Find the last assistant message with modelID and providerID
          for (let i = opencodeMessages.length - 1; i >= 0; i--) {
            const msg = opencodeMessages[i];
            if (msg.info.role === "assistant" && msg.info.modelID && msg.info.providerID) {
              onSessionModelDetected({
                providerId: msg.info.providerID,
                modelId: msg.info.modelID,
              });
              break;
            }
          }
        }
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

    // Log all events for debugging
    console.log("[RuntimeProvider] SSE Event:", event.eventType, properties);

    // Handle permission.updated - permission request received
    if (event.eventType === "permission.updated") {
      console.log("[RuntimeProvider] Permission request received:", properties);
      
      // The permission data is in properties directly
      if (properties && typeof properties.id === "string") {
        const permission: PermissionRequest = {
          id: properties.id as string,
          type: (properties.type as string) || "unknown",
          pattern: properties.pattern as string | string[] | undefined,
          sessionID: (properties.sessionID as string) || sessionId || "",
          messageID: (properties.messageID as string) || "",
          callID: properties.callID as string | undefined,
          title: (properties.title as string) || "Permission Required",
          metadata: (properties.metadata as Record<string, unknown>) || {},
          time: (properties.time as { created: number }) || { created: Date.now() },
        };
        
        addPermission(permission);
      }
    }
    
    // Handle permission.replied - permission was responded to (from another client/source)
    if (event.eventType === "permission.replied") {
      console.log("[RuntimeProvider] Permission replied:", properties);
      
      const permissionId = properties?.permissionID as string | undefined;
      if (permissionId) {
        removePermission(permissionId);
      }
    }

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
        // Check if message exists
        const messageExists = prev.some((m) => m.id === messageId);
        
        // If message doesn't exist yet (race condition: part.updated arrived before message.updated),
        // create it now. This typically happens with assistant messages during streaming.
        if (!messageExists) {
          const newMessage: InternalMessage = {
            id: messageId,
            role: "assistant", // Parts arriving before message.updated are typically from assistant
            text: "",
            toolCalls: new Map(),
            createdAt: new Date(),
          };
          
          // Apply the part update to the new message
          if (part.type === "text") {
            const delta = properties?.delta as string | undefined;
            if (typeof part.text === "string") {
              newMessage.text = part.text;
            } else if (delta) {
              newMessage.text = delta;
            }
          }
          
          // Handle tool-invocation format (legacy)
          if (part.type === "tool-invocation") {
            const toolInvocation = part.toolInvocation as Record<string, unknown> | undefined;
            if (toolInvocation?.toolCallId) {
              const toolName = (toolInvocation.toolName as string) || "unknown";
              newMessage.toolCalls.set(toolInvocation.toolCallId as string, {
                toolCallId: toolInvocation.toolCallId as string,
                toolName,
                args: (toolInvocation.args as Record<string, unknown>) ?? {},
                result: toolInvocation.result,
              });
            }
          }
          
          // Handle "tool" format (from SSE stream)
          if (part.type === "tool") {
            const callID = part.callID as string | undefined;
            const toolName = (part.tool as string | undefined) || "unknown";
            const state = part.state as Record<string, unknown> | undefined;
            
            if (callID) {
              const status = state?.status as ToolCallStatus | undefined;
              const input = (state?.input as Record<string, unknown>) ?? {};
              const output = state?.output;
              
              newMessage.toolCalls.set(callID, {
                toolCallId: callID,
                toolName,
                args: input,
                result: status === "completed" || status === "error" ? output : undefined,
                status: status,
              });
            }
          }
          
          return [...prev, newMessage];
        }
        
        // Message exists, update it
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
              const status = state?.status as ToolCallStatus | undefined;
              const input = (state?.input as Record<string, unknown>) ?? {};
              const output = state?.output;
              
              updated.toolCalls.set(callID, {
                toolCallId: callID,
                toolName,
                args: input,
                result: status === "completed" || status === "error" ? output : undefined,
                status: status,
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

    // Handle session.error - display error to user
    if (event.eventType === "session.error") {
      console.error("[RuntimeProvider] Session error:", properties);
      const errorMessage = (properties?.error as string) || 
                          (properties?.message as string) || 
                          "An error occurred";
      setError(errorMessage);
      setIsRunning(false);
    }

    // Handle message.removed - remove message from state
    if (event.eventType === "message.removed") {
      const messageId = properties?.messageID as string | undefined;
      if (messageId) {
        console.log("[RuntimeProvider] Message removed:", messageId);
        setInternalMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    }
  }, [sessionId, addPermission, removePermission]);

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
      // Send message to OpenCode - response comes via SSE (projectId is actually sandboxId in v2 API)
      await sandboxOpencodeSendMessage(projectId, sessionId, textPart.text, selectedModel);
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
      // projectId is actually sandboxId in v2 API
      await sandboxOpencodeAbortSession(projectId, sessionId);
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Error banner - dismissible, doesn't hide chat */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 flex items-center justify-between gap-2">
            <span className="text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-destructive hover:text-destructive/80 text-sm font-medium px-2 py-1 rounded hover:bg-destructive/10"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0">
          {children}
        </div>
        <PermissionBar />
      </div>
    </AssistantRuntimeProvider>
  );
}

/**
 * RuntimeProvider wraps children with the assistant-ui runtime
 * configured for OpenCode using External Store Runtime.
 * 
 * This includes the Permission system for human-in-the-loop approvals,
 * with a PermissionBar sticky at the bottom of the chat.
 */
export function RuntimeProvider({ projectId, sessionId, selectedModel, onSessionModelDetected, children }: RuntimeProviderProps) {
  return (
    <PermissionProvider projectId={projectId}>
      <RuntimeProviderInner
        projectId={projectId}
        sessionId={sessionId}
        selectedModel={selectedModel}
        onSessionModelDetected={onSessionModelDetected}
      >
        {children}
      </RuntimeProviderInner>
    </PermissionProvider>
  );
}

export default RuntimeProvider;
