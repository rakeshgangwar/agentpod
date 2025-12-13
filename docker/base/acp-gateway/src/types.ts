/**
 * ACP Gateway Types
 * 
 * Types specific to the ACP Gateway service.
 * ACP protocol types are imported from @agentclientprotocol/sdk.
 */

// Re-export commonly used types from the official SDK
export type {
  InitializeResponse,
  NewSessionResponse,
  PromptResponse,
  SessionNotification,
  ContentBlock,
  McpServer,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from '@agentclientprotocol/sdk';

// ============================================================================
// Agent Types (Gateway-specific)
// ============================================================================

export type AgentId = string;

export type AgentStatus = 'stopped' | 'starting' | 'running' | 'error' | 'auth_required';

export type AgentAuthType = 'none' | 'oauth' | 'device_flow' | 'api_key' | 'pkce_oauth';

/** 
 * Device flow authentication pattern.
 * - code_first: App shows code, user enters on URL (GitHub Copilot style)
 * - url_first: User visits URL, copies code back to app (Claude Code style)
 * - pkce_oauth: OAuth 2.0 with PKCE (Anthropic style)
 */
export type AgentAuthFlowType = 'code_first' | 'url_first' | 'pkce_oauth';

export interface AgentConfig {
  id: AgentId;
  name: string;
  description: string;
  command: string;
  args: string[];
  requiresAuth: boolean;
  authType: AgentAuthType;
  /** Device flow pattern (for device_flow auth type) */
  authFlowType?: AgentAuthFlowType;
  /** Provider name for authentication */
  authProvider?: string;
  /** URL for authentication or API key retrieval */
  authUrl?: string;
  /** Environment variables to set when spawning */
  envVars?: Record<string, string>;
  /** Whether this is a built-in (pre-installed) assistant */
  isBuiltIn: boolean;
  /** Whether this is the default assistant for new sessions */
  isDefault: boolean;
  /** Optional icon (emoji or URL) */
  icon?: string;
}

export interface AgentConnection {
  id: AgentId;
  status: AgentStatus;
  startedAt: Date | null;
  lastActivity: Date | null;
  error: string | null;
  sessionCount: number;
}

/** Runtime instance combining config and connection state */
export interface AgentInstance {
  id: AgentId;
  config: AgentConfig;
  status: AgentStatus;
  authenticated: boolean;
  startedAt: Date | null;
  lastActivity: Date | null;
  error: string | null;
  sessionCount: number;
}

// ============================================================================
// Agent Mode Types
// ============================================================================

export type AgentModeSource = 'builtin' | 'custom';

export interface AgentMode {
  id: string;
  name: string;
  description: string;
  source: AgentModeSource;
  assistantId: AgentId | 'all';
  systemPrompt?: string;
  opencodeAgentId?: string;
  icon?: string;
}

// ============================================================================
// Session Types (Gateway-specific)
// ============================================================================

export type SessionStatus = 'active' | 'waiting_permission' | 'processing' | 'idle' | 'ended';

export interface Session {
  id: string;
  agentId: AgentId;
  acpSessionId: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  workingDirectory: string;
  /** Selected agent mode (if any) */
  agentModeId?: string;
}

export interface SessionCreate {
  agentId: AgentId;
  workingDirectory?: string;
  agentModeId?: string;
}

export interface SessionUpdate {
  status?: SessionStatus;
  lastActivity?: Date;
  messageCount?: number;
}

// ============================================================================
// Auth Types (Gateway-specific)
// ============================================================================

export type AgentAuthStatus = 'idle' | 'pending' | 'completed' | 'failed';

export interface AgentAuthState {
  agentId: AgentId;
  status: AgentAuthStatus;
  flowType: AgentAuthFlowType | 'api_key';
  /** For code_first flow: the code to display to user */
  userCode?: string;
  /** For code_first flow: URL where user enters the code */
  verificationUrl?: string;
  /** For url_first flow: URL to open in browser */
  authUrl?: string;
  /** When this auth flow expires */
  expiresAt?: Date;
  /** Error message if status is "failed" */
  error?: string;
}

export interface AuthInitResponse {
  flowType: AgentAuthFlowType | 'api_key';
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
  /** For pkce_oauth: state ID to track the OAuth flow */
  stateId?: string;
  /** For pkce_oauth: auth mode ('max' or 'console') */
  authMode?: 'max' | 'console';
}

export interface AuthCompleteRequest {
  /** For url_first flow: code from browser */
  code?: string;
  /** For api_key flow: the API key */
  token?: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  expiresAt?: string;
}

// ============================================================================
// File System Types (Gateway-specific, for FileHandler)
// ============================================================================

export interface FsReadTextFileParams {
  path: string;
}

export interface FsReadTextFileResult {
  content: string;
}

export interface FsWriteTextFileParams {
  path: string;
  content: string;
}

export interface FsListDirectoryParams {
  path: string;
}

export interface FsListDirectoryResult {
  entries: Array<{
    name: string;
    type: 'file' | 'directory';
  }>;
}

// ============================================================================
// Event Types (for SSE)
// ============================================================================

export type EventType = 
  | 'agent_status'
  | 'session_update'
  | 'session_end_turn'
  | 'permission_request'
  | 'auth_required'
  | 'auth_complete'
  | 'error';

export interface GatewayEvent {
  type: EventType;
  sessionId?: string;
  agentId?: AgentId;
  data: unknown;
  timestamp: Date;
}

// ============================================================================
// HTTP API Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AgentListResponse {
  assistants: AgentInstance[];
  defaultAssistantId: AgentId;
}

export interface AgentModesResponse {
  modes: AgentMode[];
  defaultModeId?: string;
}

export interface AgentSpawnRequest {
  env?: Record<string, string>;
  workingDirectory?: string;
}

export interface AgentSpawnResponse {
  id: AgentId;
  status: AgentStatus;
  startedAt?: string;
}

export interface AgentCustomAddRequest {
  id: AgentId;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  requiresAuth?: boolean;
  authType?: AgentAuthType;
  authFlowType?: AgentAuthFlowType;
  authProvider?: string;
  authUrl?: string;
  envVars?: Record<string, string>;
}

export interface SessionResponse {
  id: string;
  agentId: AgentId;
  status: SessionStatus;
  createdAt: string;
  lastActivity: string;
  messageCount: number;
  agentModeId?: string;
}
