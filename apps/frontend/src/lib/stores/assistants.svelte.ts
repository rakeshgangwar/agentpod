/**
 * AI Assistants Store
 * 
 * Manages AI Assistants (agent harnesses) state using Svelte 5 runes.
 * Provides access to available assistants, their modes, and authentication state.
 */

import * as api from "$lib/api/tauri";
import type {
  AgentInstance,
  AgentMode,
  AgentAuthState,
  AgentAuthInitResponse,
} from "$lib/api/tauri";

// =============================================================================
// State
// =============================================================================

let assistants = $state<AgentInstance[]>([]);
let defaultAssistantId = $state<string>("opencode");
let modes = $state<Map<string, AgentMode[]>>(new Map());
let authStates = $state<Map<string, AgentAuthState>>(new Map());
let isLoading = $state(false);
let isInitialized = $state(false);
let error = $state<string | null>(null);

// =============================================================================
// Derived State
// =============================================================================

/**
 * Get built-in (pre-installed) assistants
 */
const builtInAssistants = $derived(
  assistants.filter(a => a.config.isBuiltIn)
);

/**
 * Get custom (user-added) assistants
 */
const customAssistants = $derived(
  assistants.filter(a => !a.config.isBuiltIn)
);

/**
 * Get assistants that are ready to use (authenticated or no auth required)
 */
const readyAssistants = $derived(
  assistants.filter(a => !a.config.requiresAuth || a.authenticated)
);

/**
 * Get assistants that need authentication
 */
const authRequiredAssistants = $derived(
  assistants.filter(a => a.config.requiresAuth && !a.authenticated)
);

/**
 * Get the default assistant instance
 */
const defaultAssistant = $derived(
  assistants.find(a => a.id === defaultAssistantId)
);

/**
 * Get running assistants
 */
const runningAssistants = $derived(
  assistants.filter(a => a.status === "running")
);

// =============================================================================
// Exported Store
// =============================================================================

