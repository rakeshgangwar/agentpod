/**
 * Sandboxes Store (v2 API)
 * 
 * Manages the sandboxes state using Svelte 5 runes.
 * Uses the new direct Docker orchestration API instead of Coolify.
 */

import * as api from "$lib/api/tauri";
import type { 
  Sandbox, 
  SandboxInfo,
  SandboxWithRepo,
  SandboxStatus,
  CreateSandboxInput, 
  Repository,
  SandboxStats,
  ExecResult,
  GitStatusResponse,
  GitLogResponse,
  GitCommitResponse,
  DockerHealthResponse,
} from "$lib/api/tauri";

// =============================================================================
// State
// =============================================================================

let sandboxesList = $state<Sandbox[]>([]);
let selectedSandbox = $state<SandboxInfo | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);
let dockerHealthy = $state<boolean | null>(null);

// =============================================================================
// Derived State
// =============================================================================

export const sandboxes = {
  get list() { return sandboxesList; },
  get selected() { return selectedSandbox; },
  get isLoading() { return isLoading; },
  get error() { return error; },
  get count() { return sandboxesList.length; },
  get dockerHealthy() { return dockerHealthy; },
  
  // Derived getters - use API status values: created, starting, running, stopping, stopped, error
  get running() { return sandboxesList.filter(s => s.status === "running"); },
  get stopped() { return sandboxesList.filter(s => s.status === "stopped"); },
  get starting() { return sandboxesList.filter(s => s.status === "starting"); },
  get stopping() { return sandboxesList.filter(s => s.status === "stopping"); },
};

// =============================================================================
// Docker Health
// =============================================================================

/**
 * Check Docker daemon health
 */
export async function checkDockerHealth(): Promise<DockerHealthResponse | null> {
  try {
    const health = await api.dockerHealth();
    dockerHealthy = health.status === "healthy";
    return health;
  } catch (e) {
    dockerHealthy = false;
    console.error("Docker health check failed:", e);
    return null;
  }
}

// =============================================================================
// Sandbox CRUD
// =============================================================================

/**
 * Fetch all sandboxes from the API
 */
export async function fetchSandboxes(): Promise<void> {
  isLoading = true;
  error = null;
  try {
    sandboxesList = await api.listSandboxes();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch sandboxes";
    sandboxesList = [];
  } finally {
    isLoading = false;
  }
}

/**
 * Fetch a single sandbox by ID
 */
export async function fetchSandbox(id: string): Promise<SandboxInfo | null> {
  isLoading = true;
  error = null;
  try {
    const info = await api.getSandbox(id);
    selectedSandbox = info;
    
    // Update in list if present
    const index = sandboxesList.findIndex(s => s.id === id);
    if (index !== -1) {
      sandboxesList[index] = info.sandbox;
    }
    
    return info;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch sandbox";
    return null;
  } finally {
    isLoading = false;
  }
}

/**
 * Create a new sandbox
 */
export async function createSandbox(input: CreateSandboxInput): Promise<SandboxWithRepo | null> {
  isLoading = true;
  error = null;
  try {
    const result = await api.createSandbox(input);
    sandboxesList = [result.sandbox, ...sandboxesList];
    selectedSandbox = {
      sandbox: result.sandbox,
      repository: result.repository,
    };
    return result;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to create sandbox";
    return null;
  } finally {
    isLoading = false;
  }
}

/**
 * Delete a sandbox
 */
export async function deleteSandbox(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  try {
    await api.deleteSandbox(id);
    sandboxesList = sandboxesList.filter(s => s.id !== id);
    if (selectedSandbox?.sandbox.id === id) {
      selectedSandbox = null;
    }
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete sandbox";
    return false;
  } finally {
    isLoading = false;
  }
}

// =============================================================================
// Sandbox Lifecycle
// =============================================================================

/**
 * Start a sandbox
 */
