/**
 * connection-web.ts
 *
 * Browser-side helpers for probing the hub health endpoint and managing the
 * persisted API URL in localStorage.
 *
 * All localStorage access is guarded for SSR safety.
 */

const LS_KEY = "agentpod.apiUrl";

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function getStoredApiUrl(): string | null {
  if (!hasStorage()) return null;
  return localStorage.getItem(LS_KEY);
}

export function setStoredApiUrl(apiUrl: string): void {
  if (!hasStorage()) return;
  localStorage.setItem(LS_KEY, apiUrl);
}

export function clearStoredApiUrl(): void {
  if (!hasStorage()) return;
  localStorage.removeItem(LS_KEY);
}

// ---------------------------------------------------------------------------
// Health probe
// ---------------------------------------------------------------------------

/**
 * Probe the hub's /health endpoint.
 * Returns true when the response status is 2xx.
 * Throws on network error — callers must catch.
 */
export async function probeHealth(apiUrl: string): Promise<boolean> {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/health`);
  return res.ok;
}
