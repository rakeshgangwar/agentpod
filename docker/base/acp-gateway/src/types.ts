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

export type AgentId = 'opencode' | 'claude-code' | 'gemini-cli' | 'qwen-code' | 'codex' | string;

export type AgentStatus = 'stopped' | 'starting' | 'running' | 'error' | 'auth_required';

export interface AgentConfig {
  id: AgentId;
  name: string;
  description: string;
  command: string;
  args: string[];
  requiresAuth: boolean;
  authType?: 'oauth' | 'device_flow' | 'api_key';
  authProvider?: string;
  envVars?: Record<string, string>;
}

export interface AgentConnection {
  id: AgentId;
  status: AgentStatus;
  startedAt: Date | null;
  lastActivity: Date | null;
  error: string | null;
  sessionCount: number;
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
}

export interface SessionCreate {
  agentId: AgentId;
  workingDirectory?: string;
}

export interface SessionUpdate {
  status?: SessionStatus;
  lastActivity?: Date;
  messageCount?: number;
}

// ============================================================================
// Auth Types (Gateway-specific)
// ============================================================================

export interface AuthInitResponse {
  authUrl?: string;
  deviceCode?: string;
  userCode?: string;
  expiresIn?: number;
  message: string;
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
  agents: Array<{
    id: AgentId;
    name: string;
    description: string;
    requiresAuth: boolean;
    status: AgentStatus;
  }>;
}

export interface SessionResponse {
  id: string;
  agentId: AgentId;
  status: SessionStatus;
  createdAt: string;
  lastActivity: string;
  messageCount: number;
}