export async function startSandbox(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  
  // Optimistic UI update - show "starting" state immediately
  setOptimisticStatus(id, "starting");
  
  try {
    const sandbox = await api.startSandbox(id);
    updateSandboxInList(sandbox);
    return true;
  } catch (e) {
    // Revert to stopped state on error
    setOptimisticStatus(id, "stopped");
    error = e instanceof Error ? e.message : "Failed to start sandbox";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Stop a sandbox
 */
export async function stopSandbox(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  
  // Optimistic UI update - show "stopping" state immediately
  setOptimisticStatus(id, "stopping");
  
  try {
    const sandbox = await api.stopSandbox(id);
    updateSandboxInList(sandbox);
    return true;
  } catch (e) {
    // Revert to running state on error
    setOptimisticStatus(id, "running");
    error = e instanceof Error ? e.message : "Failed to stop sandbox";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Restart a sandbox
 */
export async function restartSandbox(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  
  // Optimistic UI update - show "starting" state (restart = stop + start)
  setOptimisticStatus(id, "starting");
  
  try {
    const sandbox = await api.restartSandbox(id);
    updateSandboxInList(sandbox);
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to restart sandbox";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Pause a sandbox
 */
export async function pauseSandbox(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  try {
    const sandbox = await api.pauseSandbox(id);
    updateSandboxInList(sandbox);
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to pause sandbox";
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Unpause a sandbox
 */
export async function unpauseSandbox(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  try {
    const sandbox = await api.unpauseSandbox(id);
    updateSandboxInList(sandbox);
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to unpause sandbox";
    return false;
  } finally {
    isLoading = false;
  }
}

// =============================================================================
// Sandbox Monitoring
// =============================================================================

/**
 * Get sandbox logs
 */
export async function getSandboxLogs(id: string, tail?: number): Promise<string | null> {
  try {
    return await api.getSandboxLogs(id, tail);
  } catch (e) {
    console.error("Failed to get sandbox logs:", e);
    return null;
  }
}

/**
 * Get sandbox resource stats
 */
export async function getSandboxStats(id: string): Promise<SandboxStats | null> {
  try {
    return await api.getSandboxStats(id);
  } catch (e) {
    console.error("Failed to get sandbox stats:", e);
    return null;
  }
}

/**
 * Get sandbox status
 */
export async function getSandboxStatus(id: string): Promise<string | null> {
  try {
    return await api.getSandboxStatus(id);
  } catch (e) {
    console.error("Failed to get sandbox status:", e);
    return null;
  }
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute a command in a sandbox
 */
export async function execInSandbox(
  id: string, 
  command: string[], 
  workingDir?: string
): Promise<ExecResult | null> {
  try {
    return await api.execInSandbox(id, command, workingDir);
  } catch (e) {
    console.error("Failed to execute command:", e);
    return null;
  }
}

// =============================================================================
// Git Operations
// =============================================================================

/**
 * Get git status for a sandbox
 */
export async function getGitStatus(id: string): Promise<GitStatusResponse | null> {
  try {
    return await api.getSandboxGitStatus(id);
  } catch (e) {
    console.error("Failed to get git status:", e);
    return null;
  }
}

/**
 * Get git log for a sandbox
 */
export async function getGitLog(id: string): Promise<GitLogResponse | null> {
  try {
    return await api.getSandboxGitLog(id);
  } catch (e) {
    console.error("Failed to get git log:", e);
    return null;
  }
}

/**
 * Commit changes in a sandbox
 */
export async function commitChanges(id: string, message: string): Promise<GitCommitResponse | null> {
  try {
    return await api.commitSandboxChanges(id, message);
  } catch (e) {
    console.error("Failed to commit changes:", e);
    return null;
  }
}

// =============================================================================
// Selection & Helpers
// =============================================================================

/**
 * Select a sandbox
 */
export function selectSandbox(sandbox: SandboxInfo | null): void {
  selectedSandbox = sandbox;
}

/**
 * Get a sandbox by ID from the current list (synchronous)
 */
export function getSandbox(id: string): Sandbox | undefined {
  return sandboxesList.find(s => s.id === id);
}

/**
 * Clear error
 */
export function clearError(): void {
  error = null;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Set optimistic status for a sandbox (for immediate UI feedback)
 */
function setOptimisticStatus(id: string, status: SandboxStatus): void {
  const index = sandboxesList.findIndex(s => s.id === id);
  if (index !== -1) {
    sandboxesList[index] = { ...sandboxesList[index], status };
  }
  if (selectedSandbox?.sandbox.id === id) {
    selectedSandbox = {
      ...selectedSandbox,
      sandbox: { ...selectedSandbox.sandbox, status },
    };
  }
}

function updateSandboxInList(sandbox: Sandbox): void {
  const index = sandboxesList.findIndex(s => s.id === sandbox.id);
  if (index !== -1) {
    sandboxesList[index] = sandbox;
  }
  if (selectedSandbox?.sandbox.id === sandbox.id) {
    selectedSandbox = {
      ...selectedSandbox,
      sandbox,
    };
  }
}
