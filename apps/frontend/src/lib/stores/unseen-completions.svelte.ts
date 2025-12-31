/**
 * Unseen Completions Store
 * 
 * Tracks which projects have had AI sessions complete while the user
 * wasn't viewing them. Shows a visual indicator until the user visits
 * the project page.
 */

// Set of sandbox IDs that have unseen completions
let unseenCompletions = $state<Set<string>>(new Set());

// Subscribers for change notifications
type Subscriber = () => void;
const subscribers = new Set<Subscriber>();

/**
 * Subscribe to changes in unseen completions
 */
export function subscribeToUnseenChanges(callback: Subscriber): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * Notify all subscribers
 */
function notifySubscribers(): void {
  for (const callback of subscribers) {
    try {
      callback();
    } catch (e) {
      console.error("[UnseenCompletions] Subscriber error:", e);
    }
  }
}

/**
 * Mark a project as having an unseen completion
 */
export function markAsUnseen(sandboxId: string): void {
  if (!unseenCompletions.has(sandboxId)) {
    unseenCompletions = new Set([...unseenCompletions, sandboxId]);
    console.log("[UnseenCompletions] Marked as unseen:", sandboxId);
    notifySubscribers();
  }
}

/**
 * Mark a project as seen (clear the indicator)
 */
export function markAsSeen(sandboxId: string): void {
  if (unseenCompletions.has(sandboxId)) {
    const newSet = new Set(unseenCompletions);
    newSet.delete(sandboxId);
    unseenCompletions = newSet;
    console.log("[UnseenCompletions] Marked as seen:", sandboxId);
    notifySubscribers();
  }
}

/**
 * Check if a project has an unseen completion
 */
export function hasUnseenCompletion(sandboxId: string): boolean {
  return unseenCompletions.has(sandboxId);
}

/**
 * Get all sandbox IDs with unseen completions
 */
export function getUnseenCompletionIds(): string[] {
  return Array.from(unseenCompletions);
}

/**
 * Clear all unseen completions
 */
export function clearAllUnseen(): void {
  if (unseenCompletions.size > 0) {
    unseenCompletions = new Set();
    notifySubscribers();
  }
}

/**
 * Get the count of unseen completions
 */
export function getUnseenCount(): number {
  return unseenCompletions.size;
}
