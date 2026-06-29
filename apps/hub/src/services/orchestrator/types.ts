/**
 * Container Orchestrator Types
 * Shared types for the container orchestration layer
 */

// ============================================================================
// Sandbox Configuration
// ============================================================================

/**
 * Configuration for creating a new sandbox container
 */
export interface SandboxConfig {
  /** Unique identifier for the sandbox (used in container name) */
  id: string;

  /** Human-readable name for the sandbox */
  name: string;

  /** Docker image to use (e.g., "agentpod/fullstack:0.4.0") */
  image: string;

  /** Environment variables to set in the container */
  env: Record<string, string>;

  /** Volume mounts */
  volumes: VolumeMount[];

  /** Port mappings (container ports to expose) */
  ports: PortMapping[];

  /** Labels to apply to the container (including Traefik labels) */
  labels: Record<string, string>;

  /** Resource limits for the container */
  resources: ResourceLimits;

  /** Docker network to attach to */
  network?: string;

  /** User ID to run the container as */
  userId?: string;

  /** Working directory inside the container */
  workingDir?: string;

  /** Command to run on startup (overrides image CMD) */
  command?: string[];
}

/**
 * Volume mount configuration
 */
export interface VolumeMount {
  /** Host path or volume name */
  host: string;

  /** Path inside the container */
  container: string;

  /** Mount mode: 'rw' (read-write) or 'ro' (read-only) */
  mode: "rw" | "ro";

  /** Whether this is a named volume (vs bind mount) */
  type?: "bind" | "volume";
}

/**
 * Port mapping configuration
 */
export interface PortMapping {
  /** Port number inside the container */
  container: number;

  /** Port number on the host (optional, for direct access) */
  host?: number;

  /** Protocol (default: tcp) */
  protocol?: "tcp" | "udp";

  /** Human-readable label for this port */
  label?: string;

  /** Whether this port should be publicly accessible via Traefik */
  public?: boolean;
}

/**
 * Resource limits for containers
 */
export interface ResourceLimits {
  /** CPU limit (e.g., "1.0" for 1 CPU, "0.5" for half) */
  cpus?: string;

  /** Memory limit (e.g., "2g", "512m") */
  memory?: string;

  /** Memory swap limit */
  memorySwap?: string;

  /** PIDs limit */
  pidsLimit?: number;

  /** Disk quota in bytes (not directly supported by Docker, implemented via volume) */
  diskQuota?: number;
}

// ============================================================================
// Sandbox State
// ============================================================================

/**
 * Possible states for a sandbox container
 */
export type SandboxStatus =
  | "creating"
  | "running"
  | "stopped"
  | "paused"
  | "restarting"
  | "removing"
  | "exited"
  | "dead"
  | "error"
  | "unknown";

/**
 * Represents a sandbox container
 */
export interface Sandbox {
  /** AgentPod sandbox ID */
  id: string;

  /** Docker container ID */
  containerId: string;

  /** Human-readable name */
  name: string;

  /** Current status */
  status: SandboxStatus;

  /** Public URLs for accessing the sandbox */
  urls: SandboxUrls;

  /** When the sandbox was created */
  createdAt: Date;

  /** When the sandbox was last started */
  startedAt?: Date;

  /** Image the sandbox is running */
  image: string;

  /** Container labels (metadata) */
  labels?: Record<string, string>;

  /** Health check status */
  health?: HealthStatus;

  /** Resource usage stats (if available) */
  stats?: SandboxStats;
}

/**
 * URLs for accessing different sandbox services
 */
export interface SandboxUrls {
  /** Main OpenCode server URL */
  opencode?: string;

  /** Code Server (VS Code in browser) URL */
  codeServer?: string;

  /** VNC (desktop GUI) URL */
  vnc?: string;

  /** Homepage URL */
  homepage?: string;

  /** Custom service URLs */
  [service: string]: string | undefined;
}

/**
 * Health check status
 */
export interface HealthStatus {
  status: "healthy" | "unhealthy" | "starting" | "none";
  failingStreak: number;
  lastCheck?: Date;
}

/**
 * Container resource usage statistics
 */
export interface SandboxStats {
  /** CPU usage percentage */
  cpuPercent: number;

  /** Memory usage in bytes */
  memoryUsage: number;

  /** Memory limit in bytes */
  memoryLimit: number;

  /** Memory usage percentage */
  memoryPercent: number;

  /** Network I/O */
  networkRx: number;
  networkTx: number;

  /** Block I/O */
  blockRead: number;
  blockWrite: number;
}

// ============================================================================
// Execution
// ============================================================================

/**
 * Result of executing a command in a container
 */
export interface ExecResult {
  /** Exit code of the command */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;
}

/**
 * Options for executing a command
 */
export interface ExecOptions {
  /** Working directory for the command */
  workingDir?: string;

