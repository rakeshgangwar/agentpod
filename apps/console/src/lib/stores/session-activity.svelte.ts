/**
 * Session Activity Store
 * 
 * Tracks which sandboxes have active/busy sessions.
 * This is updated when users interact with chat pages and provides
 * a way to show activity indicators on the projects page.
 * 
 * IMPORTANT: This store uses a non-reactive approach to avoid
 * Svelte 5 reactivity issues that were causing cards to disappear.
 * Components should poll getBusySandboxIds() or use subscriptions.
 */

type SessionActivityState = {
  isBusy: boolean;
  lastUpdate: number;
  sessionId?: string;
};

// Simple Map for activity tracking (completely non-reactive)
const activityMap = new Map<string, SessionActivityState>();

// Stale threshold - 10 seconds
// This determines how long a session is considered "active" without updates
// Lower values = faster detection when user leaves chat page, but may cause
// flickering if updates are delayed
const STALE_THRESHOLD_MS = 10000;

// Subscribers for change notifications
type Subscriber = () => void;
const subscribers = new Set<Subscriber>();

/**
 * Subscribe to activity changes
 * Returns an unsubscribe function
 */
export function subscribeToActivityChanges(callback: Subscriber): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * Notify all subscribers of a change
 */
function notifySubscribers(): void {
  for (const callback of subscribers) {
    try {
      callback();
    } catch (e) {
      console.error("[SessionActivity] Subscriber error:", e);
    }
  }
}

/**
 * Check if a session activity is stale (not updated recently)
 */
function isStale(lastUpdate: number): boolean {
  return Date.now() - lastUpdate > STALE_THRESHOLD_MS;
}

/**
 * Check if a sandbox has any busy sessions (with stale check)
 * This is a plain function, not reactive
 */
export function isSandboxBusy(sandboxId: string): boolean {
  const state = activityMap.get(sandboxId);
  if (!state || !state.isBusy) return false;
  return !isStale(state.lastUpdate);
}

/**
 * Get all busy sandbox IDs as an array (with stale check)
 * This is a plain function, not reactive
 */
export function getBusySandboxIds(): string[] {
  const now = Date.now();
  const ids: string[] = [];
  
  for (const [id, state] of activityMap) {
    if (state.isBusy && now - state.lastUpdate <= STALE_THRESHOLD_MS) {
      ids.push(id);
    }
  }
  
  return ids;
}

/**
 * Get the activity state for a sandbox (for debugging)
 */
export function getSessionActivity(sandboxId: string): SessionActivityState | undefined {
  return activityMap.get(sandboxId);
}

/**
 * Update the activity state for a sandbox
 */
export function setSessionActivity(
  sandboxId: string, 
  isBusy: boolean, 
  sessionId?: string
): void {
  // Check if this is actually a change
  const current = activityMap.get(sandboxId);
  const wasbusy = current?.isBusy ?? false;
  
  // Update the map
  activityMap.set(sandboxId, {
    isBusy,
    lastUpdate: Date.now(),
    sessionId,
  });
  
  console.log("[SessionActivity] Updated:", sandboxId, "isBusy:", isBusy);
  
  // Only notify if the busy state actually changed
  if (wasbusy !== isBusy) {
    notifySubscribers();
  }
}

/**
 * Clear activity for a sandbox (e.g., when sandbox stops)
 */
export function clearSessionActivity(sandboxId: string): void {
  if (activityMap.has(sandboxId)) {
    activityMap.delete(sandboxId);
    notifySubscribers();
  }
}

/**
 * Clear all activity (e.g., on logout)
 */
export function clearAllSessionActivity(): void {
  if (activityMap.size > 0) {
    activityMap.clear();
    notifySubscribers();
  }
}

// Legacy export for backwards compatibility
export const sessionActivity = {
  isBusy: isSandboxBusy,
  getBusySandboxIds,
  get: getSessionActivity,
};
