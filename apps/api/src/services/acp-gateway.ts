/**
 * ACP Gateway Proxy Service
 * 
 * Proxies requests to the ACP Gateway running in project containers.
 * Handles URL resolution, token injection, and response transformation.
 */

import { getProjectById } from '../models/project.ts';
import { getAgentAuthToken, getEnvVarsForAgent, type AgentId } from '../models/agent-auth.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('acp-gateway');

// ACP Gateway runs on port 4097 inside containers
const ACP_GATEWAY_PORT = 4097;

// =============================================================================
// Types
// =============================================================================

export interface GatewayResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AgentInfo {
  id: AgentId;
  name: string;
  description: string;
  requiresAuth: boolean;
  status: string;
  authenticated?: boolean;
}

export interface SessionInfo {
  id: string;
  agentId: AgentId;
  status: string;
  createdAt: string;
  lastActivity?: string;
  messageCount?: number;
}

// =============================================================================
// URL Resolution
// =============================================================================

/**
 * Get the ACP Gateway URL for a project.
 * Uses the project's fqdnUrl and changes the port to 4097.
 */
export function getGatewayUrl(projectId: string): string | null {
  const project = getProjectById(projectId);
  if (!project || !project.fqdnUrl) {
    return null;
  }
  
  // Parse the FQDN URL and change port to ACP Gateway port
  try {
    const url = new URL(project.fqdnUrl);
    // The fqdnUrl might be like https://project.domain.com:4096
    // We need to change the port to 4097
    url.port = String(ACP_GATEWAY_PORT);
    return url.toString().replace(/\/$/, ''); // Remove trailing slash
  } catch (error) {
    log.error('Failed to parse project FQDN URL', { projectId, fqdnUrl: project.fqdnUrl, error });
    return null;
  }
}

/**
 * Get the internal container URL for ACP Gateway (for docker-compose scenarios).
 */
export function getInternalGatewayUrl(projectId: string): string | null {
  const project = getProjectById(projectId);
  if (!project) {
    return null;
  }
  
  // If we have a direct container port, use localhost
  // This is for when Management API and container are on the same host
  if (project.containerPort) {
    // Container port is OpenCode's port (4096), ACP Gateway is at +1
    const acpPort = project.containerPort + 1;
    return `http://localhost:${acpPort}`;
  }
  
  return null;
}

// =============================================================================
// Generic Proxy
// =============================================================================

/**
 * Proxy a request to the ACP Gateway.
 */
export async function proxyRequest<T = unknown>(
  projectId: string,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    timeout?: number;
  } = {}
): Promise<GatewayResponse<T>> {
  const gatewayUrl = getGatewayUrl(projectId) || getInternalGatewayUrl(projectId);
  
  if (!gatewayUrl) {
    return {
      success: false,
      error: 'Could not determine ACP Gateway URL for project',
    };
  }
  
  const url = `${gatewayUrl}${path}`;
  const { method = 'GET', body, headers = {}, timeout = 30000 } = options;
  
  log.debug('Proxying request to ACP Gateway', { url, method });
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.json() as GatewayResponse<T>;
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('ACP Gateway proxy request failed', { url, error: message });
    
    return {
      success: false,
      error: `Gateway request failed: ${message}`,
    };
  }
}

// =============================================================================
// Agent Operations
// =============================================================================

/**
 * List available agents from the gateway.
 */
export async function listAgents(projectId: string): Promise<GatewayResponse<{ agents: AgentInfo[] }>> {
  return proxyRequest<{ agents: AgentInfo[] }>(projectId, '/agents');
}

/**
 * Spawn an agent in the container.
 */
export async function spawnAgent(
  projectId: string,
  agentId: AgentId,
  userId?: string,
  env?: Record<string, string>
): Promise<GatewayResponse<{ id: string; status: string }>> {
  // Get auth tokens for agents that require them
  let authEnv: Record<string, string> = {};
  
  if (userId && agentId !== 'opencode') {
    const token = await getAgentAuthToken(userId, agentId);
    if (token?.accessToken) {
      authEnv = getEnvVarsForAgent(agentId, token.accessToken);
    }
  }
  
  return proxyRequest<{ id: string; status: string }>(projectId, `/agents/${agentId}/spawn`, {
    method: 'POST',
    body: {
      env: { ...env, ...authEnv },
    },
  });
}

/**
 * Stop an agent.
 */
export async function stopAgent(
  projectId: string,
  agentId: AgentId
): Promise<GatewayResponse<{ id: string; status: string }>> {
  return proxyRequest<{ id: string; status: string }>(projectId, `/agents/${agentId}/stop`, {
    method: 'POST',
  });
}

/**
 * Get agent status.
 */
export async function getAgentStatus(
  projectId: string,
  agentId: AgentId
): Promise<GatewayResponse<{
  id: string;
  status: string;
  startedAt: string | null;
  lastActivity: string | null;
  sessionCount: number;
  error: string | null;
}>> {
  return proxyRequest(projectId, `/agents/${agentId}/status`);
}

// =============================================================================
// Auth Operations
// =============================================================================

/**
 * Initialize auth flow for an agent.
 */
