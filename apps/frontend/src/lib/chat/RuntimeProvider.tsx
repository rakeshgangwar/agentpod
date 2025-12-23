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
  sandboxOpencodeRevertMessage,
  sandboxOpencodeGetPendingPermissions,
  type OpenCodeEvent,
  type ModelSelection,
  type PermissionRequest,
  type MessagePartInput,
  type Session,
} from "../api/tauri";
import {
  SSEClient,
  toLegacyFormat,
  type SSESubscription,
} from "../api/browser-sse";
import type { AttachedFile } from "./FileAttachment";
import { PermissionProvider, usePermissions } from "./PermissionContext";

import { setSessionActivity } from "../stores/session-activity.svelte";

// Import from our modular chat system
import {
  handleSSEEvent as handleSSEEventFromHandlers,
  type HandlerAction,
  type HandlerContext,
  type SessionStatusType,
  type RetryInfo,
} from "./handlers";
import {
  createEmptyInternalMessage,
  type InternalMessage,
  type InternalFilePart,
} from "./types/messages";
import {
  convertOpenCodeMessage,
  type OpenCodeMessage,
} from "./converters/message-converter";
import { convertMessagesGrouped } from "./converters/thread-converter";

// Re-export session status types for external use
export type { SessionStatusType, RetryInfo };

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

/**
 * Context for session status (busy/idle/retry state).
 * Allows ChatThread to display status indicators.
 */
interface SessionStatusContextValue {
  status: SessionStatusType;
  retryInfo: RetryInfo | null;
}

const SessionStatusContext = createContext<SessionStatusContextValue>({
  status: "idle",
  retryInfo: null,
});

/**
 * Hook to access the session status from any child component.
 */
export function useSessionStatus(): SessionStatusContextValue {
  return useContext(SessionStatusContext);
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
   * If sessionId is provided, the message will only be sent if it matches the current session.
   */
  pendingMessage?: {
    text: string;
    agent?: string;
    sessionId?: string; // If set, only send if this matches the current session
  };
  /** Called when the pending message has been sent */
  onPendingMessageSent?: () => void;
  /** Called when a new session is created (e.g., child session from task tool) */
  onSessionCreated?: (session: Session) => void;
  /** Called when a session is updated (e.g., title changed) */
  onSessionUpdated?: (session: Session) => void;
}

/**
 * Apply handler actions to state.
 * This is called after handleSSEEvent returns actions to apply.
 * 
 * Now uses the unified InternalMessage type directly - no conversion needed!
 */
interface ActionAppliers {
  setInternalMessages: React.Dispatch<React.SetStateAction<InternalMessage[]>>;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setSessionStatus: React.Dispatch<React.SetStateAction<SessionStatusType>>;
  setRetryInfo: React.Dispatch<React.SetStateAction<RetryInfo | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  addPermissionRef: React.RefObject<(permission: PermissionRequest) => void>;
  removePermissionRef: React.RefObject<(id: string) => void>;
  onSessionCreatedRef: React.RefObject<((session: Session) => void) | undefined>;
  onSessionUpdatedRef: React.RefObject<((session: Session) => void) | undefined>;
  projectId: string;
  sessionId: string | null;
}

