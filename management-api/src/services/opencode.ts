/**
 * OpenCode Proxy Service
 * 
 * Proxies requests from the Management API to OpenCode containers.
 * Each project has its own OpenCode container accessible via its FQDN URL.
 * 
 * Architecture:
 * Mobile App → Management API → OpenCode Container (via FQDN/Traefik)
 */

import { config } from '../config.ts';
import { coolify } from './coolify.ts';
import { getProjectById, updateProject, type Project } from '../models/project.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('opencode');

// =============================================================================
// Types
// =============================================================================

export interface OpenCodeSession {
  id: string;
  status: string;
  cost?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpenCodeMessage {
  info: {
    id: string;
    role: 'user' | 'assistant';
    content?: string;
  };
  parts: OpenCodeMessagePart[];
}

export interface OpenCodeMessagePart {
  id?: string;
  type: 'text' | 'tool_call' | 'tool_result' | 'file';
  text?: string;
  content?: string;
}

export interface SendMessageInput {
  parts: Array<{
    type: 'text' | 'file';
    text?: string;
    url?: string;
    filename?: string;
    mime?: string;
  }>;
}

export interface OpenCodeFile {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: OpenCodeFile[];
}

export interface OpenCodeFileContent {
  content: string;
  language?: string;
}

// =============================================================================
// URL Resolution
// =============================================================================

/**
 * Get the OpenCode API base URL for a project
 * Uses the FQDN URL stored in the database, or fetches from Coolify if not set
 */
async function getOpenCodeUrl(project: Project): Promise<string> {
  // If we have a stored FQDN URL, use it
  if (project.fqdnUrl) {
    return project.fqdnUrl;
  }
  
  // Fallback: Try to get FQDN from Coolify and cache it
  try {
    const coolifyApp = await coolify.getApplication(project.coolifyAppUuid);
    if (coolifyApp.fqdn) {
      // Update the project with the FQDN
      log.info('Caching FQDN URL from Coolify', { 
        projectId: project.id, 
        fqdn: coolifyApp.fqdn 
      });
      updateProject(project.id, { fqdnUrl: coolifyApp.fqdn });
      return coolifyApp.fqdn;
    }
  } catch (error) {
    log.warn('Failed to get FQDN from Coolify', { error });
  }
  
  // Last resort fallback: construct URL from wildcard domain
  if (config.opencode.wildcardDomain) {
    const fqdnUrl = `https://opencode-${project.slug}.${config.opencode.wildcardDomain}`;
    log.info('Using constructed FQDN URL', { projectId: project.id, fqdnUrl });
    updateProject(project.id, { fqdnUrl });
    return fqdnUrl;
  }
  
  throw new OpenCodeProxyError(
    'No FQDN URL configured for this project. Please set OPENCODE_WILDCARD_DOMAIN or manually configure the container domain.',
    500
  );
}

// =============================================================================
// HTTP Client for OpenCode
// =============================================================================

async function proxyRequest<T>(
  project: Project,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const baseUrl = await getOpenCodeUrl(project);
  const url = `${baseUrl}${path}`;

  log.debug(`Proxying ${method} ${path} to ${url}`);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data: unknown;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      log.error(`OpenCode API error: ${response.status}`, { path, data });
      throw new OpenCodeProxyError(
        `OpenCode API error: ${response.status} ${response.statusText}`,
        response.status,
        data
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof OpenCodeProxyError) {
      throw error;
    }
    log.error('OpenCode proxy request failed', { path, error });
    throw new OpenCodeProxyError(
      `Failed to connect to OpenCode: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      error
    );
  }
}

// =============================================================================
// Error Class
// =============================================================================

export class OpenCodeProxyError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'OpenCodeProxyError';
  }
}

// =============================================================================
// OpenCode API Methods
// =============================================================================

export const opencode = {
  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  /**
   * List all sessions for a project
   */
  async listSessions(projectId: string): Promise<OpenCodeSession[]> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    return proxyRequest<OpenCodeSession[]>(project, 'GET', '/session');
  },

  /**
   * Create a new session
   */
  async createSession(projectId: string): Promise<OpenCodeSession> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    return proxyRequest<OpenCodeSession>(project, 'POST', '/session', {});
  },

  /**
   * Get session details
   */
  async getSession(projectId: string, sessionId: string): Promise<OpenCodeSession> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    return proxyRequest<OpenCodeSession>(project, 'GET', `/session/${sessionId}`);
  },

  /**
   * Delete a session
   */
  async deleteSession(projectId: string, sessionId: string): Promise<void> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    await proxyRequest<unknown>(project, 'DELETE', `/session/${sessionId}`);
  },

  /**
   * Abort a running session
   */
  async abortSession(projectId: string, sessionId: string): Promise<void> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    await proxyRequest<unknown>(project, 'POST', `/session/${sessionId}/abort`);
  },

  // ---------------------------------------------------------------------------
  // Message API
  // ---------------------------------------------------------------------------

  /**
   * List messages in a session
   */
  async listMessages(projectId: string, sessionId: string): Promise<OpenCodeMessage[]> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    return proxyRequest<OpenCodeMessage[]>(project, 'GET', `/session/${sessionId}/message`);
  },

  /**
   * Send a message to a session
   */
  async sendMessage(
    projectId: string, 
    sessionId: string, 
    input: SendMessageInput
  ): Promise<OpenCodeMessage> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    return proxyRequest<OpenCodeMessage>(project, 'POST', `/session/${sessionId}/message`, input);
  },

  /**
   * Get a specific message
   */
  async getMessage(
    projectId: string, 
    sessionId: string, 
    messageId: string
  ): Promise<OpenCodeMessage> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    return proxyRequest<OpenCodeMessage>(
      project, 
      'GET', 
      `/session/${sessionId}/message/${messageId}`
    );
  },

  // ---------------------------------------------------------------------------
  // File API
  // ---------------------------------------------------------------------------

  /**
   * List files in the project
   */
  async listFiles(projectId: string, path: string = '/'): Promise<OpenCodeFile[]> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    const encodedPath = encodeURIComponent(path);
    return proxyRequest<OpenCodeFile[]>(project, 'GET', `/file?path=${encodedPath}`);
  },

  /**
   * Get file content
   */
  async getFileContent(projectId: string, filePath: string): Promise<OpenCodeFileContent> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    const encodedPath = encodeURIComponent(filePath);
    return proxyRequest<OpenCodeFileContent>(project, 'GET', `/file/content?path=${encodedPath}`);
  },

  /**
   * Find files by query
   */
  async findFiles(projectId: string, query: string): Promise<string[]> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    const encodedQuery = encodeURIComponent(query);
    return proxyRequest<string[]>(project, 'GET', `/find/file?query=${encodedQuery}`);
  },

  // ---------------------------------------------------------------------------
  // App Info
  // ---------------------------------------------------------------------------

  /**
   * Get OpenCode app info (can be used as health check)
   */
  async getAppInfo(projectId: string): Promise<{ name: string; version: string }> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    return proxyRequest<{ name: string; version: string }>(project, 'GET', '/app');
  },

  // ---------------------------------------------------------------------------
  // SSE Events (special handling - returns URL for client to connect)
  // ---------------------------------------------------------------------------

  /**
   * Get the SSE event stream URL for a project
   * The client will connect to this URL directly for real-time events
   */
  async getEventStreamUrl(projectId: string): Promise<string> {
    const project = getProjectById(projectId);
    if (!project) {
      throw new OpenCodeProxyError('Project not found', 404);
    }
    if (project.status !== 'running') {
      throw new OpenCodeProxyError('Project container is not running', 503);
    }

    const baseUrl = await getOpenCodeUrl(project);
    return `${baseUrl}/event`;
  },

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Check if OpenCode container is reachable
   */
  async healthCheck(projectId: string): Promise<boolean> {
    try {
      await this.listSessions(projectId);
      return true;
    } catch {
      return false;
    }
  },
};
