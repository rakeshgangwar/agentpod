/**
 * React Runtime Provider for assistant-ui
 * 
 * This component wraps assistant-ui's AssistantRuntimeProvider with our
 * custom OpenCode adapter. It's designed to be used within Svelte via
 * svelte-preprocess-react.
 * 
 * We use a two-component pattern to ensure messages are loaded before
 * useLocalRuntime is called:
 * 1. RuntimeProvider - handles loading state and fetches messages
 * 2. RuntimeProviderInner - creates runtime with already-loaded messages
 */

import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
} from "@assistant-ui/react";
import { createOpenCodeAdapter } from "./adapter";
import { opencodeListMessages, type Message } from "../api/tauri";

interface RuntimeProviderProps {
  projectId: string;
  sessionId?: string;
  children: ReactNode;
}

type ConvertedMessage = {
  role: "user" | "assistant";
  content: Array<{ type: "text"; text: string }>;
};

/**
 * Convert OpenCode messages to assistant-ui format
 */
function convertMessages(messages: Message[]): ConvertedMessage[] {
  return messages.map((msg) => {
    const textParts = msg.parts
      .filter((part): part is typeof part & { text: string } => 
        part.type === "text" && typeof part.text === "string"
      )
      .map((part) => ({ type: "text" as const, text: part.text }));

    return {
      role: msg.info.role,
      content: textParts.length > 0 ? textParts : [{ type: "text" as const, text: "" }],
    };
  });
}

/**
 * Inner component that creates the runtime with pre-loaded messages.
 * This ensures useLocalRuntime receives messages on first render.
 */
function RuntimeProviderInner({ 
  projectId, 
  sessionId, 
  initialMessages, 
  children 
}: RuntimeProviderProps & { initialMessages: ConvertedMessage[] }) {
  // Memoize the adapter to prevent recreating on every render
  const adapter = useMemo(
    () => createOpenCodeAdapter(projectId, sessionId),
    [projectId, sessionId]
  );
  
  // Create the local runtime with our adapter and pre-loaded messages
  const runtime = useLocalRuntime(adapter, {
    initialMessages,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

/**
 * RuntimeProvider wraps children with the assistant-ui runtime
 * configured for OpenCode. Handles loading messages before initializing runtime.
 */
export function RuntimeProvider({ projectId, sessionId, children }: RuntimeProviderProps) {
  const [initialMessages, setInitialMessages] = useState<ConvertedMessage[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load messages when component mounts (sessionId is already set via key block)
  useEffect(() => {
    let cancelled = false;
    
    async function loadMessages() {
      if (!sessionId) {
        setInitialMessages([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        console.log('[RuntimeProvider] Loading messages for session:', sessionId);
        const messages = await opencodeListMessages(projectId, sessionId);
        
        if (cancelled) return;
        
        const converted = convertMessages(messages);
        console.log('[RuntimeProvider] Loaded messages:', converted.length);
        setInitialMessages(converted);
      } catch (err) {
        if (cancelled) return;
        console.error('[RuntimeProvider] Failed to load messages:', err);
        setError(err instanceof Error ? err.message : 'Failed to load messages');
        setInitialMessages([]);
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

  // Show loading state
  if (isLoading || initialMessages === null) {
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

  // Render inner component with loaded messages
  // Key ensures the inner component remounts when messages change
  return (
    <RuntimeProviderInner
      key={`${sessionId}-${initialMessages.length}`}
      projectId={projectId}
      sessionId={sessionId}
      initialMessages={initialMessages}
    >
      {children}
    </RuntimeProviderInner>
  );
}

export default RuntimeProvider;
