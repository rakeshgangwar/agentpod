/**
 * AI Assistant (Agent Harness) and Agent Mode types.
 * 
 * Terminology:
 * - AI Assistant (user-facing) = Agent Harness (technical): External ACP-compliant tool
 * - Agent Mode (user-facing) = Internal Agent (technical): Behavior/persona within an assistant
 */

// =============================================================================
// Core Types
// =============================================================================

/** Unique identifier for an AI Assistant */
export type AgentId = string;

/** Status of an AI Assistant process */
export type AgentStatus =
  | "stopped"        // Not running
  | "starting"       // Process spawning
  | "running"        // Active and ready
  | "error"          // Failed to start or crashed
  | "auth_required"; // Needs authentication before use

/** Authentication type required by an assistant */
export type AgentAuthType = "none" | "oauth" | "device_flow" | "api_key" | "pkce_oauth";

/** 
 * Device flow authentication pattern.
 * Different providers use different approaches:
 * - code_first: App shows code, user enters on URL (GitHub Copilot style)
 * - url_first: User visits URL, copies code back to app (Claude Code style)
 * - pkce_oauth: PKCE OAuth flow (Anthropic/Claude Code style)
 */
export type AgentAuthFlowType = "code_first" | "url_first" | "pkce_oauth";

/** 
 * Auth mode for providers that support multiple auth methods
 * - max: Claude Pro/Max subscription (free API access)
 * - console: API Console (creates API key, pay-per-use)
 */
export type AnthropicAuthMode = "max" | "console";

// =============================================================================
// Configuration Types
// =============================================================================

/** Configuration for an AI Assistant */
export interface AgentConfig {
  /** Unique identifier */
  id: AgentId;
  /** Display name */
  name: string;
  /** Description of the assistant's capabilities */
  description: string;
  /** Command to execute (e.g., "opencode", "claude-code-acp") */
  command: string;
  /** Command-line arguments */
  args: string[];
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Type of authentication required */
  authType: AgentAuthType;
  /** Device flow pattern (for device_flow auth type) */
  authFlowType?: AgentAuthFlowType;
  /** Provider name for authentication (e.g., "anthropic", "google", "openai") */
  authProvider?: string;
  /** URL for authentication or API key retrieval */
  authUrl?: string;
  /** Environment variables to set when spawning */
  envVars?: Record<string, string>;
  /** Whether this is a built-in (pre-installed) assistant */
  isBuiltIn: boolean;
  /** Whether this is the default assistant for new sessions */
  isDefault: boolean;
  /** Optional icon URL or emoji */
  icon?: string;
}

/** Runtime instance of an AI Assistant */
export interface AgentInstance {
  /** Unique identifier */
  id: AgentId;
  /** Configuration */
  config: AgentConfig;
  /** Current process status */
  status: AgentStatus;
  /** Whether the user is authenticated with this assistant's provider */
  authenticated: boolean;
  /** When the process was started */
  startedAt: string | null;
  /** Last activity timestamp */
  lastActivity: string | null;
  /** Error message if status is "error" */
  error: string | null;
  /** Number of active sessions */
  sessionCount: number;
}

// =============================================================================
// Agent Mode Types
// =============================================================================

/** Source of an Agent Mode definition */
export type AgentModeSource = "builtin" | "custom";

/** Agent Mode (persona/behavior) definition */
export interface AgentMode {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of this mode's behavior */
  description: string;
  /** Source of the mode definition */
  source: AgentModeSource;
  /** 
   * Which AI Assistant this mode belongs to.
   * Use "all" for modes that work with any assistant.
   */
  assistantId: AgentId | "all";
  /** System prompt/instructions for custom modes */
  systemPrompt?: string;
  /** 
   * For OpenCode: maps to the agent ID from /agent endpoint.
   * This allows mapping to OpenCode's built-in agents.
   */
  opencodeAgentId?: string;
  /** Optional icon */
  icon?: string;
}

// =============================================================================
// Authentication Types
// =============================================================================

/** Status of an authentication flow */
export type AgentAuthStatus = "idle" | "pending" | "completed" | "failed";

