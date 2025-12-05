/**
 * OpenCode Chat Model Adapter for assistant-ui
 * 
 * This adapter connects assistant-ui to the OpenCode API via Tauri commands.
 * It handles session management, message sending, and real-time streaming.
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
 * @returns ChatModelAdapter compatible with assistant-ui
 */
export function createOpenCodeAdapter(projectId: string): ChatModelAdapter {
  // Session state - persisted across runs
  const state: SessionState = {
    projectId,
    sessionId: null,
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

        // Set up streaming if not already connected
        let accumulatedText = "";
        let streamingResolve: ((value: void) => void) | null = null;
        let streamError: Error | null = null;

        // Create a promise that resolves when streaming is done
        const streamingComplete = new Promise<void>((resolve, reject) => {
          streamingResolve = resolve;
        });

        // Connect to SSE stream
        stream = new OpenCodeStream(state.projectId);
        await stream.connect(
          (event: OpenCodeEvent) => {
            // Handle different event types
            if (event.eventType === "message.part.updated") {
              const data = event.data as { text?: string; content?: string };
              const newText = data.text || data.content || "";
              if (newText) {
                accumulatedText = newText;
              }
            } else if (event.eventType === "session.updated") {
              const data = event.data as { status?: string };
              if (data.status === "idle") {
                // Session finished processing
                streamingResolve?.();
              }
            } else if (event.eventType === "error") {
              streamError = new Error(String(event.data));
              streamingResolve?.();
            }
          },
          (status, error) => {
            if (status === "error") {
              streamError = new Error(error || "Stream error");
              streamingResolve?.();
            } else if (status === "disconnected") {
              streamingResolve?.();
            }
          }
        );

        // Handle abort signal
        const abortHandler = () => {
          if (state.sessionId) {
            opencodeAbortSession(state.projectId, state.sessionId).catch(console.error);
          }
          stream?.disconnect().catch(console.error);
          streamingResolve?.();
        };
        abortSignal?.addEventListener("abort", abortHandler);

        // Send the message (this triggers the AI response)
        await opencodeSendMessage(state.projectId, state.sessionId, textContent.text);

        // Stream updates as they come in
        const pollInterval = setInterval(() => {
          if (accumulatedText) {
            // We'll yield in the loop below
          }
        }, 100);

        // Poll for updates and yield
        let lastYieldedText = "";
        while (true) {
          // Check if streaming is complete
          const raceResult = await Promise.race([
            streamingComplete.then(() => "done" as const),
            new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
          ]);

          // Yield current state if text has changed
          if (accumulatedText !== lastYieldedText) {
            lastYieldedText = accumulatedText;
            yield {
              content: [{ type: "text", text: accumulatedText }],
            };
          }

          if (raceResult === "done") {
            break;
          }
        }

        clearInterval(pollInterval);

        // Clean up
        abortSignal?.removeEventListener("abort", abortHandler);
        await stream?.disconnect();
        stream = null;

        if (streamError) {
          throw streamError;
        }

        // Final yield with complete response
        if (accumulatedText) {
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
