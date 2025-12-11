/**
 * Project-related types shared across frontend, API, and potentially mobile.
 */

/** Status of a project/container */
export type ProjectStatus = "creating" | "running" | "stopped" | "error";

/** Direction for syncing files between local and remote */
export type SyncDirection = "push" | "pull" | "bidirectional";

/** Core project interface */
export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  container_id?: string;
  git_url?: string;
  sync_direction: SyncDirection;
  created_at: string;
  updated_at: string;
  
  // Modular container configuration
  resource_tier_id?: string;
  flavor_id?: string;
  addon_ids?: string[];
  
  // Legacy field (deprecated, use resource_tier_id instead)
  container_tier_id?: string;
}

/** Input for creating a new project */
export interface CreateProjectInput {
  name: string;
  git_url?: string;
  sync_direction?: SyncDirection;
  
  // Modular container configuration (recommended)
  resource_tier_id?: string;
  flavor_id?: string;
  addon_ids?: string[];
  
  // Legacy field (deprecated, use modular fields instead)
  tier_id?: string;
}

/** Input for updating an existing project */
export interface UpdateProjectInput {
  name?: string;
  sync_direction?: SyncDirection;
  
  // Modular container configuration updates
  resource_tier_id?: string;
  flavor_id?: string;
  addon_ids?: string[];
}

/** Deploy response from the API */
export interface DeployResponse {
  success: boolean;
  message?: string;
  project_id?: string;
  container_id?: string;
}
