/**
 * Session Status Store
 * 
 * Tracks the real-time status of all sessions (idle, busy, retry)
 * and their "last viewed" timestamps for unread detection.
 * 
 * Uses Svelte 5 runes for reactivity.
 */

export type SessionStatusType = "idle" | "busy" | "retry";

export interface RetryInfo {
  attempt: number;
  message: string;
  next: number;
}

export interface SessionStatusEntry {
  status: SessionStatusType;
  retryInfo?: RetryInfo | null;
  lastViewed?: number;
}

/**
 * Global map of session ID to status info
 */
const sessionStatusMap = $state<Map<string, SessionStatusEntry>>(new Map());

/**
 * Set the status of a session
 */
export function setSessionStatus(
  sessionId: string,
  status: SessionStatusType,
  retryInfo?: RetryInfo | null
): void {
  const existing = sessionStatusMap.get(sessionId);
  sessionStatusMap.set(sessionId, {
    status,
    retryInfo,
    lastViewed: existing?.lastViewed,
  });
}

/**
 * Mark a session as viewed (user opened it)
 */
export function markSessionViewed(sessionId: string): void {
  const existing = sessionStatusMap.get(sessionId);
  if (existing) {
    sessionStatusMap.set(sessionId, {
      ...existing,
      lastViewed: Date.now(),
    });
  } else {
    sessionStatusMap.set(sessionId, {
      status: "idle",
      lastViewed: Date.now(),
    });
  }
}

/**
 * Get the status entry for a session
 */
export function getSessionStatus(sessionId: string): SessionStatusEntry | undefined {
  return sessionStatusMap.get(sessionId);
}

/**
 * Check if a session is busy
 */
export function isSessionBusy(sessionId: string): boolean {
  const entry = sessionStatusMap.get(sessionId);
  return entry?.status === "busy";
}

/**
 * Check if a session has unread messages
 * (last updated after last viewed)
 */
export function hasUnreadMessages(sessionId: string, lastUpdated?: number): boolean {
  if (!lastUpdated) return false;
  
  const entry = sessionStatusMap.get(sessionId);
  if (!entry?.lastViewed) return false;
  
  return lastUpdated > entry.lastViewed;
}

/**
 * Export the map for reactive access in components
 */
export { sessionStatusMap };
