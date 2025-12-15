/**
 * Terminals Store
 * 
 * Manages interactive terminal sessions for sandboxes using Svelte 5 runes.
 * Provides WebSocket-based PTY connections through the Tauri backend.
 * 
 * Features:
 * - Max 5 terminals per sandbox
 * - Auto-reconnect with 3 retries
 * - Session persistence across page navigation
 * - Event-based output streaming
 */

import * as api from "$lib/api/tauri";
import type {
  TerminalStatusType,
  TerminalOutputPayload,
  TerminalStatusPayload,
} from "$lib/api/tauri";
import type { UnlistenFn } from "@tauri-apps/api/event";

// =============================================================================
// Constants
// =============================================================================

const MAX_TERMINALS_PER_SANDBOX = 5;
const MAX_RECONNECT_RETRIES = 3;
const RECONNECT_DELAY_MS = 1000;

// =============================================================================
// Types
// =============================================================================

/** Terminal session state */
export interface TerminalSession {
  terminalId: string;
  sandboxId: string;
  status: TerminalStatusType;
  shell?: string;
  exitCode?: number;
  error?: string;
  createdAt: number;
  reconnectAttempts: number;
  outputBuffer: string[];
}

/** Callback for terminal output */
export type TerminalOutputCallback = (terminalId: string, data: string) => void;

// =============================================================================
// State
// =============================================================================

/** Record of terminal ID -> session (using object for Svelte 5 reactivity) */
let terminalSessions = $state<Record<string, TerminalSession>>({});

/** Version counter to force reactivity updates when sessions change */
let sessionsVersion = $state(0);

/** Currently active terminal ID (for UI focus) */
let activeTerminalId = $state<string | null>(null);

/** Loading state for connect operations */
let isConnecting = $state(false);

/** Global error message */
let error = $state<string | null>(null);

/** Event listener cleanup functions */
let outputUnlisten: UnlistenFn | null = null;
let statusUnlisten: UnlistenFn | null = null;

/** Output callbacks per terminal */
const outputCallbacks = new Map<string, Set<TerminalOutputCallback>>();

/** Flag to track if listeners are initialized */
let listenersInitialized = false;

// =============================================================================
// Exported State (Reactive Getters)
// =============================================================================

export const terminals = {
  /** All terminal sessions */
  get sessions() { return terminalSessions; },
  
  /** Version counter - subscribe to this to react to session changes */
  get version() { return sessionsVersion; },
  
  /** Currently active terminal ID */
  get activeId() { return activeTerminalId; },
  
  /** Get the active terminal session */
  get active() { 
    return activeTerminalId ? terminalSessions[activeTerminalId] ?? null : null;
  },
  
  /** Is a connection in progress */
  get isConnecting() { return isConnecting; },
  
  /** Global error message */
  get error() { return error; },
  
  /** Total terminal count */
  get count() { return Object.keys(terminalSessions).length; },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get terminals for a specific sandbox
 */
export function getTerminalsForSandbox(sandboxId: string): TerminalSession[] {
  // Access version to ensure reactivity tracking
  void sessionsVersion;
  return Object.values(terminalSessions).filter(
    (session) => session.sandboxId === sandboxId
  );
}

/**
 * Get terminal count for a specific sandbox
 */
export function getTerminalCountForSandbox(sandboxId: string): number {
  return getTerminalsForSandbox(sandboxId).length;
}

/**
 * Check if we can create another terminal for this sandbox
 */
export function canCreateTerminal(sandboxId: string): boolean {
  return getTerminalCountForSandbox(sandboxId) < MAX_TERMINALS_PER_SANDBOX;
}

/**
 * Get a specific terminal session
 */
export function getTerminal(terminalId: string): TerminalSession | undefined {
  return terminalSessions[terminalId];
}

// =============================================================================
// Event Listeners
// =============================================================================

/**
 * Initialize event listeners for terminal events.
 * Call this once when the app starts or when entering a terminal view.
 */
export async function initTerminalListeners(): Promise<void> {
  if (listenersInitialized) {
    console.debug("[Terminals] Listeners already initialized");
    return;
  }

  console.debug("[Terminals] Initializing event listeners");

  // Listen for terminal output
  outputUnlisten = await api.onTerminalOutput((payload: TerminalOutputPayload) => {
    const { terminal_id, data } = payload;
    
    // Update output buffer in session
    const session = terminalSessions[terminal_id];
    if (session) {
      // Keep buffer limited to last 10000 lines
      session.outputBuffer.push(data);
      if (session.outputBuffer.length > 10000) {
        session.outputBuffer = session.outputBuffer.slice(-5000);
      }
    }

    // Call registered callbacks
    const callbacks = outputCallbacks.get(terminal_id);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(terminal_id, data);
        } catch (e) {
          console.error("[Terminals] Output callback error:", e);
        }
      }
    }
  });

  // Listen for terminal status changes
  statusUnlisten = await api.onTerminalStatus((payload: TerminalStatusPayload) => {
    const { terminal_id, sandbox_id, status, shell, exit_code, error: statusError } = payload;
    
    console.debug("[Terminals] Status event:", terminal_id, status, statusError ? `error: ${statusError}` : "");

    const session = terminalSessions[terminal_id];
    if (session) {
      // Update existing session - need to reassign for reactivity
      terminalSessions[terminal_id] = {
        ...session,
        status,
        shell: shell ?? session.shell,
        exitCode: exit_code ?? session.exitCode,
        error: statusError ?? session.error,
      };
      sessionsVersion++;

      // Handle auto-reconnect on error/disconnect
      if ((status === "error" || status === "disconnected") && exit_code === undefined) {
        handleReconnect(terminal_id, sandbox_id);
      }
    } else if (status === "connecting" || status === "connected") {
      // New session we don't know about yet - create it
      terminalSessions[terminal_id] = {
        terminalId: terminal_id,
        sandboxId: sandbox_id,
        status,
        shell,
        createdAt: Date.now(),
        reconnectAttempts: 0,
        outputBuffer: [],
      };
      sessionsVersion++;
      console.debug("[Terminals] Created new session from status event:", terminal_id);
    }
  });

  listenersInitialized = true;
}

