/**
 * Connection Store
 * 
 * Manages the connection state to the Management API using Svelte 5 runes.
 */

import * as api from "$lib/api/tauri";
import type { ConnectionStatus } from "$lib/api/tauri";
import { setAuthApiUrl } from "./auth.svelte";

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
 * Initialize the connection state from storage
 */
export async function initConnection(): Promise<void> {
  if (isInitialized) return;
  
  isLoading = true;
  try {
    connectionStatus = await api.getConnectionStatus();
    
    // If we have a stored connection, test it
    if (connectionStatus.connected) {
      connectionStatus = await api.testConnection();
      
      // Set the API URL for the auth client
      if (connectionStatus.connected && connectionStatus.apiUrl) {
        setAuthApiUrl(connectionStatus.apiUrl);
      }
    }
  } catch (error) {
    connectionStatus = {
      connected: false,
      apiUrl: null,
      lastTested: null,
      error: error instanceof Error ? error.message : "Failed to initialize connection",
    };
  } finally {
    isLoading = false;
    isInitialized = true;
  }
}

/**
 * Connect to a Management API instance
 */
export async function connect(apiUrl: string, apiKey?: string): Promise<boolean> {
  isLoading = true;
  try {
    connectionStatus = await api.connect(apiUrl, apiKey);
    
    // Set the API URL for the auth client when connection succeeds
    if (connectionStatus.connected) {
      setAuthApiUrl(apiUrl);
    }
    
    return connectionStatus.connected;
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
 * Disconnect from the Management API
 */
export async function disconnect(): Promise<void> {
  isLoading = true;
  try {
    await api.disconnect();
    connectionStatus = {
      connected: false,
      apiUrl: null,
      lastTested: null,
      error: null,
    };
  } catch (error) {
    connectionStatus.error = error instanceof Error ? error.message : "Disconnect failed";
  } finally {
    isLoading = false;
  }
}

/**
 * Test the current connection
 */
export async function testConnection(): Promise<boolean> {
  isLoading = true;
  try {
    connectionStatus = await api.testConnection();
    return connectionStatus.connected;
  } catch (error) {
    connectionStatus.error = error instanceof Error ? error.message : "Connection test failed";
    return false;
  } finally {
    isLoading = false;
  }
}
