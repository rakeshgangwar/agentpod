/**
 * Sandbox Provider Interface
 *
 * Defines the contract for sandbox providers (Docker, Cloudflare, etc.)
 * This abstraction allows AgentPod to support multiple sandbox backends
 * with a unified API.
 */

// =============================================================================
// Provider Types
// =============================================================================

export type SandboxProviderType = "docker" | "cloudflare";

// =============================================================================
// Sandbox Configuration
// =============================================================================

/**
 * Options for creating a new sandbox
 */
export interface SandboxProviderOptions {
  /** Unique identifier for the sandbox */
  id: string;

  /** User ID (owner) */
  userId: string;

  /** Human-readable name for the sandbox */
  name?: string;

  /** OpenCode configuration (providers, settings) */
  config?: OpenCodeConfig;

  /** Working directory inside sandbox */
  directory?: string;

  /** Optional: Git repository to clone */
  gitUrl?: string;

  /** Optional: Branch to checkout */
  gitBranch?: string;

  /** Resource tier (for Docker: starter, builder, creator, power) */
  resourceTier?: string;

  /** Container flavor (for Docker: js, python, go, rust, fullstack, polyglot) */
  flavor?: string;
}

/**
 * OpenCode configuration format
 * Based on @opencode-ai/sdk Config type
 */
export interface OpenCodeConfig {
  /** Provider configurations with API keys */
  provider?: Record<string, {
    options?: {
      apiKey?: string;
      baseUrl?: string;
    };
  }>;

  /** Model preferences */
  model?: {
    default?: {
      providerID?: string;
      modelID?: string;
    };
  };

  /** Additional settings */
  [key: string]: unknown;
}

// =============================================================================
// Sandbox State
// =============================================================================

/**
 * Possible states for a sandbox
 * Unified across all providers
 */
export type SandboxProviderStatus =
  | "creating"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "sleeping"  // Cloudflare-specific: hibernated state
  | "error";

/**
 * Sandbox information returned by providers
 */
export interface SandboxInfo {
  /** Unique sandbox ID */
  id: string;

  /** Current status */
  status: SandboxProviderStatus;

  /** Provider type */
  provider: SandboxProviderType;

  /** URL to access OpenCode server (internal) */
  opencodeUrl?: string;

  /** When sandbox was last active */
  lastActiveAt?: Date;

  /** When sandbox was created */
  createdAt?: Date;

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// OpenCode Client Types
// =============================================================================

/**
 * Simplified OpenCode client interface
 * Based on @opencode-ai/sdk client
 */
export interface OpenCodeClientSession {
  /** Create a new session */
  create(options: { body: { title?: string } }): Promise<{
    data?: { id: string; title?: string };
  }>;

  /** Send a prompt to a session */
  prompt(options: {
    path: { id: string };
    body: {
      parts: Array<{ type: "text"; text: string }>;
      model?: { providerID: string; modelID: string };
    };
  }): Promise<{
    data?: {
      parts?: Array<{ type: string; text?: string }>;
    };
  }>;

  /** List sessions */
  list(): Promise<{
    data?: Array<{ id: string; title?: string; createdAt?: string }>;
  }>;

  /** Get session by ID */
  get(options: { path: { id: string } }): Promise<{
    data?: { id: string; title?: string; messages?: unknown[] };
  }>;

  /** Abort current operation */
  abort(options: { path: { id: string } }): Promise<void>;
}

/**
 * OpenCode SDK client interface
 */
export interface OpenCodeClient {
  session: OpenCodeClientSession;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * SandboxProvider Interface
 *
 * All sandbox providers must implement this interface.
 * This enables provider-agnostic operations in the SandboxManager.
 */
export interface SandboxProvider {
  /** Provider type identifier */
  readonly type: SandboxProviderType;

  /**
   * Create a new sandbox
   * @param options - Sandbox creation options
   * @returns Created sandbox info
   */
  createSandbox(options: SandboxProviderOptions): Promise<SandboxInfo>;

  /**
   * Start/wake a sandbox
   * @param id - Sandbox ID
   */
  startSandbox(id: string): Promise<void>;

  /**
   * Stop/hibernate a sandbox
   * @param id - Sandbox ID
   */
  stopSandbox(id: string): Promise<void>;

  /**
   * Delete a sandbox and its resources
   * @param id - Sandbox ID
   */
  deleteSandbox(id: string): Promise<void>;

  /**
   * Get sandbox information
   * @param id - Sandbox ID
   * @returns Sandbox info or null if not found
   */
  getSandbox(id: string): Promise<SandboxInfo | null>;

