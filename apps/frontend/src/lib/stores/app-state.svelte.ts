/**
 * App State Store
 * 
 * Tracks global application state like dashboard readiness.
 * This allows the layout to show a loading state until essential data is loaded.
 */

// =============================================================================
// State
// =============================================================================

let dashboardReady = $state(false);

// =============================================================================
// Exported Store
// =============================================================================

export const appState = {
  /**
   * Whether the dashboard has loaded its essential data.
   * Used by the layout to determine when to show the main content.
   */
  get isDashboardReady() {
    return dashboardReady;
  },
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Mark the dashboard as ready (essential data has been loaded)
 */
export function setDashboardReady(ready: boolean = true): void {
  dashboardReady = ready;
}

/**
 * Reset the dashboard ready state (e.g., on logout)
 */
export function resetDashboardReady(): void {
  dashboardReady = false;
}
