/**
 * ACP Gateway Types
 * 
 * Types for the Agent Client Protocol (ACP) gateway service that orchestrates
 * multiple AI coding assistants (OpenCode, Claude Code, Gemini CLI, etc.)
 */

// ============================================================================
// Agent Types
// ============================================================================

export type AgentId = 'opencode' | 'claude-code' | 'gemini-cli' | 'qwen-code' | 'codex';

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
  process: import('bun').Subprocess | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  error: string | null;
  sessionCount: number;
}

// ============================================================================
// ACP Protocol Types (JSON-RPC 2.0)
// ============================================================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ACP-specific request/response types
export interface AcpInitializeParams {
  clientInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    textDocuments?: boolean;
    tools?: boolean;
  };
  workingDirectory: string;
}

export interface AcpInitializeResult {
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    textDocuments?: boolean;
    tools?: boolean;
  };
}

export interface AcpAuthenticateParams {
  token?: string;
}

export interface AcpAuthenticateResult {
  authenticated: boolean;
  authUrl?: string;
  deviceCode?: string;
  userCode?: string;
  expiresIn?: number;
}

export interface AcpSessionNewParams {
  sessionId?: string;
}

export interface AcpSessionNewResult {
  sessionId: string;
}

export interface AcpSessionPromptParams {
  sessionId: string;
  prompt: string;
}

export interface AcpSessionCancelParams {
  sessionId: string;
}

// ============================================================================
// ACP Client Request Types (requests FROM agent TO gateway)
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

export interface SessionRequestPermissionParams {
  sessionId: string;
  permission: string;
  description: string;
  path?: string;
  command?: string;
}

export interface TerminalRunParams {
  sessionId: string;
  command: string;
  cwd?: string;
}

export interface TerminalRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ============================================================================
// ACP Notification Types (notifications FROM agent)
// ============================================================================

export interface SessionUpdateNotification {
  sessionId: string;
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'error';
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  isPartial?: boolean;
}

export interface SessionEndTurnNotification {
  sessionId: string;
  reason: 'complete' | 'cancelled' | 'error';
  error?: string;
}

export interface AuthRequiredNotification {
  authUrl?: string;
  deviceCode?: string;
  userCode?: string;
  expiresIn?: number;
  message?: string;
}

// ============================================================================
// Session Types
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
// Permission Types
// ============================================================================

export type PermissionType = 'file_read' | 'file_write' | 'terminal' | 'browser';

export interface PermissionRequest {
  id: string;
  sessionId: string;
  type: PermissionType;
  description: string;
  path?: string;
  command?: string;
  requestedAt: Date;
}

export interface PermissionResponse {
  id: string;
  granted: boolean;
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

export interface AgentStatusResponse {
  id: AgentId;
  status: AgentStatus;
  startedAt: string | null;
  lastActivity: string | null;
  sessionCount: number;
  error: string | null;
}

export interface SessionResponse {
  id: string;
  agentId: AgentId;
  status: SessionStatus;
  createdAt: string;
  lastActivity: string;
  messageCount: number;
}

export interface AuthInitResponse {
  authUrl?: string;
  deviceCode?: string;
  userCode?: string;
  expiresIn?: number;
  message?: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  expiresAt?: string;
}
