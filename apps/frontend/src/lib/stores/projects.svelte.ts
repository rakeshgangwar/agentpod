/**
 * Projects Store
 * 
 * Manages the projects state using Svelte 5 runes.
 */

import * as api from "$lib/api/tauri";
import type { Project, CreateProjectInput } from "$lib/api/tauri";

// =============================================================================
// State
// =============================================================================

let projectsList = $state<Project[]>([]);
let selectedProject = $state<Project | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);

// =============================================================================
// Derived State
// =============================================================================

export const projects = {
  get list() { return projectsList; },
  get selected() { return selectedProject; },
  get isLoading() { return isLoading; },
  get error() { return error; },
  get count() { return projectsList.length; },
  
  // Derived getters
  get running() { return projectsList.filter(p => p.status === "running"); },
  get stopped() { return projectsList.filter(p => p.status === "stopped"); },
  get creating() { return projectsList.filter(p => p.status === "creating"); },
  get errored() { return projectsList.filter(p => p.status === "error"); },
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Fetch all projects from the API
 */
export async function fetchProjects(): Promise<void> {
  isLoading = true;
  error = null;
  try {
    projectsList = await api.listProjects();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch projects";
    projectsList = [];
  } finally {
    isLoading = false;
  }
}

/**
 * Fetch a single project by ID
 */
export async function fetchProject(id: string): Promise<Project | null> {
  isLoading = true;
  error = null;
  try {
    const project = await api.getProject(id);
    selectedProject = project;
    
    // Update in list if present
    const index = projectsList.findIndex(p => p.id === id);
    if (index !== -1) {
      projectsList[index] = project;
    }
    
    return project;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch project";
    return null;
  } finally {
    isLoading = false;
  }
}

/**
 * Create a new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project | null> {
  isLoading = true;
  error = null;
  try {
    const project = await api.createProject(input);
    projectsList = [project, ...projectsList];
    selectedProject = project;
    return project;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to create project";
    return null;
  } finally {
    isLoading = false;
  }
}

/**
 * Delete a project
 */
export async function deleteProject(id: string, deleteRepo = true): Promise<boolean> {
  isLoading = true;
  error = null;
  try {
    await api.deleteProject(id, deleteRepo);
    projectsList = projectsList.filter(p => p.id !== id);
    if (selectedProject?.id === id) {
      selectedProject = null;
    }
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete project";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Start a project
 */
export async function startProject(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  try {
    const project = await api.startProject(id);
    updateProjectInList(project);
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to start project";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Stop a project
 */
export async function stopProject(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  try {
    const project = await api.stopProject(id);
    updateProjectInList(project);
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to stop project";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Restart a project
 */
export async function restartProject(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  try {
    const project = await api.restartProject(id);
    updateProjectInList(project);
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to restart project";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Select a project
 */
export function selectProject(project: Project | null): void {
  selectedProject = project;
}

/**
 * Get a project by ID from the current list (synchronous)
 */
export function getProject(id: string): Project | undefined {
  return projectsList.find(p => p.id === id);
}

/**
 * Clear error
 */
export function clearError(): void {
  error = null;
}

// =============================================================================
// Helpers
// =============================================================================

function updateProjectInList(project: Project): void {
  const index = projectsList.findIndex(p => p.id === project.id);
  if (index !== -1) {
    projectsList[index] = project;
  }
  if (selectedProject?.id === project.id) {
    selectedProject = project;
  }
}