  /** Environment variables for the command */
  env?: Record<string, string>;

  /** User to run the command as */
  user?: string;

  /** Attach to stdin */
  stdin?: boolean;

  /** Attach to stdout */
  stdout?: boolean;

  /** Attach to stderr */
  stderr?: boolean;

  /** Allocate a TTY */
  tty?: boolean;

  /** Privileged mode */
  privileged?: boolean;
}

/**
 * Options for interactive terminal execution
 */
export interface InteractiveExecOptions {
  /** Shell to use (defaults to /bin/bash, falls back to /bin/sh) */
  shell?: string;

  /** Initial terminal columns */
  cols?: number;

  /** Initial terminal rows */
  rows?: number;

  /** Working directory */
  workingDir?: string;

  /** User to run as */
  user?: string;

  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Result of an interactive exec session
 */
export interface InteractiveExecSession {
  /** Bidirectional stream for stdin/stdout */
  stream: NodeJS.ReadWriteStream;

  /** Exec instance for resize operations */
  execId: string;

  /** Resize the terminal */
  resize: (cols: number, rows: number) => Promise<void>;

  /** Close the session */
  close: () => void;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Container event types
 */
export type ContainerEventType =
  | "create"
  | "start"
  | "stop"
  | "restart"
  | "pause"
  | "unpause"
  | "kill"
  | "die"
  | "destroy"
  | "health_status";

/**
 * Container event
 */
export interface ContainerEvent {
  type: ContainerEventType;
  containerId: string;
  sandboxId?: string;
  timestamp: Date;
  attributes?: Record<string, string>;
}

// ============================================================================
// Image Management
// ============================================================================

/**
 * Docker image information
 */
export interface ImageInfo {
  /** Full image name with tag */
  name: string;

  /** Image ID */
  id: string;

  /** Image size in bytes */
  size: number;

  /** When the image was created */
  created: Date;

  /** Image labels */
  labels?: Record<string, string>;
}

/**
 * Image pull progress
 */
export interface ImagePullProgress {
  status: string;
  progress?: string;
  id?: string;
}

// ============================================================================
// Network
// ============================================================================

/**
 * Docker network information
 */
export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  containers: string[];
}

// ============================================================================
// Resource Tiers
// ============================================================================

/**
 * Default resource tier configuration
 */
const DEFAULT_TIER: ResourceLimits = {
  cpus: "1.0",
  memory: "2g",
  pidsLimit: 256,
};

/**
 * Predefined resource tier configurations
 */
export const RESOURCE_TIERS: { [key: string]: ResourceLimits } = {
  starter: {
    cpus: "0.5",
    memory: "512m",
    pidsLimit: 100,
  },
  builder: DEFAULT_TIER,
  creator: {
    cpus: "2.0",
    memory: "4g",
    pidsLimit: 512,
  },
  power: {
    cpus: "4.0",
    memory: "8g",
    pidsLimit: 1024,
  },
};

/**
 * Get resource limits for a tier
 */
export function getResourceTier(tier: string): ResourceLimits {
  const found = RESOURCE_TIERS[tier];
  if (found) {
    return found;
  }
  return DEFAULT_TIER;
}

// ============================================================================
// Filter & Options Types
// ============================================================================

/**
 * Filter criteria for listing sandboxes
 */
export interface SandboxFilter {
  /** Filter by status */
  status?: SandboxStatus | SandboxStatus[];
  /** Filter by label key-value pairs */
  labels?: Record<string, string>;
  /** Filter by name pattern (glob-style) */
  name?: string;
  /** Include only sandboxes created after this date */
  createdAfter?: Date;
  /** Include only sandboxes created before this date */
  createdBefore?: Date;
}

/**
 * Options for log retrieval
 */
export interface LogOptions {
  /** Number of lines to retrieve (from the end) */
  tail?: number;
  /** Retrieve logs since this timestamp */
  since?: Date | number;
  /** Retrieve logs until this timestamp */
  until?: Date | number;
  /** Include timestamps in log lines */
  timestamps?: boolean;
  /** Follow log output (for streaming) */
  follow?: boolean;
}

/**
 * Docker daemon information
 */
export interface DockerInfo {
  /** Docker version */
  version: string;
  /** API version */
  apiVersion: string;
  /** Operating system */
  os: string;
  /** Architecture */
  arch: string;
  /** Number of CPUs */
  cpus: number;
  /** Total memory in bytes */
  totalMemory: number;
  /** Number of running containers */
  containersRunning: number;
  /** Number of stopped containers */
  containersStopped: number;
  /** Number of images */
  images: number;
}

/**
 * Filter for container events
 */
export interface EventFilter {
  /** Filter by container name or ID */
  container?: string | string[];
  /** Filter by event type */
  type?: string | string[];
  /** Filter by label */
  label?: string | string[];
}
