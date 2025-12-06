/**
 * OpenCode Chat Model Adapter for assistant-ui
 * 
 * This adapter connects assistant-ui to the OpenCode API via Tauri commands.
 * It handles session management, message sending, and real-time streaming.
 * 
 * SSE Event Flow:
 * 1. message.updated (role: "user") - User message registered
 * 2. message.updated (role: "assistant") - Assistant message created (initially empty)
 * 3. message.part.updated (type: "text") - Text streaming updates with delta
 * 4. session.idle - Processing complete
 */

import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult } from "@assistant-ui/react";
import {
  opencodeCreateSession,
  opencodeListSessions,
  opencodeSendMessage,
  opencodeAbortSession,
  opencodeListMessages,
  OpenCodeStream,
  type Session,
  type Message,
  type OpenCodeEvent,
} from "$lib/api/tauri";

/**
 * State for tracking the current session
 */
interface SessionState {
  projectId: string;
  sessionId: string | null;
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

  // Stream instance for SSE events
  let stream: OpenCodeStream | null = null;

  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult> {
      try {
        // Ensure we have a session
        if (!state.sessionId) {
          // Try to get existing sessions first
          const sessions = await opencodeListSessions(state.projectId);
          if (sessions.length > 0) {
            // Use the most recent session
            state.sessionId = sessions[0].id;
          } else {
            // Create a new session
            const session = await opencodeCreateSession(state.projectId);
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

        // Set up streaming state
        let accumulatedText = "";
        let assistantMessageId: string | null = null;
        let streamError: Error | null = null;
        let isStreamingDone = false;
        
        // Helper to mark streaming as done
        const markDone = () => { isStreamingDone = true; };

        // Connect to SSE stream
        console.log('[OpenCode Adapter] Connecting to SSE stream for project:', state.projectId);
        stream = new OpenCodeStream(state.projectId);
        await stream.connect(
          (event: OpenCodeEvent) => {
            console.log('[OpenCode Adapter] SSE Event:', event.eventType);
            // SSE event structure from OpenCode:
            // { eventType: "message.part.updated", data: { type: "...", properties: { ... } } }
            const eventData = event.data as { 
              type?: string; 
              properties?: {
                part?: { 
                  type?: string; 
                  text?: string;
                  messageID?: string;
                };
                info?: { 
                  id?: string;
                  role?: string;
                  parentID?: string;
                };
                delta?: string;
                status?: { type?: string };
                sessionID?: string;
              };
            };
            
            // Track assistant message IDs from message.updated events
            if (event.eventType === "message.updated") {
              const info = eventData.properties?.info;
              if (info?.role === "assistant" && info.id) {
                assistantMessageId = info.id;
              }
            }
            
            // Handle text part updates - only for assistant messages
            if (event.eventType === "message.part.updated") {
              const part = eventData.properties?.part;
              const delta = eventData.properties?.delta;
              
              // Only process text parts that belong to assistant messages
              if (part?.type === "text") {
                const isAssistantPart = assistantMessageId && part.messageID === assistantMessageId;
                
                // If we can't determine message ownership, still use the text (fallback)
                if (isAssistantPart || !part.messageID) {
                  // Prefer using the full text, which is always up-to-date
                  if (part.text) {
                    accumulatedText = part.text;
                  } else if (delta) {
                    // Fallback to delta if no full text
                    accumulatedText += delta;
                  }
                }
              }
            }
            
            // Session idle = processing complete
            if (event.eventType === "session.idle") {
              markDone();
            }
            
            // Also check session.status for idle state
            if (event.eventType === "session.status") {
              const status = eventData.properties?.status;
              if (status?.type === "idle") {
                markDone();
              }
            }
            
            // Handle errors
            if (event.eventType === "error") {
              streamError = new Error(String(event.data));
              markDone();
            }
          },
          (status, error) => {
            if (status === "error") {
              streamError = new Error(error || "Stream error");
              markDone();
            } else if (status === "disconnected") {
              markDone();
            }
          }
        );

        // Handle abort signal
        const abortHandler = () => {
          if (state.sessionId) {
            opencodeAbortSession(state.projectId, state.sessionId).catch(console.error);
          }
          stream?.disconnect().catch(console.error);
          markDone();
        };
        abortSignal?.addEventListener("abort", abortHandler);

        // Send the message (this triggers the AI response)
        console.log('[OpenCode Adapter] Sending message to session:', state.sessionId);
        try {
          const sendResponse = await opencodeSendMessage(state.projectId, state.sessionId, textContent.text);
          console.log('[OpenCode Adapter] Message sent successfully, response:', sendResponse);
          
          // Extract text from the response parts as fallback
          if (sendResponse && sendResponse.parts) {
            const textParts = sendResponse.parts
              .filter((part: { type: string; text?: string }) => part.type === "text" && part.text)
              .map((part: { text?: string }) => part.text!)
              .join("");
            if (textParts && !accumulatedText) {
              accumulatedText = textParts;
              console.log('[OpenCode Adapter] Using response text as fallback:', accumulatedText);
            }
          }
          
          // If the response has a finish state, we're done (no need to wait for SSE)
          if (sendResponse?.info?.finish) {
            console.log('[OpenCode Adapter] Response complete with finish state:', sendResponse.info.finish);
            markDone();
          }
        } catch (sendError) {
          console.error('[OpenCode Adapter] Failed to send message:', sendError);
          throw sendError;
        }

        // Poll for updates and yield streaming results
        let lastYieldedText = "";
        const maxWaitTime = 60000; // 60 seconds max wait
        const startTime = Date.now();
        
        while (!isStreamingDone && (Date.now() - startTime) < maxWaitTime) {
          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Yield current state if text has changed
          if (accumulatedText !== lastYieldedText) {
            lastYieldedText = accumulatedText;
            yield {
              content: [{ type: "text", text: accumulatedText }],
            };
          }
        }

        // Clean up
        abortSignal?.removeEventListener("abort", abortHandler);
        await stream?.disconnect();
        stream = null;

        if (streamError) {
          throw streamError;
        }

        // Final yield with complete response (ensure we yield at least once)
        if (accumulatedText && accumulatedText !== lastYieldedText) {
          yield {
            content: [{ type: "text", text: accumulatedText }],
          };
        }

      } catch (error) {
        // Clean up on error
        await stream?.disconnect();
        stream = null;
        throw error;
      }
    },
  };
}

/**
 * Get or create a session for a project
 */
export async function getOrCreateSession(projectId: string): Promise<Session> {
  const sessions = await opencodeListSessions(projectId);
  if (sessions.length > 0) {
    return sessions[0];
  }
  return opencodeCreateSession(projectId);
}

/**
 * Load message history for a session
 */
export async function loadMessageHistory(
  projectId: string,
  sessionId: string
): Promise<Message[]> {
  return opencodeListMessages(projectId, sessionId);
}

/**
 * Convert OpenCode messages to assistant-ui format
 */
export function convertToAssistantMessages(messages: Message[]): Array<{
  role: "user" | "assistant";
  content: Array<{ type: "text"; text: string }>;
}> {
  return messages.map((msg) => {
    const textParts = msg.parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => ({ type: "text" as const, text: part.text! }));

    return {
      role: msg.info.role,
      content: textParts.length > 0 ? textParts : [{ type: "text", text: "" }],
    };
  });
}
