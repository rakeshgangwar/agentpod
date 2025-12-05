/**
 * React Runtime Provider for assistant-ui
 * 
 * This component wraps assistant-ui's AssistantRuntimeProvider with our
 * custom OpenCode adapter. It's designed to be used within Svelte via
 * svelte-preprocess-react.
 */

import React, { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
} from "@assistant-ui/react";
import { createOpenCodeAdapter } from "./adapter";

interface RuntimeProviderProps {
  projectId: string;
  children: ReactNode;
}

/**
 * RuntimeProvider wraps children with the assistant-ui runtime
 * configured for OpenCode.
 */
export function RuntimeProvider({ projectId, children }: RuntimeProviderProps) {
  // Memoize the adapter to prevent recreating on every render
  const adapter = useMemo(() => createOpenCodeAdapter(projectId), [projectId]);
  
  // Create the local runtime with our adapter
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

export default RuntimeProvider;