export const assistantsStore = {
  // List accessors
  get all() { return assistants; },
  get builtIn() { return builtInAssistants; },
  get custom() { return customAssistants; },
  get ready() { return readyAssistants; },
  get authRequired() { return authRequiredAssistants; },
  get running() { return runningAssistants; },
  
  // Default assistant
  get defaultId() { return defaultAssistantId; },
  get default() { return defaultAssistant; },
  
  // Loading/error state
  get isLoading() { return isLoading; },
  get isInitialized() { return isInitialized; },
  get error() { return error; },
  
  // Helper functions
  getById(id: string) {
    return assistants.find(a => a.id === id);
  },
  
  getModes(assistantId: string) {
    return modes.get(assistantId) || [];
  },
  
  getAuthState(assistantId: string) {
    return authStates.get(assistantId);
  },
  
  isAuthenticated(assistantId: string) {
    const assistant = assistants.find(a => a.id === assistantId);
    return assistant ? (!assistant.config.requiresAuth || assistant.authenticated) : false;
  },
  
  isRunning(assistantId: string) {
    const assistant = assistants.find(a => a.id === assistantId);
    return assistant?.status === "running";
  },
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Initialize the assistants store by fetching from the backend
 */
export async function initAssistants(): Promise<void> {
  if (isInitialized) return;
  
  isLoading = true;
  error = null;
  
  try {
    const response = await api.listAgents();
    assistants = response.assistants;
    defaultAssistantId = response.defaultAssistantId;
    isInitialized = true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load assistants";
    console.error("Failed to initialize assistants:", e);
  } finally {
    isLoading = false;
  }
}

/**
 * Refresh the assistants list from the backend
 */
export async function refreshAssistants(): Promise<void> {
  isLoading = true;
  error = null;
  
  try {
    const response = await api.listAgents();
    assistants = response.assistants;
    defaultAssistantId = response.defaultAssistantId;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to refresh assistants";
    throw e;
  } finally {
    isLoading = false;
  }
}

/**
 * Get a specific assistant by ID
 */
export async function fetchAssistant(assistantId: string): Promise<AgentInstance> {
  try {
    const assistant = await api.getAgent(assistantId);
    // Update in local state
    const index = assistants.findIndex(a => a.id === assistantId);
    if (index >= 0) {
      assistants[index] = assistant;
    } else {
      assistants = [...assistants, assistant];
    }
    return assistant;
  } catch (e) {
    error = e instanceof Error ? e.message : `Failed to fetch assistant ${assistantId}`;
    throw e;
  }
}

/**
 * Fetch modes for an assistant
 */
export async function fetchModes(assistantId: string): Promise<AgentMode[]> {
  try {
    const response = await api.getAgentModes(assistantId);
    modes.set(assistantId, response.modes);
    return response.modes;
  } catch (e) {
    console.error(`Failed to fetch modes for ${assistantId}:`, e);
    return [];
  }
}

/**
 * Spawn (start) an assistant
 */
export async function spawnAssistant(
  assistantId: string,
  env?: Record<string, string>,
  workingDirectory?: string
): Promise<void> {
  const assistant = assistants.find(a => a.id === assistantId);
  if (!assistant) {
    throw new Error(`Unknown assistant: ${assistantId}`);
  }
  
  if (assistant.config.requiresAuth && !assistant.authenticated) {
    throw new Error("Authentication required before spawning this assistant");
  }
  
  try {
    await api.spawnAgent(assistantId, env, workingDirectory);
    // Refresh to get updated status
    await refreshAssistants();
  } catch (e) {
    error = e instanceof Error ? e.message : `Failed to spawn assistant ${assistantId}`;
    throw e;
  }
}

/**
 * Stop an assistant
 */
export async function stopAssistant(assistantId: string): Promise<void> {
  try {
    await api.stopAgent(assistantId);
    // Refresh to get updated status
    await refreshAssistants();
  } catch (e) {
    error = e instanceof Error ? e.message : `Failed to stop assistant ${assistantId}`;
    throw e;
  }
}

/**
 * Initialize authentication for an assistant
 * Returns the auth state that should be displayed to the user
 */
export async function initAuth(assistantId: string): Promise<AgentAuthInitResponse> {
  try {
    const response = await api.initAgentAuth(assistantId);
    
    // Store auth state locally
    const authState: AgentAuthState = {
      agentId: assistantId,
      status: "pending",
      flowType: response.flowType,
      userCode: response.userCode,
      verificationUrl: response.verificationUrl,
      authUrl: response.authUrl,
      expiresAt: response.expiresIn 
        ? new Date(Date.now() + response.expiresIn * 1000).toISOString() 
        : undefined,
    };
    authStates.set(assistantId, authState);
    
    return response;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : `Failed to init auth for ${assistantId}`;
    
    // Store failed auth state
    authStates.set(assistantId, {
      agentId: assistantId,
      status: "failed",
      flowType: "url_first",
      error: errorMsg,
    });
    
    throw e;
  }
}

/**
 * Complete authentication for an assistant
 */
export async function completeAuth(
  assistantId: string,
  code?: string,
  token?: string
): Promise<void> {
  try {
    const response = await api.completeAgentAuth(assistantId, code, token);
    
    if (response.success) {
      // Update auth state to completed
      authStates.set(assistantId, {
        agentId: assistantId,
        status: "completed",
        flowType: authStates.get(assistantId)?.flowType || "url_first",
      });
      
      // Refresh to get updated authenticated status
      await refreshAssistants();
    } else {
      throw new Error(response.error || "Authentication failed");
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Authentication failed";
    
    // Update auth state to failed
    const currentState = authStates.get(assistantId);
    authStates.set(assistantId, {
      ...currentState,
      agentId: assistantId,
      status: "failed",
      flowType: currentState?.flowType || "url_first",
      error: errorMsg,
    });
    
    throw e;
  }
}

/**
 * Clear auth state for an assistant (e.g., to retry)
 */
export function clearAuthState(assistantId: string): void {
  authStates.delete(assistantId);
}

/**
 * Add a custom assistant
 */
export async function addCustomAssistant(config: {
  id: string;
  name: string;
  command: string;
  description?: string;
  args?: string[];
  requiresAuth?: boolean;
  authType?: string;
  authFlowType?: string;
  authProvider?: string;
  authUrl?: string;
  envVars?: Record<string, string>;
}): Promise<AgentInstance> {
  try {
    const assistant = await api.addCustomAgent(
      config.id,
      config.name,
      config.command,
      config.description,
      config.args,
      config.requiresAuth,
      config.authType,
      config.authFlowType,
      config.authProvider,
      config.authUrl,
      config.envVars
    );
    
    // Add to local state
    assistants = [...assistants, assistant];
    
    return assistant;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to add custom assistant";
    throw e;
  }
}

/**
 * Remove a custom assistant
 */
export async function removeCustomAssistant(assistantId: string): Promise<void> {
  const assistant = assistants.find(a => a.id === assistantId);
  if (assistant?.config.isBuiltIn) {
    throw new Error("Cannot remove built-in assistants");
  }
  
  try {
    await api.removeAgent(assistantId);
    
    // Remove from local state
    assistants = assistants.filter(a => a.id !== assistantId);
    modes.delete(assistantId);
    authStates.delete(assistantId);
  } catch (e) {
    error = e instanceof Error ? e.message : `Failed to remove assistant ${assistantId}`;
    throw e;
  }
}

/**
 * Set the default assistant for new sessions
 */
export async function setDefaultAssistant(assistantId: string): Promise<void> {
  try {
    await api.setDefaultAgentId(assistantId);
    defaultAssistantId = assistantId;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to set default assistant";
    throw e;
  }
}

/**
 * Get auth status for an assistant (from backend)
 */
export async function checkAuthStatus(assistantId: string): Promise<boolean> {
  try {
    const response = await api.getAgentAuthStatus(assistantId);
    return response.authenticated;
  } catch (e) {
    console.error(`Failed to check auth status for ${assistantId}:`, e);
    return false;
  }
}