/** State of an ongoing authentication flow */
export interface AgentAuthState {
  /** Agent ID this auth is for */
  agentId: AgentId;
  /** Current status */
  status: AgentAuthStatus;
  /** Flow type being used */
  flowType: AgentAuthFlowType | "api_key";
  /** For code_first flow: the code to display to user */
  userCode?: string;
  /** For code_first flow: URL where user enters the code */
  verificationUrl?: string;
  /** For url_first flow: URL to open in browser */
  authUrl?: string;
  /** When this auth flow expires */
  expiresAt?: string;
  /** Error message if status is "failed" */
  error?: string;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/** Response from listing all agents */
export interface AgentListResponse {
  /** All available AI Assistants */
  assistants: AgentInstance[];
  /** ID of the default assistant */
  defaultAssistantId: AgentId;
}

/** Response from listing agent modes */
export interface AgentModesResponse {
  /** Available modes for the agent */
  modes: AgentMode[];
  /** ID of the default mode (if any) */
  defaultModeId?: string;
}

/** Response from initiating authentication */
export interface AgentAuthInitResponse {
  /** Flow type to use */
  flowType: AgentAuthFlowType | "api_key";
  /** For code_first: code to display */
  userCode?: string;
  /** For code_first: URL for verification */
  verificationUrl?: string;
  /** For url_first/pkce_oauth: URL to open */
  authUrl?: string;
  /** Seconds until expiration */
  expiresIn: number;
  /** Human-readable message */
  message: string;
  /** For pkce_oauth: state ID for tracking the flow */
  stateId?: string;
  /** For Anthropic: auth mode (max/console) */
  authMode?: AnthropicAuthMode;
}

/** Request to complete authentication */
export interface AgentAuthCompleteRequest {
  /** For url_first flow: code from browser */
  code?: string;
  /** For api_key flow: the API key */
  token?: string;
}

/** Response after completing authentication */
export interface AgentAuthCompleteResponse {
  /** Whether authentication succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Request to spawn an agent */
export interface AgentSpawnRequest {
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Working directory override */
  workingDirectory?: string;
}

/** Response from spawning an agent */
export interface AgentSpawnResponse {
  /** Agent ID */
  id: AgentId;
  /** New status */
  status: AgentStatus;
  /** When started */
  startedAt?: string;
}

/** Request to add a custom agent */
export interface AgentCustomAddRequest {
  /** Unique ID (must not conflict with built-in) */
  id: AgentId;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Command to execute */
  command: string;
  /** Arguments */
  args?: string[];
  /** Whether auth is required */
  requiresAuth?: boolean;
  /** Auth type if required */
  authType?: AgentAuthType;
  /** Auth flow type */
  authFlowType?: AgentAuthFlowType;
  /** Auth provider name */
  authProvider?: string;
  /** URL for auth */
  authUrl?: string;
  /** Environment variables */
  envVars?: Record<string, string>;
}

/** Request to set the default agent */
export interface AgentSetDefaultRequest {
  /** Agent ID to set as default */
  agentId: AgentId;
}

// =============================================================================
// Session Integration Types
// =============================================================================

/** Agent selection for a session */
export interface SessionAgentSelection {
  /** Selected AI Assistant */
  assistantId: AgentId;
  /** Selected Agent Mode (optional) */
  agentModeId?: string;
}

// =============================================================================
// Event Types (for SSE)
// =============================================================================

/** Types of agent-related events */
export type AgentEventType =
  | "agent_status_changed"
  | "agent_auth_required"
  | "agent_auth_completed"
  | "agent_error";

/** Agent status change event */
export interface AgentStatusEvent {
  type: "agent_status_changed";
  agentId: AgentId;
  status: AgentStatus;
  error?: string;
  timestamp: string;
}

/** Agent auth required event */
export interface AgentAuthRequiredEvent {
  type: "agent_auth_required";
  agentId: AgentId;
  authType: AgentAuthType;
  timestamp: string;
}

/** Agent auth completed event */
export interface AgentAuthCompletedEvent {
  type: "agent_auth_completed";
  agentId: AgentId;
  success: boolean;
  timestamp: string;
}

/** Agent error event */
export interface AgentErrorEvent {
  type: "agent_error";
  agentId: AgentId;
  error: string;
  timestamp: string;
}

/** Union of all agent events */
export type AgentEvent =
  | AgentStatusEvent
  | AgentAuthRequiredEvent
  | AgentAuthCompletedEvent
  | AgentErrorEvent;