function applyHandlerActions(actions: HandlerAction[], appliers: ActionAppliers): void {
  for (const action of actions) {
    switch (action.type) {
      case "add_message":
        appliers.setInternalMessages(prev => {
          const existingIdx = prev.findIndex(m => m.id === action.message.id);
          if (existingIdx !== -1) {
            const existing = prev[existingIdx];
            const incoming = action.message;
            
            const existingPartIds = new Set(existing.contentParts.map(p => p.id));
            const newParts = incoming.contentParts.filter(p => !existingPartIds.has(p.id));
            
            const merged: InternalMessage = {
              ...existing,
              text: incoming.text.length > existing.text.length ? incoming.text : existing.text,
              reasoning: [...existing.reasoning, ...incoming.reasoning.filter(r => !existing.reasoning.some(e => e.id === r.id))],
              files: [...existing.files, ...incoming.files.filter(f => !existing.files.some(e => e.id === f.id))],
              steps: [...existing.steps, ...incoming.steps.filter(s => !existing.steps.some(e => e.id === s.id))],
              patches: [...existing.patches, ...incoming.patches.filter(p => !existing.patches.some(e => e.id === p.id))],
              subtasks: [...existing.subtasks, ...incoming.subtasks.filter(s => !existing.subtasks.some(e => e.id === s.id))],
              retries: [...existing.retries, ...incoming.retries.filter(r => !existing.retries.some(e => e.id === r.id))],
              toolCalls: new Map([...existing.toolCalls, ...incoming.toolCalls]),
              contentParts: [...existing.contentParts, ...newParts],
              partOrderCounter: Math.max(existing.partOrderCounter, incoming.partOrderCounter),
            };
            const updated = [...prev];
            updated[existingIdx] = merged;
            return updated;
          }
          return [...prev, action.message];
        });
        break;
      
      case "update_message":
        appliers.setInternalMessages(prev => prev.map(m => {
          if (m.id !== action.messageId) return m;
          // Apply the updater directly - types are now unified
          return action.updater(m);
        }));
        break;
      
      case "remove_message":
        appliers.setInternalMessages(prev => prev.filter(m => m.id !== action.messageId));
        break;
        
      case "replace_message_id":
        // Replace optimistic message ID with real ID, but only if:
        // 1. The optimistic message exists
        // 2. A message with the real ID doesn't already exist
        appliers.setInternalMessages(prev => {
          const realIdExists = prev.some(m => m.id === action.realId);
          if (realIdExists) {
            // Real ID already exists - just remove the optimistic one
            console.log("[applyHandlerActions] Real ID exists, removing optimistic:", action.optimisticId);
            return prev.filter(m => m.id !== action.optimisticId);
          }
          return prev.map(m => {
            if (m.id !== action.optimisticId) return m;
            return { ...m, id: action.realId };
          });
        });
        break;
        
      case "set_running":
        appliers.setIsRunning(action.isRunning);
        break;
        
      case "set_session_status":
        appliers.setSessionStatus(action.status);
        appliers.setRetryInfo(action.retryInfo ?? null);
        break;
        
      case "set_error":
        appliers.setError(action.error);
        break;
        
      case "add_permission":
        appliers.addPermissionRef.current?.(action.permission);
        break;
        
      case "remove_permission":
        appliers.removePermissionRef.current?.(action.permissionId);
        break;
        
      case "notify_session_created":
        appliers.onSessionCreatedRef.current?.(action.session);
        break;
        
      case "notify_session_updated":
        appliers.onSessionUpdatedRef.current?.(action.session);
        break;
        
      case "update_session_activity":
        setSessionActivity(appliers.projectId, action.isActive, appliers.sessionId ?? undefined);
        break;
    }
  }
}

/**
 * Inner runtime component that has access to the permission context.
 * This is where all the SSE handling and runtime logic lives.
 */