/**
 * Cleanup event listeners.
 * Call this when leaving terminal views or on app shutdown.
 */
export async function cleanupTerminalListeners(): Promise<void> {
  console.debug("[Terminals] Cleaning up event listeners");
  
  if (outputUnlisten) {
    outputUnlisten();
    outputUnlisten = null;
  }
  
  if (statusUnlisten) {
    statusUnlisten();
    statusUnlisten = null;
  }
  
  listenersInitialized = false;
}

// =============================================================================
// Output Callbacks
// =============================================================================

/**
 * Register a callback for terminal output.
 * Used by xterm.js components to receive data.
 */
export function onOutput(terminalId: string, callback: TerminalOutputCallback): () => void {
  let callbacks = outputCallbacks.get(terminalId);
  if (!callbacks) {
    callbacks = new Set();
    outputCallbacks.set(terminalId, callbacks);
  }
  callbacks.add(callback);

  // Return unsubscribe function
  return () => {
    callbacks?.delete(callback);
    if (callbacks?.size === 0) {
      outputCallbacks.delete(terminalId);
    }
  };
}

// =============================================================================
// Terminal Actions
// =============================================================================

/**
 * Connect to a new terminal session for a sandbox
 */
export async function connectTerminal(sandboxId: string): Promise<TerminalSession | null> {
  // Check limit
  if (!canCreateTerminal(sandboxId)) {
    error = `Maximum ${MAX_TERMINALS_PER_SANDBOX} terminals allowed per sandbox`;
    return null;
  }

  // Ensure listeners are initialized
  await initTerminalListeners();

  isConnecting = true;
  error = null;

  try {
    console.debug("[Terminals] Connecting to sandbox:", sandboxId);
    const connection = await api.terminalConnect(sandboxId);
    
    // Create session (status will be updated by event listener)
    const session: TerminalSession = {
      terminalId: connection.terminalId,
      sandboxId: connection.sandboxId,
      status: "connecting",
      createdAt: Date.now(),
      reconnectAttempts: 0,
      outputBuffer: [],
    };
    
    terminalSessions[connection.terminalId] = session;
    activeTerminalId = connection.terminalId;
    
    console.debug("[Terminals] Created session:", connection.terminalId);
    return session;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to connect terminal";
    error = message;
    console.error("[Terminals] Connect error:", message);
    return null;
  } finally {
    isConnecting = false;
  }
}

/**
 * Disconnect from a terminal session
 */
export async function disconnectTerminal(terminalId: string): Promise<void> {
  try {
    console.debug("[Terminals] Disconnecting terminal:", terminalId);
    await api.terminalDisconnect(terminalId);
    
    // Remove session
    delete terminalSessions[terminalId];
    outputCallbacks.delete(terminalId);
    
    // Update active terminal if needed
    if (activeTerminalId === terminalId) {
      const remaining = Object.keys(terminalSessions);
      activeTerminalId = remaining.length > 0 ? remaining[0] : null;
    }
  } catch (e) {
    console.error("[Terminals] Disconnect error:", e);
  }
}

/**
 * Disconnect all terminals for a sandbox
 */
