/**
 * OpenCode Service
 * 
 * Uses the official OpenCode SDK to communicate with OpenCode containers.
 * Each project has its own OpenCode container accessible via its FQDN URL.
 * 
 * Architecture:
 * Mobile App → Management API → OpenCode Container (via SDK)
 */

import { createOpencodeClient } from '@opencode-ai/sdk';
import type { Session, Message, Part } from '@opencode-ai/sdk';
import { config } from '../config.ts';
import { coolify } from './coolify.ts';
import { getProjectById, updateProject, type Project } from '../models/project.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('opencode');

// =============================================================================
// Types (re-export from SDK for convenience)
// =============================================================================

export type { Session, Message, Part };

export interface SendMessageInput {
  parts: Array<{
    type: 'text' | 'file';
    text?: string;
    url?: string;
    filename?: string;
    mime?: string;
  }>;
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
// Client Cache
// =============================================================================

// Cache SDK clients per project to reuse connections
const clientCache = new Map<string, ReturnType<typeof createOpencodeClient>>();

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

/**
 * Get or create an SDK client for a project
 */
async function getClient(projectId: string) {
  const project = getProjectById(projectId);
  if (!project) {
    throw new OpenCodeProxyError('Project not found', 404);
  }
  if (project.status !== 'running') {
    throw new OpenCodeProxyError('Project container is not running', 503);
  }

  // Check cache
  if (clientCache.has(projectId)) {
    return { client: clientCache.get(projectId)!, project };
  }

  // Create new client
  const baseUrl = await getOpenCodeUrl(project);
  log.debug('Creating OpenCode SDK client', { projectId, baseUrl });
  
  const client = createOpencodeClient({
    baseUrl,
    throwOnError: true,
  });
  
  clientCache.set(projectId, client);
  return { client, project };
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
  async listSessions(projectId: string): Promise<Session[]> {
    const { client } = await getClient(projectId);
    const result = await client.session.list();
    return result.data ?? [];
  },

  /**
   * Create a new session
   */
  async createSession(projectId: string, title?: string): Promise<Session> {
    const { client } = await getClient(projectId);
    const result = await client.session.create({
      body: { title },
    });
    return result.data!;
  },

  /**
   * Get session details
   */
  async getSession(projectId: string, sessionId: string): Promise<Session> {
    const { client } = await getClient(projectId);
    const result = await client.session.get({
      path: { id: sessionId },
    });
    return result.data!;
  },

  /**
   * Delete a session
   */
  async deleteSession(projectId: string, sessionId: string): Promise<void> {
    const { client } = await getClient(projectId);
    await client.session.delete({
      path: { id: sessionId },
    });
  },

  /**
   * Abort a running session
   */
  async abortSession(projectId: string, sessionId: string): Promise<void> {
    const { client } = await getClient(projectId);
    await client.session.abort({
      path: { id: sessionId },
    });
  },

  // ---------------------------------------------------------------------------
  // Message API
  // ---------------------------------------------------------------------------

  /**
   * List messages in a session
   */
  async listMessages(projectId: string, sessionId: string): Promise<Array<{ info: Message; parts: Part[] }>> {
    const { client } = await getClient(projectId);
    const result = await client.session.messages({
      path: { id: sessionId },
    });
    return result.data ?? [];
  },

  /**
   * Send a message to a session (prompt)
   */
  async sendMessage(
    projectId: string, 
    sessionId: string, 
    input: SendMessageInput
  ): Promise<{ info: Message; parts: Part[] }> {
    const { client } = await getClient(projectId);
    
    // Convert our input format to SDK format
    const sdkParts = input.parts.map(part => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text || '' };
      } else {
        return { 
          type: 'file' as const, 
          url: part.url || '',
          filename: part.filename,
          mime: part.mime || 'application/octet-stream', // SDK requires mime to be non-undefined
        };
      }
    });
    
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: sdkParts,
      },
    });
    return result.data!;
  },

  /**
   * Get a specific message
   */
  async getMessage(
    projectId: string, 
    sessionId: string, 
    messageId: string
  ): Promise<{ info: Message; parts: Part[] }> {
    const { client } = await getClient(projectId);
    const result = await client.session.message({
      path: { id: sessionId, messageID: messageId },
    });
    return result.data!;
  },

  // ---------------------------------------------------------------------------
  // File API
  // ---------------------------------------------------------------------------

  /**
   * Get file content
   */
  async getFileContent(projectId: string, filePath: string): Promise<{ type: string; content: string }> {
    const { client } = await getClient(projectId);
    const result = await client.file.read({
      query: { path: filePath },
    });
    return result.data!;
  },

  /**
   * Find files by query
   */
  async findFiles(projectId: string, query: string): Promise<string[]> {
    const { client } = await getClient(projectId);
    const result = await client.find.files({
      query: { query },
    });
    return result.data ?? [];
  },

  /**
   * Get file status (list tracked files)
   */
  async listFiles(projectId: string, _path: string = '/'): Promise<unknown[]> {
    const { client } = await getClient(projectId);
    const result = await client.file.status({});
    return result.data ?? [];
  },

  // ---------------------------------------------------------------------------
  // App Info
  // ---------------------------------------------------------------------------

  /**
   * Get OpenCode app info (config and project info)
   */
  async getAppInfo(projectId: string): Promise<unknown> {
    const { client } = await getClient(projectId);
    // SDK doesn't have app.info(), use config.get() and project.current() instead
    const [configResult, projectResult] = await Promise.all([
      client.config.get(),
      client.project.current(),
    ]);
    return {
      config: configResult.data,
      project: projectResult.data,
    };
  },

  // ---------------------------------------------------------------------------
  // Events (SSE)
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to SSE events for a project
   * Returns an async iterator of events
   */
  async subscribeToEvents(projectId: string): Promise<AsyncIterable<{ type: string; properties: unknown }>> {
    const { client } = await getClient(projectId);
    const result = await client.event.subscribe();
    return result.stream!;
  },

  /**
   * Get the SSE event stream URL for a project (for direct client connection)
   */
  async getEventStreamUrl(projectId: string): Promise<string> {
    const { project } = await getClient(projectId);
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

  /**
   * Clear cached client for a project (call when project is stopped/deleted)
   */
  clearClientCache(projectId: string): void {
    clientCache.delete(projectId);
  },
};
