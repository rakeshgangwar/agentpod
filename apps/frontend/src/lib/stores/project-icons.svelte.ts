/**
 * Project Icons Store
 * 
 * Persists project icon selections in localStorage so they remain
 * consistent across page navigations and sessions.
 */

import { getProjectIcon, getSuggestedIcon } from "$lib/utils/project-icons";

// =============================================================================
// Types
// =============================================================================

interface ProjectIconsState {
  /** Map of project ID to icon ID */
  icons: Record<string, string>;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = "agentpod_project_icons";

// =============================================================================
// State
// =============================================================================

let state = $state<ProjectIconsState>({
  icons: {},
});

// =============================================================================
// Persistence
// =============================================================================

/**
 * Load icons from localStorage
 */
function loadFromStorage(): void {
  if (typeof window === "undefined") return;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        state.icons = parsed;
      }
    }
  } catch (e) {
    console.error("[project-icons] Failed to load from localStorage:", e);
  }
}

/**
 * Save icons to localStorage
 */
function saveToStorage(): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.icons));
  } catch (e) {
    console.error("[project-icons] Failed to save to localStorage:", e);
  }
}

// Initialize from localStorage on module load
if (typeof window !== "undefined") {
  loadFromStorage();
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get the icon ID for a project
 * Returns stored icon, or suggests one based on project name
 */
export function getProjectIconId(projectId: string, projectName?: string): string {
  // Check if we have a stored icon for this project
  const storedIconId = state.icons[projectId];
  if (storedIconId) {
    // Verify the icon still exists
    const icon = getProjectIcon(storedIconId);
    if (icon) return storedIconId;
  }
  
  // Fall back to suggesting based on name (deterministic)
  if (projectName) {
    return getSuggestedIcon(projectName).id;
  }
  
  // Default
  return "code";
}

/**
 * Set the icon for a project
 */
export function setProjectIcon(projectId: string, iconId: string): void {
  state.icons[projectId] = iconId;
  saveToStorage();
}

/**
 * Remove the icon for a project (e.g., when project is deleted)
 */
export function removeProjectIcon(projectId: string): void {
  delete state.icons[projectId];
  saveToStorage();
}

/**
 * Check if a project has a custom icon set
 */
export function hasCustomIcon(projectId: string): boolean {
  return projectId in state.icons;
}

/**
 * Export the store for reactive access
 */
export const projectIcons = {
  get icons() {
    return state.icons;
  },
  getIconId: getProjectIconId,
  setIcon: setProjectIcon,
  removeIcon: removeProjectIcon,
  hasCustomIcon,
};
