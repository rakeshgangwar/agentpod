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
  /** Optional model selection - if not provided, uses the default model */
  model?: {
    providerID: string;
    modelID: string;
  };
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
    
    // Build the body with optional model selection
    const body: { parts: typeof sdkParts; model?: { providerID: string; modelID: string } } = {
      parts: sdkParts,
    };
    
    if (input.model) {
      body.model = input.model;
      log.info('Sending message with model selection', { 
        projectId, 
        sessionId, 
        provider: input.model.providerID, 
        model: input.model.modelID 
      });
    }
    
    const result = await client.session.prompt({
      path: { id: sessionId },
      body,
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
   * List files in a directory
   * 
   * Note: The SDK's file.read() with a path returns file content, but
   * the OpenCode server's GET /file?path=X endpoint returns directory
   * listings when path is a directory. We make a direct HTTP call here.
   */
  async listFiles(projectId: string, path: string = '/'): Promise<Array<{
    name: string;
    path: string;
    absolute?: string;
    type: 'file' | 'directory';
    ignored: boolean;
    children?: unknown[];
  }>> {
    const { project } = await getClient(projectId);
    const baseUrl = await getOpenCodeUrl(project);
    
    // Make direct HTTP call to the file list endpoint
    const url = new URL('/file', baseUrl);
    url.searchParams.set('path', path);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      throw new OpenCodeProxyError(
        `Failed to list files: ${response.statusText}`,
        response.status
      );
    }
    
    return response.json() as Promise<Array<{
      name: string;
      path: string;
      absolute?: string;
      type: 'file' | 'directory';
      ignored: boolean;
      children?: unknown[];
    }>>;
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

  /**
   * Get configured providers and their models from OpenCode
   * 
   * Note: OpenCode returns models as an object (keyed by model ID), but we 
   * transform it to an array for easier consumption by the mobile app.
   * 
   * We also filter out providers with source="env" as these are auto-detected
   * from environment variables and may not actually be configured by the user.
   * For example, when GitHub Copilot OAuth is set up, GITHUB_TOKEN leaks to
   * github-models provider even though it wasn't explicitly configured.
   */
  async getProviders(projectId: string): Promise<Array<{
    id: string;
    name: string;
    models: Array<{ id: string; name: string }>;
  }>> {
    const { project } = await getClient(projectId);
    const baseUrl = await getOpenCodeUrl(project);
    
    // Make direct HTTP call to the /config/providers endpoint
    const url = new URL('/config/providers', baseUrl);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      throw new OpenCodeProxyError(
        `Failed to get providers: ${response.statusText}`,
        response.status
      );
    }
    
    // OpenCode returns: { providers: [{ id, name, source, models: { modelId: { id, name, ... }, ... } }] }
    // We transform to: [{ id, name, models: [{ id, name }, ...] }]
    // We filter out providers with source="env" (auto-detected from environment)
    const data = await response.json() as { 
      providers: Array<{
        id: string;
        name: string;
        source?: string;
        models: Record<string, { id: string; name: string }>;
      }>;
    };
    
    return data.providers
      .filter(provider => provider.source !== 'env')
      .map(provider => ({
        id: provider.id,
        name: provider.name,
        models: Object.values(provider.models || {}).map(model => ({
          id: model.id,
          name: model.name,
        })),
      }));
  },

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  /**
   * Respond to a permission request
   * 
   * @param projectId - The project ID
   * @param sessionId - The session ID
   * @param permissionId - The permission request ID
   * @param response - "once" (allow this time), "always" (allow pattern), "reject" (deny)
   */
  async respondToPermission(
    projectId: string,
    sessionId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject'
  ): Promise<boolean> {
    const { project } = await getClient(projectId);
    const baseUrl = await getOpenCodeUrl(project);
    
    // Make direct HTTP call to the permissions endpoint
    // POST /session/{sessionId}/permissions/{permissionId}
    const url = new URL(`/session/${sessionId}/permissions/${permissionId}`, baseUrl);
    
    log.info('Responding to permission request', { 
      projectId, 
      sessionId, 
      permissionId, 
      response 
    });
    
    const httpResponse = await fetch(url.toString(), {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ response }),
    });
    
    if (!httpResponse.ok) {
      const errorText = await httpResponse.text().catch(() => 'Unknown error');
      log.error('Failed to respond to permission', { 
        projectId, 
        sessionId, 
        permissionId, 
        status: httpResponse.status,
        error: errorText 
      });
      throw new OpenCodeProxyError(
        `Failed to respond to permission: ${httpResponse.statusText}`,
        httpResponse.status,
        errorText
      );
    }
    
    log.info('Permission response sent successfully', { 
      projectId, 
      sessionId, 
      permissionId, 
      response 
    });
    
    return true;
  },

  // ---------------------------------------------------------------------------
  // Events (SSE)
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to SSE events for a project
   * Returns an async iterator of events
   * @param projectId - The project ID
   * @param signal - Optional AbortSignal to cancel the subscription
   */
  async subscribeToEvents(projectId: string, signal?: AbortSignal): Promise<AsyncIterable<{ type: string; properties: unknown }>> {
    const { client } = await getClient(projectId);
    const result = await client.event.subscribe({ signal });
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