export async function initAgentAuth(
  projectId: string,
  agentId: AgentId
): Promise<GatewayResponse<{
  authUrl?: string;
  deviceCode?: string;
  userCode?: string;
  expiresIn?: number;
  message?: string;
}>> {
  return proxyRequest(projectId, `/agents/${agentId}/auth/init`, {
    method: 'POST',
  });
}

/**
 * Get auth status for an agent.
 */
export async function getAgentAuthStatus(
  projectId: string,
  agentId: AgentId
): Promise<GatewayResponse<{
  authenticated: boolean;
  expiresAt?: string;
}>> {
  return proxyRequest(projectId, `/agents/${agentId}/auth/status`);
}

/**
 * Set auth token for an agent (after OAuth callback).
 */
export async function setAgentAuthToken(
  projectId: string,
  agentId: AgentId,
  token: string,
  expiresIn?: number
): Promise<GatewayResponse<{ authenticated: boolean }>> {
  return proxyRequest(projectId, `/agents/${agentId}/auth/token`, {
    method: 'POST',
    body: { token, expiresIn },
  });
}

// =============================================================================
// Session Operations
// =============================================================================

/**
 * Create a new session in the gateway.
 */
export async function createGatewaySession(
  projectId: string,
  agentId: AgentId,
  workingDirectory?: string,
  userId?: string
): Promise<GatewayResponse<SessionInfo>> {
  // Get auth tokens if needed
  let env: Record<string, string> = {};
  
  if (userId && agentId !== 'opencode') {
    const token = await getAgentAuthToken(userId, agentId);
    if (token?.accessToken) {
      env = getEnvVarsForAgent(agentId, token.accessToken);
    }
  }
  
  return proxyRequest<SessionInfo>(projectId, '/session', {
    method: 'POST',
    body: {
      agentId,
      workingDirectory: workingDirectory || '/workspace',
      env,
    },
  });
}

/**
 * Get session info from gateway.
 */
export async function getGatewaySession(
  projectId: string,
  sessionId: string
): Promise<GatewayResponse<SessionInfo>> {
  return proxyRequest<SessionInfo>(projectId, `/session/${sessionId}`);
}

/**
 * List sessions from gateway.
 */
export async function listGatewaySessions(
  projectId: string
): Promise<GatewayResponse<{ sessions: SessionInfo[] }>> {
  return proxyRequest<{ sessions: SessionInfo[] }>(projectId, '/sessions');
}

/**
 * Send a prompt to a session.
 */
export async function sendPrompt(
  projectId: string,
  sessionId: string,
  prompt: string
): Promise<GatewayResponse<{ id: string; status: string }>> {
  return proxyRequest<{ id: string; status: string }>(projectId, `/session/${sessionId}/prompt`, {
    method: 'POST',
    body: { prompt },
    timeout: 300000, // 5 minute timeout for prompts
  });
}

/**
 * Cancel an active operation.
 */
export async function cancelSession(
  projectId: string,
  sessionId: string
): Promise<GatewayResponse<{ id: string; status: string }>> {
  return proxyRequest<{ id: string; status: string }>(projectId, `/session/${sessionId}/cancel`, {
    method: 'POST',
  });
}

/**
 * End a session.
 */
export async function endGatewaySession(
  projectId: string,
  sessionId: string
): Promise<GatewayResponse<{ id: string; status: string }>> {
  return proxyRequest<{ id: string; status: string }>(projectId, `/session/${sessionId}`, {
    method: 'DELETE',
  });
}

// =============================================================================
// Permission Operations
// =============================================================================

/**
 * Respond to a permission request.
 */
export async function respondToPermission(
  projectId: string,
  permissionId: string,
  granted: boolean
): Promise<GatewayResponse<{ id: string; granted: boolean }>> {
  return proxyRequest<{ id: string; granted: boolean }>(projectId, `/permission/${permissionId}`, {
    method: 'POST',
    body: { granted },
  });
}

// =============================================================================
// SSE Event Stream
// =============================================================================

/**
 * Get the SSE event stream URL for a project.
 */
export function getEventStreamUrl(projectId: string, sessionId?: string): string | null {
  const gatewayUrl = getGatewayUrl(projectId) || getInternalGatewayUrl(projectId);
  
  if (!gatewayUrl) {
    return null;
  }
  
  return sessionId 
    ? `${gatewayUrl}/events/${sessionId}`
    : `${gatewayUrl}/events`;
}

/**
 * Create an SSE proxy response.
 * Returns the fetch response that can be streamed to the client.
 */
export async function createEventStream(
  projectId: string,
  sessionId?: string
): Promise<Response | null> {
  const url = getEventStreamUrl(projectId, sessionId);
  
  if (!url) {
    return null;
  }
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
    
    return response;
  } catch (error) {
    log.error('Failed to create event stream', { url, error });
    return null;
  }
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Check if the ACP Gateway is healthy.
 */
export async function checkGatewayHealth(projectId: string): Promise<boolean> {
  const result = await proxyRequest<{ status: string }>(projectId, '/health', {
    timeout: 5000,
  });
  
  return result.success;
}

/**
 * Get gateway info.
 */
export async function getGatewayInfo(projectId: string): Promise<GatewayResponse<{
  name: string;
  version: string;
  workingDirectory: string;
  runningAgents: number;
  activeSessions: number;
  connectedClients: number;
}>> {
  return proxyRequest(projectId, '/info');
}