export async function disconnectAllTerminals(sandboxId: string): Promise<void> {
  try {
    console.debug("[Terminals] Disconnecting all terminals for sandbox:", sandboxId);
    await api.terminalDisconnectAll(sandboxId);
    
    // Remove all sessions for this sandbox
    for (const [id, session] of Object.entries(terminalSessions)) {
      if (session.sandboxId === sandboxId) {
        delete terminalSessions[id];
        outputCallbacks.delete(id);
      }
    }
    
    // Update active terminal if needed
    const activeSession = activeTerminalId ? terminalSessions[activeTerminalId] : null;
    if (activeSession?.sandboxId === sandboxId) {
      const remaining = Object.keys(terminalSessions);
      activeTerminalId = remaining.length > 0 ? remaining[0] : null;
    }
  } catch (e) {
    console.error("[Terminals] Disconnect all error:", e);
  }
}

/**
 * Send input to a terminal
 */
export async function sendInput(terminalId: string, data: string): Promise<void> {
  try {
    await api.terminalSendInput(terminalId, data);
  } catch (e) {
    console.error("[Terminals] Send input error:", e);
    error = e instanceof Error ? e.message : "Failed to send input";
  }
}

/**
 * Resize a terminal
 */
export async function resize(terminalId: string, cols: number, rows: number): Promise<void> {
  try {
    await api.terminalResize(terminalId, cols, rows);
  } catch (e) {
    console.error("[Terminals] Resize error:", e);
  }
}

/**
 * Set the active terminal
 */
export function setActiveTerminal(terminalId: string | null): void {
  if (terminalId === null || terminalId in terminalSessions) {
    activeTerminalId = terminalId;
  }
}

/**
 * Clear error
 */
export function clearError(): void {
  error = null;
}

// =============================================================================
// Auto-Reconnect
// =============================================================================

/**
 * Handle automatic reconnection on disconnect/error
 */
async function handleReconnect(terminalId: string, sandboxId: string): Promise<void> {
  const session = terminalSessions[terminalId];
  if (!session) return;

  // Check retry limit
  if (session.reconnectAttempts >= MAX_RECONNECT_RETRIES) {
    console.warn("[Terminals] Max reconnect attempts reached for:", terminalId);
    terminalSessions[terminalId] = {
      ...session,
      error: "Connection lost. Click to reconnect manually.",
    };
    return;
  }

  // Increment retry counter
  const reconnectAttempts = session.reconnectAttempts + 1;
  console.debug("[Terminals] Reconnect attempt", reconnectAttempts, "for:", terminalId);

  // Wait before reconnecting
  await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS * reconnectAttempts));

  // Remove old session
  const outputBuffer = session.outputBuffer; // Preserve output history
  delete terminalSessions[terminalId];
  outputCallbacks.delete(terminalId);

  // Try to reconnect
  try {
    const connection = await api.terminalConnect(sandboxId);
    
    terminalSessions[connection.terminalId] = {
      terminalId: connection.terminalId,
      sandboxId: connection.sandboxId,
      status: "connecting",
      createdAt: Date.now(),
      reconnectAttempts,
      outputBuffer, // Preserve output history
    };
    
    // Update active terminal if this was the active one
    if (activeTerminalId === terminalId) {
      activeTerminalId = connection.terminalId;
    }
    
    console.debug("[Terminals] Reconnected as:", connection.terminalId);
  } catch (e) {
    console.error("[Terminals] Reconnect failed:", e);
    
    // Restore session with error
    terminalSessions[terminalId] = {
      ...session,
      reconnectAttempts,
      status: "error",
      error: "Reconnection failed. Click to try again.",
    };
  }
}

/**
 * Manually trigger reconnection for a terminal
 */
export async function manualReconnect(terminalId: string): Promise<TerminalSession | null> {
  const session = terminalSessions[terminalId];
  if (!session) return null;

  const sandboxId = session.sandboxId;
  
  // Remove old session and reconnect
  delete terminalSessions[terminalId];
  outputCallbacks.delete(terminalId);
  
  return connectTerminal(sandboxId);
}

// =============================================================================
// Sync with Backend
// =============================================================================

/**
 * Sync terminal state with the backend.
 * Useful when returning to terminal view after navigation.
 */
export async function syncTerminals(sandboxId: string): Promise<void> {
  try {
    const backendTerminals = await api.terminalList(sandboxId);
    
    // Find terminals we have locally but not in backend (stale)
    for (const [id, session] of Object.entries(terminalSessions)) {
      if (session.sandboxId === sandboxId && !backendTerminals.includes(id)) {
        console.debug("[Terminals] Removing stale session:", id);
        delete terminalSessions[id];
        outputCallbacks.delete(id);
      }
    }
    
    // Note: We don't add terminals from backend that we don't have locally
    // because we wouldn't have proper output callbacks for them
    
  } catch (e) {
    console.error("[Terminals] Sync error:", e);
  }
}