function RuntimeProviderInner({ projectId, sessionId: initialSessionId, selectedModel, selectedAgent, onSessionModelDetected, onSessionAgentDetected, pendingMessage, onPendingMessageSent, onSessionCreated, onSessionUpdated, children }: RuntimeProviderProps) {
  // Internal message state using unified InternalMessage type
  const [internalMessages, setInternalMessages] = useState<InternalMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Session status state (idle/busy/retry)
  const [sessionStatus, setSessionStatus] = useState<SessionStatusType>("idle");
  const [retryInfo, setRetryInfo] = useState<RetryInfo | null>(null);
  
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  
  // Track if pending message has been processed
  const pendingMessageProcessedRef = useRef(false);
  
  // SSE subscription close function
  const sseCloseRef = useRef<(() => void) | null>(null);
  
  // Ref to always access latest internalMessages (avoids stale closure in SSE handler)
  const internalMessagesRef = useRef<InternalMessage[]>(internalMessages);
  useEffect(() => {
    internalMessagesRef.current = internalMessages;
  }, [internalMessages]);
  
  // Permission context - we only use addPermission and removePermission
  // clearPermissions is intentionally NOT used (see comment below)
  const { addPermission, removePermission } = usePermissions();
  
  // Refs for permission functions and callbacks to keep handleSSEEvent stable
  const addPermissionRef = useRef(addPermission);
  const removePermissionRef = useRef(removePermission);
  const onSessionCreatedRef = useRef(onSessionCreated);
  const onSessionUpdatedRef = useRef(onSessionUpdated);
  useEffect(() => {
    addPermissionRef.current = addPermission;
    removePermissionRef.current = removePermission;
    onSessionCreatedRef.current = onSessionCreated;
    onSessionUpdatedRef.current = onSessionUpdated;
  }, [addPermission, removePermission, onSessionCreated, onSessionUpdated]);

  // Note: We intentionally do NOT clear permissions when session changes.
  // Permissions from child sessions (subagents) should still be displayed
  // when the user is viewing the parent session. The PermissionProvider
  // is scoped at the project level, not session level.

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

        // Use the converter from converters/message-converter.ts
        const converted = opencodeMessages.map(msg => convertOpenCodeMessage(msg as OpenCodeMessage));
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
        
        // Fetch and restore pending permissions from API cache
        // This handles the case where user refreshes page while a permission is pending
        try {
          const pendingPermissions = await sandboxOpencodeGetPendingPermissions(projectId, sessionId);
          if (!cancelled && pendingPermissions.length > 0) {
            console.log(`[RuntimeProvider] Restoring ${pendingPermissions.length} pending permissions`);
            for (const permission of pendingPermissions) {
              addPermissionRef.current?.(permission);
            }
          }
        } catch (permErr) {
          // Non-fatal: just log and continue
          console.warn("[RuntimeProvider] Failed to fetch pending permissions:", permErr);
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

  const handleSSEEvent = useCallback((event: OpenCodeEvent) => {
    const eventType = (event.data as Record<string, unknown>)?.type || event.eventType;
    console.log("[RuntimeProvider] handleSSEEvent:", eventType, "sessionId:", sessionId, "messagesCount:", internalMessagesRef.current.length);
    
    const context: HandlerContext = {
      projectId,
      sessionId,
      messages: internalMessagesRef.current,
    };

    const result = handleSSEEventFromHandlers(event, context);

    if (result.actions.length > 0) {
      console.log("[RuntimeProvider] Applying actions:", result.actions.map(a => a.type));
      applyHandlerActions(result.actions, {
        setInternalMessages,
        setIsRunning,
        setSessionStatus,
        setRetryInfo,
        setError,
        addPermissionRef,
        removePermissionRef,
        onSessionCreatedRef,
        onSessionUpdatedRef,
        projectId,
        sessionId,
      });
    } else if (!result.handled) {
      console.log("[RuntimeProvider] Event not handled:", eventType);
    }
  }, [projectId, sessionId]);

  // Connect to SSE stream when session is available
  // Use a ref for handleSSEEvent to avoid triggering reconnects when it changes
  const handleSSEEventRef = useRef(handleSSEEvent);
  useEffect(() => {
    handleSSEEventRef.current = handleSSEEvent;
  }, [handleSSEEvent]);

  useEffect(() => {
    if (!sessionId || isLoading) return;

    let cancelled = false;
    
    const startEventStream = async () => {
      if (cancelled) return;
      
      if (sseCloseRef.current) {
        sseCloseRef.current();
        sseCloseRef.current = null;
      }
      
      try {
        const client = new SSEClient(projectId);
        const subscription = await client.subscribe({
          onStatus: (status, err) => {
            if (status === "error") {
              console.warn("[RuntimeProvider] SSE error:", err);
            }
            if (status === "connected") {
              console.log("[RuntimeProvider] SSE connected to", projectId);
            }
          },
        });
        
        if (cancelled) {
          subscription.close();
          return;
        }
        
        sseCloseRef.current = subscription.close;
        
        for await (const event of subscription.stream) {
          if (cancelled) break;
          handleSSEEventRef.current(toLegacyFormat(event));
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[RuntimeProvider] SSE subscription failed:", err);
        }
      }
    };

    startEventStream();

    return () => {
      cancelled = true;
      if (sseCloseRef.current) {
        sseCloseRef.current();
        sseCloseRef.current = null;
      }
    };
  }, [projectId, sessionId, isLoading]);

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

    // DUPLICATE MESSAGE PREVENTION:
    // Check if this message text matches the last user message AND there's no
    // assistant response after it. This prevents re-sending the same message when:
    // 1. User navigates away during a busy session
    // 2. User navigates back  
    // 3. Runtime might try to re-process the last user message
    // But still allows sending the same message if there was already a response.
    if (internalMessages.length > 0) {
      const lastMessage = internalMessages[internalMessages.length - 1];
      if (lastMessage.role === "user" && lastMessage.text.trim() === textPart.text.trim()) {
        console.warn("[RuntimeProvider] Duplicate message detected (no assistant response yet), ignoring:", textPart.text.slice(0, 50));
        return;
      }
    }

    setIsRunning(true);
    // Update session activity store for projects page indicator
    setSessionActivity(projectId, true, sessionId ?? undefined);

    // Add user message to state immediately (optimistic update)
    // Using createEmptyInternalMessage from types/messages.ts
    const userMessageId = `user-${Date.now()}`;
    const userMessage = createEmptyInternalMessage(userMessageId, "user");
    userMessage.text = textPart.text;
    
    setInternalMessages((prev) => [...prev, userMessage]);

    try {
      // Send message to OpenCode - response comes via SSE (projectId is actually sandboxId in v2 API)
      await sandboxOpencodeSendMessage(projectId, sessionId, textPart.text, selectedModel, selectedAgent);
    } catch (err) {
      console.error("[RuntimeProvider] Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      setIsRunning(false);
      // Update session activity store for projects page indicator
      setSessionActivity(projectId, false, sessionId ?? undefined);
    }
  }, [projectId, sessionId, selectedModel, selectedAgent, internalMessages]);

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
    // Update session activity store for projects page indicator
    setSessionActivity(projectId, false, sessionId ?? undefined);
  }, [projectId, sessionId]);

  // Handle editing a user message (edit and re-run)
  // parentId is the message BEFORE the one being edited (assistant-ui convention)
  // We need to revert the message being edited (after parentId) and send new content
  const onEdit = useCallback(async (message: AppendMessage) => {
    if (!sessionId) {
      console.error("[RuntimeProvider] No session ID for edit");
      return;
    }

    // Extract text from message
    const textPart = message.content.find((p) => p.type === "text");
    if (!textPart || textPart.type !== "text") {
      console.error("[RuntimeProvider] No text content in edited message");
      return;
    }

    // message.parentId tells us the message BEFORE the one being edited
    // If parentId is null, we're editing the first message
    const parentId = message.parentId;
    
    console.log("[RuntimeProvider] Editing message, parentId:", parentId);

    setIsRunning(true);
    setSessionActivity(projectId, true, sessionId ?? undefined);

    try {
      if (parentId) {
        // Find the message being edited (the one after parentId)
        const parentIndex = internalMessages.findIndex(m => m.id === parentId);
        if (parentIndex !== -1 && parentIndex < internalMessages.length - 1) {
          // The message being edited is the one after the parent
          const messageBeingEdited = internalMessages[parentIndex + 1];
          console.log("[RuntimeProvider] Reverting message being edited:", messageBeingEdited.id);
          await sandboxOpencodeRevertMessage(projectId, sessionId, messageBeingEdited.id);
        }
        
        // Update local state - keep messages up to and including parent
        // Remove the message being edited and everything after
        setInternalMessages(prev => {
          const idx = prev.findIndex(m => m.id === parentId);
          if (idx === -1) {
            console.warn("[RuntimeProvider] Parent message not found in state");
            return prev;
          }
          return prev.slice(0, idx + 1);
        });
      } else {
        // No parent - this is editing the first message
        // Revert the first message if it exists
        if (internalMessages.length > 0) {
          console.log("[RuntimeProvider] Editing first message, reverting:", internalMessages[0].id);
          await sandboxOpencodeRevertMessage(projectId, sessionId, internalMessages[0].id);
        }
        setInternalMessages([]);
      }

      // Add the edited user message optimistically for immediate UI feedback
      const userMessageId = `user-${Date.now()}`;
      const userMessage = createEmptyInternalMessage(userMessageId, "user");
      userMessage.text = textPart.text;
      
      setInternalMessages(prev => [...prev, userMessage]);

      // Send the edited message to get a new response
      console.log("[RuntimeProvider] Sending edited message:", textPart.text.slice(0, 50));
      await sandboxOpencodeSendMessage(projectId, sessionId, textPart.text, selectedModel, selectedAgent);
    } catch (err) {
      console.error("[RuntimeProvider] Failed to edit message:", err);
      setError(err instanceof Error ? err.message : "Failed to edit message");
      setIsRunning(false);
      setSessionActivity(projectId, false, sessionId ?? undefined);
    }
  }, [projectId, sessionId, selectedModel, selectedAgent, internalMessages]);

  // Handle regenerating/reloading an assistant response
  // This reverts the assistant message and re-sends the user message that triggered it
  const onReload = useCallback(async (parentId: string | null) => {
    if (!sessionId) {
      console.error("[RuntimeProvider] No session ID for reload");
      return;
    }

    console.log("[RuntimeProvider] Reloading from parentId:", parentId);

    // parentId is the user message ID that triggered the assistant response we want to regenerate
    // We need to find the user message to get its text, then revert and resend
    
    const userMessage = parentId 
      ? internalMessages.find(m => m.id === parentId)
      : null;

    if (parentId && !userMessage) {
      console.error("[RuntimeProvider] Could not find user message at parentId:", parentId);
      return;
    }

    // If no parentId and no messages, nothing to reload
    if (!parentId && internalMessages.length === 0) {
      console.warn("[RuntimeProvider] No messages to reload");
      return;
    }

    // Get the text to resend BEFORE we modify state
    const textToSend = userMessage?.text || internalMessages[0]?.text;
    if (!textToSend) {
      console.warn("[RuntimeProvider] No text to resend for reload");
      return;
    }

    setIsRunning(true);
    setSessionActivity(projectId, true, sessionId ?? undefined);

    try {
      // Find the first assistant message that follows the user message
      // This is what we need to revert to remove the assistant's response
      if (parentId) {
        const parentIndex = internalMessages.findIndex(m => m.id === parentId);
        if (parentIndex !== -1 && parentIndex < internalMessages.length - 1) {
          // Find assistant message(s) after the user message
          const assistantMessages = internalMessages
            .slice(parentIndex + 1)
            .filter(m => m.role === "assistant");
          
          if (assistantMessages.length > 0) {
            // Revert to the first assistant message - this marks it and everything after as reverted
            const firstAssistantId = assistantMessages[0].id;
            console.log("[RuntimeProvider] Reverting assistant message:", firstAssistantId);
            await sandboxOpencodeRevertMessage(projectId, sessionId, firstAssistantId);
          }
        }
        
        // Update local state - keep only messages BEFORE the user message we're regenerating from
        // This is because OpenCode will send new messages via SSE (both user and assistant)
        // We don't want duplicates
        setInternalMessages(prev => {
          const idx = prev.findIndex(m => m.id === parentId);
          if (idx === -1) return prev;
          // Keep everything before the user message
          return prev.slice(0, idx);
        });
      } else {
        // No parentId - clear all messages
        setInternalMessages([]);
      }

      // Add optimistic user message so UI shows it immediately
      const userMessageId = `user-${Date.now()}`;
      const optimisticUserMessage = createEmptyInternalMessage(userMessageId, "user");
      optimisticUserMessage.text = textToSend;
      setInternalMessages(prev => [...prev, optimisticUserMessage]);

      // Re-send the original user message to get a new response
      console.log("[RuntimeProvider] Re-sending user message:", textToSend.slice(0, 50));
      await sandboxOpencodeSendMessage(projectId, sessionId, textToSend, selectedModel, selectedAgent);
    } catch (err) {
      console.error("[RuntimeProvider] Failed to reload:", err);
      setError(err instanceof Error ? err.message : "Failed to regenerate response");
      setIsRunning(false);
      setSessionActivity(projectId, false, sessionId ?? undefined);
    }
  }, [projectId, sessionId, selectedModel, selectedAgent, internalMessages]);

  // Handle setting messages directly (for branch switching)
  const setMessages = useCallback((messages: readonly ThreadMessageLike[]) => {
    // Convert ThreadMessageLike back to InternalMessage format
    // This is a simplified conversion - in practice, you may need more complex logic
    // for branch switching scenarios
    console.log("[RuntimeProvider] setMessages called with", messages.length, "messages");
    
    // For now, we log but don't implement full branch switching
    // as it requires additional OpenCode API support
    console.warn("[RuntimeProvider] Branch switching via setMessages not fully implemented");
  }, []);

  // Handle sending a message with file attachments
  const sendWithAttachments = useCallback(async (text: string, attachments: AttachedFile[]) => {
    if (!sessionId) {
      console.error("[RuntimeProvider] No session ID");
      return;
    }

    setIsRunning(true);
    setError(null);
    // Update session activity store for projects page indicator
    setSessionActivity(projectId, true, sessionId ?? undefined);

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
    
    // Using createEmptyInternalMessage from types/messages.ts
    const userMessage = createEmptyInternalMessage(userMessageId, "user");
    userMessage.text = displayText;
    userMessage.files = fileParts;
    
    setInternalMessages((prev) => [...prev, userMessage]);

    try {
      // Send message with parts to OpenCode
      await sandboxOpencodeSendMessageWithParts(projectId, sessionId, parts, selectedModel, selectedAgent);
    } catch (err) {
      console.error("[RuntimeProvider] Failed to send message with attachments:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      setIsRunning(false);
      // Update session activity store for projects page indicator
      setSessionActivity(projectId, false, sessionId ?? undefined);
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
    // 6. If pendingMessage has a sessionId, it must match current session
    if (
      pendingMessage &&
      !pendingMessageProcessedRef.current &&
      !isLoading &&
      sessionId &&
      sseCloseRef.current &&
      (!pendingMessage.sessionId || pendingMessage.sessionId === sessionId)
    ) {
      pendingMessageProcessedRef.current = true;
      
      console.log("[RuntimeProvider] Processing pending message for session:", sessionId, pendingMessage.text.slice(0, 50));
      
      // IMMEDIATELY notify parent to clear the pending message
      // This prevents the message from being sent again if the component remounts
      onPendingMessageSent?.();
      
      // Use the agent from pendingMessage if specified, otherwise use selectedAgent
      const agentToUse = pendingMessage.agent || selectedAgent;
      
      // Add optimistic user message using createEmptyInternalMessage
      const userMessageId = `user-${Date.now()}`;
      const userMessage = createEmptyInternalMessage(userMessageId, "user");
      userMessage.text = pendingMessage.text;
      
      setInternalMessages((prev) => [...prev, userMessage]);
      
      setIsRunning(true);
      setError(null);
      // Update session activity store for projects page indicator
      setSessionActivity(projectId, true, sessionId ?? undefined);
      
      // Send the message
      sandboxOpencodeSendMessage(projectId, sessionId, pendingMessage.text, selectedModel, agentToUse)
        .then(() => {
          console.log("[RuntimeProvider] Pending message sent successfully");
        })
        .catch((err) => {
          console.error("[RuntimeProvider] Failed to send pending message:", err);
          setError(err instanceof Error ? err.message : "Failed to send message");
          setIsRunning(false);
          // Update session activity store for projects page indicator
          setSessionActivity(projectId, false, sessionId ?? undefined);
        });
    }
  }, [pendingMessage, isLoading, sessionId, selectedModel, selectedAgent, onPendingMessageSent, projectId]);

  const filteredMessages = internalMessages.filter(msg => {
    if (!msg.sessionId) return true;
    return msg.sessionId === sessionId;
  });
  
  const threadMessages = convertMessagesGrouped(filteredMessages);

  // Identity converter since we already convert to ThreadMessageLike
  const convertMessageForRuntime = useCallback((msg: ThreadMessageLike): ThreadMessageLike => msg, []);

  // Create the external store runtime
  // - onNew: handles sending new messages
  // - onCancel: handles aborting generation
  // - onEdit: handles editing user messages (edit and re-run)
  // - onReload: handles regenerating assistant responses
  // - setMessages: enables branch switching (limited support)
  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    convertMessage: convertMessageForRuntime,
    isRunning,
    onNew,
    onCancel,
    onEdit,
    onReload,
    setMessages,
  });

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--cyber-cyan)] animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-[var(--cyber-cyan)] animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-[var(--cyber-cyan)] animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            Loading conversation...
          </p>
        </div>
      </div>
    );
  }

  // Memoize the context values to prevent unnecessary re-renders
  const attachmentContextValue: AttachmentContextValue = {
    sendWithAttachments,
  };
  
  const sessionStatusContextValue: SessionStatusContextValue = {
    status: sessionStatus,
    retryInfo,
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SessionStatusContext.Provider value={sessionStatusContextValue}>
        <AttachmentContext.Provider value={attachmentContextValue}>
          <div className="flex flex-col flex-1 min-h-0">
            {/* Error banner - dismissible, doesn't hide chat */}
            {error && (
              <div className="border-b border-[var(--cyber-red)]/30 bg-[var(--cyber-red)]/10 px-4 py-2 flex items-center justify-between gap-2 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--cyber-red)] animate-pulse" />
                  <span className="font-mono text-xs text-[var(--cyber-red)]">{error}</span>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="font-mono text-xs uppercase tracking-wider px-2 py-1 rounded border border-[var(--cyber-red)]/30 text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0">
              {children}
            </div>
          </div>
        </AttachmentContext.Provider>
      </SessionStatusContext.Provider>
    </AssistantRuntimeProvider>
  );
}

/**
 * RuntimeProvider wraps children with the assistant-ui runtime
 * configured for OpenCode using External Store Runtime.
 * 
 * IMPORTANT: For proper permission handling across session switches,
 * wrap the parent component with PermissionProvider at a level that
 * doesn't remount when sessions change. Example:
 * 
 * ```tsx
 * <PermissionProvider projectId={projectId}>
 *   {#key sessionId}
 *     <RuntimeProvider ... />
 *   {/key}
 * </PermissionProvider>
 * ```
 * 
 * If PermissionProvider is not found in the tree, RuntimeProvider
 * will create one internally (legacy behavior).
 */
export function RuntimeProvider({ projectId, sessionId, selectedModel, selectedAgent, onSessionModelDetected, onSessionAgentDetected, pendingMessage, onPendingMessageSent, onSessionCreated, onSessionUpdated, children }: RuntimeProviderProps) {
  return (
    <PermissionProviderWrapper projectId={projectId}>
      <RuntimeProviderInner
        projectId={projectId}
        sessionId={sessionId}
        selectedModel={selectedModel}
        selectedAgent={selectedAgent}
        onSessionModelDetected={onSessionModelDetected}
        onSessionAgentDetected={onSessionAgentDetected}
        pendingMessage={pendingMessage}
        onPendingMessageSent={onPendingMessageSent}
        onSessionCreated={onSessionCreated}
        onSessionUpdated={onSessionUpdated}
      >
        {children}
      </RuntimeProviderInner>
    </PermissionProviderWrapper>
  );
}

/**
 * Wrapper that only adds PermissionProvider if not already present in the tree.
 * This allows the chat page to provide PermissionProvider at a higher level
 * for proper persistence across session switches.
 */
function PermissionProviderWrapper({ projectId, children }: { projectId: string; children: ReactNode }) {
  // Try to use existing permission context - if it throws, we need to provide one
  try {
    usePermissions();
    // Context exists, just render children
    return <>{children}</>;
  } catch {
    // No context, provide one
    return (
      <PermissionProvider projectId={projectId}>
        {children}
      </PermissionProvider>
    );
  }
}

export { PermissionProvider };
export default RuntimeProvider;
