/**
 * Container Orchestrator Interface
 * Abstract interface for container orchestration
 */

import type {
  Sandbox,
  SandboxConfig,
  SandboxStatus,
  SandboxStats,
  ExecResult,
  ExecOptions,
  ImageInfo,
  ImagePullProgress,
  NetworkInfo,
  ContainerEvent,
  SandboxFilter,
  LogOptions,
  DockerInfo,
  EventFilter,
} from "./types";

/**
 * Container Orchestrator Interface
 *
 * Provides an abstraction layer for container orchestration.
 * The primary implementation is DockerOrchestrator, but this interface
 * allows for future alternative implementations (e.g., Podman, K8s).
 */
export interface ContainerOrchestrator {
  // ===========================================================================
  // Lifecycle Management
  // ===========================================================================

  /**
   * Create a new sandbox container
   * @param config - Sandbox configuration
   * @returns The created sandbox
   */
  createSandbox(config: SandboxConfig): Promise<Sandbox>;

  /**
   * Start a stopped sandbox
   * @param id - Sandbox ID
   */
  startSandbox(id: string): Promise<void>;

  /**
   * Stop a running sandbox
   * @param id - Sandbox ID
   * @param timeout - Timeout in seconds before force kill (default: 10)
   */
  stopSandbox(id: string, timeout?: number): Promise<void>;

  /**
   * Restart a sandbox
   * @param id - Sandbox ID
   * @param timeout - Timeout in seconds before force kill (default: 10)
   */
  restartSandbox(id: string, timeout?: number): Promise<void>;

  /**
   * Delete a sandbox and optionally its volumes
   * @param id - Sandbox ID
   * @param removeVolumes - Whether to remove associated volumes (default: false)
   */
  deleteSandbox(id: string, removeVolumes?: boolean): Promise<void>;

  /**
   * Pause a running sandbox
   * @param id - Sandbox ID
   */
  pauseSandbox?(id: string): Promise<void>;

  /**
   * Unpause a paused sandbox
   * @param id - Sandbox ID
   */
  unpauseSandbox?(id: string): Promise<void>;

  // ===========================================================================
  // Status & Information
  // ===========================================================================

  /**
   * Get the status of a sandbox
   * @param id - Sandbox ID
   * @returns Current sandbox status
   */
  getSandboxStatus(id: string): Promise<SandboxStatus>;

  /**
   * Get detailed information about a sandbox
   * @param id - Sandbox ID
   * @returns Sandbox details or null if not found
   */
  getSandbox(id: string): Promise<Sandbox | null>;

  /**
   * List all sandboxes managed by AgentPod
   * @param filter - Optional filter criteria
   * @returns List of sandboxes
   */
  listSandboxes(filter?: SandboxFilter): Promise<Sandbox[]>;

  /**
   * Get resource usage statistics for a sandbox
   * @param id - Sandbox ID
   * @returns Resource usage stats
   */
  getSandboxStats(id: string): Promise<SandboxStats>;

  /**
   * Check if a sandbox exists
   * @param id - Sandbox ID
   * @returns True if the sandbox exists
   */
  sandboxExists(id: string): Promise<boolean>;

  // ===========================================================================
  // Logs
  // ===========================================================================

  /**
   * Get logs from a sandbox
   * @param id - Sandbox ID
   * @param options - Log retrieval options
   * @returns Log output
   */
  getLogs(id: string, options?: LogOptions): Promise<string>;

  /**
   * Stream logs from a sandbox
   * @param id - Sandbox ID
   * @param options - Log streaming options
   * @returns Async iterator of log lines
   */
  streamLogs(id: string, options?: LogOptions): AsyncIterable<string>;

  // ===========================================================================
  // Command Execution
  // ===========================================================================

  /**
   * Execute a command in a sandbox
   * @param id - Sandbox ID
   * @param command - Command and arguments
   * @param options - Execution options
   * @returns Execution result
   */
  exec(id: string, command: string[], options?: ExecOptions): Promise<ExecResult>;

  // ===========================================================================
  // Image Management
  // ===========================================================================

  /**
   * Pull an image from a registry
   * @param imageName - Full image name with tag
   * @param onProgress - Optional progress callback
   */
  pullImage(
    imageName: string,
    onProgress?: (progress: ImagePullProgress) => void
  ): Promise<void>;

  /**
   * Check if an image exists locally
   * @param imageName - Full image name with tag
   * @returns True if the image exists
   */
  imageExists(imageName: string): Promise<boolean>;

  /**
   * Get information about an image
   * @param imageName - Full image name with tag
   * @returns Image information or null if not found
   */
  getImage(imageName: string): Promise<ImageInfo | null>;

  /**
   * List locally available images
   * @param filter - Optional name filter
   * @returns List of images
   */
  listImages(filter?: string): Promise<ImageInfo[]>;

  /**
   * Remove a local image
   * @param imageName - Full image name with tag
   * @param force - Force removal even if in use
   */
  removeImage?(imageName: string, force?: boolean): Promise<void>;

  // ===========================================================================
  // Network Management
  // ===========================================================================

  /**
   * Ensure the AgentPod network exists
   * @param networkName - Network name (default: "agentpod-net")
   * @returns Network ID
   */
  ensureNetwork(networkName?: string): Promise<string>;

  /**
   * Get information about a network
   * @param networkName - Network name
   * @returns Network information or null if not found
   */
  getNetwork(networkName: string): Promise<NetworkInfo | null>;

  // ===========================================================================
  // Health & Events
  // ===========================================================================

  /**
   * Check if the Docker daemon is accessible
   * @returns True if healthy
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get Docker daemon information
   */
  getInfo(): Promise<DockerInfo>;

  /**
   * Subscribe to container events
   * @param filter - Optional event filter
   * @returns Async iterator of events
   */
  watchEvents?(filter?: EventFilter): AsyncIterable<ContainerEvent>;
}

// =============================================================================
// Factory & Export
// =============================================================================

// Export all types from types.ts
export * from "./types.ts";

// Export traefik utilities
export * from "./traefik.ts";

// Export DockerOrchestrator implementation
export { DockerOrchestrator } from "./docker.ts";
export type { DockerOrchestratorConfig } from "./docker.ts";
