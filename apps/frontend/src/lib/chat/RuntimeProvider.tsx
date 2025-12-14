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

import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from "react";
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
  sandboxOpencodeSendMessageWithParts,
  sandboxOpencodeAbortSession,
  OpenCodeStream,
  type Message,
  type OpenCodeEvent,
  type ModelSelection,
  type PermissionRequest,
  type MessagePartInput,
} from "../api/tauri";
import type { AttachedFile } from "./FileAttachment";
import { PermissionProvider, usePermissions } from "./PermissionContext";
import { PermissionBar } from "./PermissionBar";

/**
 * Context for file attachment sending functionality.
 * Allows ChatThread (or any descendant) to send messages with file attachments.
 */
interface AttachmentContextValue {
  sendWithAttachments: (text: string, attachments: AttachedFile[]) => Promise<void>;
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

/**
 * Hook to access the attachment sending functionality from any child component.
 */
export function useAttachments(): AttachmentContextValue {
  const context = useContext(AttachmentContext);
  if (!context) {
    throw new Error("useAttachments must be used within RuntimeProvider");
  }
  return context;
}

interface RuntimeProviderProps {
  projectId: string;
  sessionId?: string;
  selectedModel?: ModelSelection;
  selectedAgent?: string;
  onSessionModelDetected?: (model: ModelSelection) => void;
  onSessionAgentDetected?: (agent: string) => void;
  children: ReactNode;
  /** Render prop to pass the send with attachments handler to children */
  renderWithAttachmentHandler?: (handler: (text: string, attachments: AttachedFile[]) => Promise<void>) => ReactNode;
  /** 
   * Pending message to send automatically when the provider is ready.
   * Used for programmatic message sending (e.g., onboarding auto-start).
   */
  pendingMessage?: {
    text: string;
    agent?: string;
  };
  /** Called when the pending message has been sent */
  onPendingMessageSent?: () => void;
}

// Tool call status for tracking state
type ToolCallStatus = "pending" | "running" | "completed" | "error";

// File attachment in a message
interface InternalFilePart {
  id: string;
  url: string;
  filename?: string;
  mime?: string;
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
    status?: ToolCallStatus;
    error?: string; // Error message when status is "error"
  }>;
  files: InternalFilePart[];
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
    files: [],
    createdAt: msg.info.time?.created ? new Date(msg.info.time.created) : undefined,
  };

  for (const part of msg.parts) {
    if (part.type === "text" && part.text) {
      internal.text += part.text;
    } 
    // Handle file parts
    else if (part.type === "file" && part.url) {
      internal.files.push({
        id: part.id,
        url: part.url,
        filename: part.filename,
        mime: part.mime,
      });
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
    // Structure: { type: "tool", callID, tool, state: { status, input, output, error, ... } }
    else if (part.type === "tool" && part.callID && part.state) {
      const callID = part.callID;
      const toolName = part.tool || "unknown";
      const state = part.state;
      const status = state.status as ToolCallStatus | undefined;
      const input = state.input ?? {};
      const output = state.output;
      const error = state.error as string | undefined;
      
      internal.toolCalls.set(callID, {
        toolCallId: callID,
        toolName,
        args: input,
        // For error status, use error message; for completed, use output
        result: status === "completed" ? output : status === "error" ? (error || output) : undefined,
        status: status,
        error: error,
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
  
  // Add file parts - images as "image" type, others as custom "file" type
  for (const file of msg.files) {
    if (file.mime?.startsWith("image/")) {
      // assistant-ui supports "image" type for image content
      (content as unknown[]).push({
        type: "image",
        image: file.url,
      });
    } else {
      // For non-image files, use a custom "file" type that we'll handle in the UI
      (content as unknown[]).push({
        type: "file",
        file: {
          url: file.url,
          filename: file.filename,
          mime: file.mime,
        },
      });
    }
  }
  
  for (const tc of msg.toolCalls.values()) {
    // For tool calls with error status but no result, provide an error result
    // so assistant-ui knows the tool is no longer running
    let result = tc.result;
    if (tc.status === "error" && result === undefined) {
      result = { error: tc.error || "Tool execution failed or was rejected" };
    }
    
    // Include status and error info for proper UI rendering
    (content as unknown[]).push({
      type: "tool-call",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: tc.args,
      argsText: JSON.stringify(tc.args),
      result: result,
      // Custom fields for error handling in ToolCallPart
      status: tc.status,
      error: tc.error,
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
function RuntimeProviderInner({ projectId, sessionId: initialSessionId, selectedModel, selectedAgent, onSessionModelDetected, onSessionAgentDetected, pendingMessage, onPendingMessageSent, children }: RuntimeProviderProps) {
  // Internal message state (mutable, managed by us)
  const [internalMessages, setInternalMessages] = useState<InternalMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  
  // Track if pending message has been processed
  const pendingMessageProcessedRef = useRef(false);
  
  // Stream reference for SSE
  const streamRef = useRef<OpenCodeStream | null>(null);
  
  // Permission context
  const { addPermission, removePermission, clearPermissions } = usePermissions();
  
  // Refs for permission functions to keep handleSSEEvent stable
  const addPermissionRef = useRef(addPermission);
  const removePermissionRef = useRef(removePermission);
  useEffect(() => {
    addPermissionRef.current = addPermission;
    removePermissionRef.current = removePermission;
  }, [addPermission, removePermission]);

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
        
        // Detect agent from messages
        // Priority: 1) user message agent field, 2) assistant message mode field
        if (onSessionAgentDetected) {
          let agentDetected = false;
          
          // First try: Find the last user message with agent field
          for (let i = opencodeMessages.length - 1; i >= 0; i--) {
            const msg = opencodeMessages[i];
            // Agent is typically set on user messages (the request specifies which agent to use)
            if (msg.info.role === "user" && msg.info.agent) {
              onSessionAgentDetected(msg.info.agent);
              agentDetected = true;
              break;
            }
          }
          
          // Fallback: Check assistant message mode field (e.g., "manage", "build")
          if (!agentDetected) {
            for (let i = opencodeMessages.length - 1; i >= 0; i--) {
              const msg = opencodeMessages[i];
              if (msg.info.role === "assistant" && msg.info.mode) {
                onSessionAgentDetected(msg.info.mode);
                break;
              }
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
        
        addPermissionRef.current(permission);
      }
    }
    
    // Handle permission.replied - permission was responded to (from another client/source)
    if (event.eventType === "permission.replied") {
      console.log("[RuntimeProvider] Permission replied:", properties);
      
      const permissionId = properties?.permissionID as string | undefined;
      if (permissionId) {
        removePermissionRef.current(permissionId);
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
              files: [],
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
            files: [],
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
              const error = state?.error as string | undefined;
              
              newMessage.toolCalls.set(callID, {
                toolCallId: callID,
                toolName,
                args: input,
                // For error status, use error message; for completed, use output
                result: status === "completed" ? output : status === "error" ? (error || output) : undefined,
                status: status,
                error: error,
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
          // Format: { type: "tool", callID, tool, state: { input, status, output, error, ... } }
          if (part.type === "tool") {
            const callID = part.callID as string | undefined;
            const toolName = (part.tool as string | undefined) || "unknown";
            const state = part.state as Record<string, unknown> | undefined;
            
            if (callID) {
              const status = state?.status as ToolCallStatus | undefined;
              const input = (state?.input as Record<string, unknown>) ?? {};
              const output = state?.output;
              const error = state?.error as string | undefined;
              
              updated.toolCalls.set(callID, {
                toolCallId: callID,
                toolName,
                args: input,
                // For error status, use error message; for completed, use output
                result: status === "completed" ? output : status === "error" ? (error || output) : undefined,
                status: status,
                error: error,
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
      // Error can be an object with { name, data: { message } } structure
      const errorObj = properties?.error as { name?: string; data?: { message?: string } } | string | undefined;
      let errorMessage: string;
      
      if (typeof errorObj === "object" && errorObj !== null) {
        // Handle structured error object from OpenCode API
        errorMessage = errorObj.data?.message || errorObj.name || "An error occurred";
      } else if (typeof errorObj === "string") {
        errorMessage = errorObj;
      } else if (typeof properties?.message === "string") {
        errorMessage = properties.message;
      } else {
        errorMessage = "An error occurred";
      }
      
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
  }, [sessionId]); // Use refs for permission functions to keep this callback stable

  // Connect to SSE stream when session is available
  // Use a ref for handleSSEEvent to avoid triggering reconnects when it changes
  const handleSSEEventRef = useRef(handleSSEEvent);
  useEffect(() => {
    handleSSEEventRef.current = handleSSEEvent;
  }, [handleSSEEvent]);

  useEffect(() => {
    if (!sessionId || isLoading) return;

    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isCleaningUp = false;
    
    const connectStream = async () => {
      if (isCleaningUp) return;
      
      // If there's already a connected stream, don't create another
      if (streamRef.current?.isConnected) {
        console.log("[RuntimeProvider] Stream already connected, skipping");
        return;
      }
      
      // Clean up existing stream before creating new one
      if (streamRef.current) {
        await streamRef.current.disconnect().catch(console.error);
      }
      
      const stream = new OpenCodeStream(projectId);
      streamRef.current = stream;

      try {
        await stream.connect(
          (event) => handleSSEEventRef.current(event),
          (status, err) => {
            if (status === "error") {
              console.warn("[RuntimeProvider] Stream error:", err);
            }
            // Try to reconnect after disconnection (unless we're cleaning up)
            if (status === "disconnected" && !isCleaningUp) {
              reconnectTimeout = setTimeout(connectStream, 2000);
            }
          }
        );
      } catch (err) {
        console.error("[RuntimeProvider] Failed to connect SSE:", err);
        // Try to reconnect after failure (unless we're cleaning up)
        if (!isCleaningUp) {
          reconnectTimeout = setTimeout(connectStream, 2000);
        }
      }
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
  }, [projectId, sessionId, isLoading]); // Removed handleSSEEvent - using ref instead

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
        files: [],
        createdAt: new Date(),
      },
    ]);

    try {
      // Send message to OpenCode - response comes via SSE (projectId is actually sandboxId in v2 API)
      await sandboxOpencodeSendMessage(projectId, sessionId, textPart.text, selectedModel, selectedAgent);
    } catch (err) {
      console.error("[RuntimeProvider] Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      setIsRunning(false);
    }
  }, [projectId, sessionId, selectedModel, selectedAgent]);

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

  // Handle sending a message with file attachments
  const sendWithAttachments = useCallback(async (text: string, attachments: AttachedFile[]) => {
    if (!sessionId) {
      console.error("[RuntimeProvider] No session ID");
      return;
    }

    setIsRunning(true);
    setError(null);

    // Convert AttachedFile[] to MessagePartInput[]
    const parts: MessagePartInput[] = [];
    
    // Add text part if there's text
    if (text.trim()) {
      parts.push({
        type: "text",
        text: text,
      });
    }

    // Add file parts
    for (const file of attachments) {
      parts.push({
        type: "file",
        url: file.url,
        filename: file.name,
        mime: file.mime,
      });
    }

    // Add optimistic user message to state immediately
    const userMessageId = `user-${Date.now()}`;
    const displayText = text.trim() || `[${attachments.length} file${attachments.length > 1 ? "s" : ""} attached]`;
    
    // Convert attachments to InternalFilePart format for display
    const fileParts: InternalFilePart[] = attachments.map((file, index) => ({
      id: `${userMessageId}-file-${index}`,
      url: file.url,
      filename: file.name,
      mime: file.mime,
    }));
    
    setInternalMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: "user" as const,
        text: displayText,
        toolCalls: new Map(),
        files: fileParts,
        createdAt: new Date(),
      },
    ]);

    try {
      // Send message with parts to OpenCode
      await sandboxOpencodeSendMessageWithParts(projectId, sessionId, parts, selectedModel, selectedAgent);
    } catch (err) {
      console.error("[RuntimeProvider] Failed to send message with attachments:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      setIsRunning(false);
    }
  }, [projectId, sessionId, selectedModel, selectedAgent]);

  // Handle pending message (for programmatic message sending like onboarding)
  useEffect(() => {
    // Only process if:
    // 1. We have a pending message
    // 2. We haven't already processed it
    // 3. We're not loading
    // 4. We have a session
    // 5. SSE stream is connected
    if (
      pendingMessage &&
      !pendingMessageProcessedRef.current &&
      !isLoading &&
      sessionId &&
      streamRef.current?.isConnected
    ) {
      pendingMessageProcessedRef.current = true;
      
      console.log("[RuntimeProvider] Processing pending message:", pendingMessage.text.slice(0, 50));
      
      // Use the agent from pendingMessage if specified, otherwise use selectedAgent
      const agentToUse = pendingMessage.agent || selectedAgent;
      
      // Add optimistic user message
      const userMessageId = `user-${Date.now()}`;
      setInternalMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user" as const,
          text: pendingMessage.text,
          toolCalls: new Map(),
          files: [],
          createdAt: new Date(),
        },
      ]);
      
      setIsRunning(true);
      setError(null);
      
      // Send the message
      sandboxOpencodeSendMessage(projectId, sessionId, pendingMessage.text, selectedModel, agentToUse)
        .then(() => {
          console.log("[RuntimeProvider] Pending message sent successfully");
          onPendingMessageSent?.();
        })
        .catch((err) => {
          console.error("[RuntimeProvider] Failed to send pending message:", err);
          setError(err instanceof Error ? err.message : "Failed to send message");
          setIsRunning(false);
        });
    }
  }, [pendingMessage, isLoading, sessionId, selectedModel, selectedAgent, onPendingMessageSent, projectId]);

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

  // Memoize the context value to prevent unnecessary re-renders
  const attachmentContextValue: AttachmentContextValue = {
    sendWithAttachments,
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AttachmentContext.Provider value={attachmentContextValue}>
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
      </AttachmentContext.Provider>
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
export function RuntimeProvider({ projectId, sessionId, selectedModel, selectedAgent, onSessionModelDetected, onSessionAgentDetected, pendingMessage, onPendingMessageSent, children }: RuntimeProviderProps) {
  return (
    <PermissionProvider projectId={projectId}>
      <RuntimeProviderInner
        projectId={projectId}
        sessionId={sessionId}
        selectedModel={selectedModel}
        selectedAgent={selectedAgent}
        onSessionModelDetected={onSessionModelDetected}
        onSessionAgentDetected={onSessionAgentDetected}
        pendingMessage={pendingMessage}
        onPendingMessageSent={onPendingMessageSent}
      >
        {children}
      </RuntimeProviderInner>
    </PermissionProvider>
  );
}

export default RuntimeProvider;
