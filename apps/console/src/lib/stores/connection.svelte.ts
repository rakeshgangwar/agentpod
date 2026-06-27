/**
 * Connection Store
 *
 * Manages the connection state to the Management API using Svelte 5 runes.
 * Uses fetch + localStorage (no Tauri) so it works in the browser/SPA build.
 */

import { setAuthApiUrl } from "./auth.svelte";
import { probeHealth, getStoredApiUrl, setStoredApiUrl, clearStoredApiUrl } from "$lib/api/connection-web";

// =============================================================================
// Types
// =============================================================================

export interface ConnectionStatus {
  connected: boolean;
  apiUrl: string | null;
  lastTested: string | null;
  error: string | null;
}

// =============================================================================
// State
// =============================================================================

let connectionStatus = $state<ConnectionStatus>({
  connected: false,
  apiUrl: null,
  lastTested: null,
  error: null,
});

let isLoading = $state(false);
let isInitialized = $state(false);

// =============================================================================
// Derived State
// =============================================================================

export const connection = {
  get status() { return connectionStatus; },
  get isConnected() { return connectionStatus.connected; },
  get isLoading() { return isLoading; },
  get isInitialized() { return isInitialized; },
  get apiUrl() { return connectionStatus.apiUrl; },
  get error() { return connectionStatus.error; },
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Connect to a Management API instance.
 *
 * Probes GET /health; on success persists the URL to localStorage and updates
 * the auth client via setAuthApiUrl.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function connect(apiUrl: string, _apiKey?: string): Promise<boolean> {
  isLoading = true;
  try {
    const ok = await probeHealth(apiUrl);

    if (ok) {
      const normalised = apiUrl.replace(/\/$/, "");
      connectionStatus = {
        connected: true,
        apiUrl: normalised,
        lastTested: new Date().toISOString(),
        error: null,
      };
      setStoredApiUrl(normalised);
      setAuthApiUrl(normalised);
      return true;
    } else {
      connectionStatus = {
        connected: false,
        apiUrl,
        lastTested: new Date().toISOString(),
        error: "Health check failed",
      };
      return false;
    }
  } catch (error) {
    connectionStatus = {
      connected: false,
      apiUrl,
      lastTested: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Connection failed",
    };
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Restore connection from localStorage.
 *
 * Idempotent — safe to call multiple times. Re-probes /health whenever
 * called so the UI always reflects the current reachability of the hub.
 * If already connected and isInitialized, this is a no-op.
 */
export async function initConnection(): Promise<void> {
  if (isInitialized && connectionStatus.connected) return;

  const storedUrl = getStoredApiUrl();
  if (!storedUrl) {
    isInitialized = true;
    return;
  }

  isLoading = true;
  try {
    const ok = await probeHealth(storedUrl);

    if (ok) {
      const normalised = storedUrl.replace(/\/$/, "");
      connectionStatus = {
        connected: true,
        apiUrl: normalised,
        lastTested: new Date().toISOString(),
        error: null,
      };
      setAuthApiUrl(normalised);
    }
    // On failure: leave disconnected; keep the stored URL so the connect
    // screen can prefill the last-used address.
  } catch {
    // Network error — stay disconnected, URL remains in localStorage.
  } finally {
    isLoading = false;
    isInitialized = true;
  }
}

/**
 * Disconnect from the Management API.
 *
 * Clears the persisted URL and resets all state so initConnection can be
 * called again (important for test isolation).
 */
export async function disconnect(): Promise<void> {
  clearStoredApiUrl();
  connectionStatus = {
    connected: false,
    apiUrl: null,
    lastTested: null,
    error: null,
  };
  isInitialized = false;
  isLoading = false;
}

/**
 * Test the current connection (compatibility shim).
 */
export async function testConnection(): Promise<boolean> {
  if (!connectionStatus.apiUrl) return false;
  return connect(connectionStatus.apiUrl);
}