  /**
   * List sandboxes for a user
   * @param userId - User ID
   * @returns Array of sandbox info
   */
  listSandboxes(userId: string): Promise<SandboxInfo[]>;

  /**
   * Get OpenCode SDK client for a sandbox
   * @param id - Sandbox ID
   * @returns OpenCode client instance
   */
  getOpenCodeClient(id: string): Promise<OpenCodeClient>;

  /**
   * Proxy a request to OpenCode (for web UI)
   * @param id - Sandbox ID
   * @param request - HTTP request to proxy
   * @returns Proxied response
   */
  proxyRequest(id: string, request: Request): Promise<Response>;

  /**
   * Health check for a sandbox
   * @param id - Sandbox ID
   * @returns true if sandbox is healthy
   */
  healthCheck(id: string): Promise<boolean>;
}

// =============================================================================
// Provider Factory Types
// =============================================================================

/**
 * Options for provider selection
 */
export interface ProviderSelectionOptions {
  /** Explicitly request a specific provider */
  provider?: SandboxProviderType;

  /** Use case hint for auto-selection */
  useCase?: "development" | "quick-task" | "batch" | "multi-agent";

  /** Prefer cost efficiency over features */
  preferCostEfficient?: boolean;
}

/**
 * Provider factory configuration
 */
export interface ProviderFactoryConfig {
  /** Default provider when not specified */
  defaultProvider: SandboxProviderType;

  /** Enable auto-selection based on use case */
  autoSelect: boolean;

  /** Cloudflare configuration (required if cloudflare is used) */
  cloudflare?: {
    workerUrl: string;
    apiToken: string;
  };
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Sandbox lifecycle events
 * Used for webhooks and internal notifications
 */
export type SandboxEventType =
  | "sandbox.created"
  | "sandbox.started"
  | "sandbox.stopped"
  | "sandbox.hibernated"
  | "sandbox.woken"
  | "sandbox.deleted"
  | "sandbox.error"
  | "session.created"
  | "session.message"
  | "workspace.synced";

/**
 * Sandbox event payload
 */
export interface SandboxEvent {
  /** Event type */
  type: SandboxEventType;

  /** Sandbox ID */
  sandboxId: string;

  /** User ID (owner) */
  userId: string;

  /** Provider type */
  provider: SandboxProviderType;

  /** Event timestamp */
  timestamp: Date;

  /** Additional event data */
  data?: Record<string, unknown>;
}

// =============================================================================
// Agent Task Types
// =============================================================================

/**
 * Status for agent tasks
 */
export type AgentTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Agent task definition
 * Used for dynamic Cloudflare sandbox tasks
 */
export interface AgentTask {
  /** Unique task ID */
  id: string;

  /** User ID (owner) */
  userId: string;

  /** Sandbox ID */
  sandboxId: string;

  /** Provider used */
  provider: SandboxProviderType;

  /** Task status */
  status: AgentTaskStatus;

  /** Input message */
  message: string;

  /** Response (when completed) */
  response?: string;

  /** Git repository URL (if task involves a repo) */
  gitUrl?: string;

  /** Model provider ID */
  modelProvider?: string;

  /** Model ID */
  modelId?: string;

  /** OpenCode session ID */
  sessionId?: string;

  /** When task was created */
  createdAt: Date;

  /** When task completed */
  completedAt?: Date;

  /** Error message (if failed) */
  error?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Multi-Agent Team Types
// =============================================================================

/**
 * Agent definition in a team
 */
export interface TeamAgent {
  /** Agent role/name */
  role: string;

  /** Input message for this agent */
  message: string;

  /** Optional model override */
  model?: {
    providerID: string;
    modelID: string;
  };
}

/**
 * Team task result for a single agent
 */
export interface TeamAgentResult {
  /** Agent role */
  role: string;

  /** Sandbox ID used */
  sandboxId: string;

  /** Session ID */
  sessionId: string;

  /** Response from the agent */
  response: unknown;
}

/**
 * Multi-agent team task
 */
export interface TeamTask {
  /** Team task ID */
  teamId: string;

  /** User ID (owner) */
  userId: string;

  /** Agent definitions */
  agents: TeamAgent[];

  /** Results per agent */
  results: TeamAgentResult[];

  /** Overall status */
  status: AgentTaskStatus;

  /** Git repository URL (shared across agents) */
  gitUrl?: string;

  /** When team task was created */
  createdAt: Date;

  /** When team task completed */
  completedAt?: Date;
}
