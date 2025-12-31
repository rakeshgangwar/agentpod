/**
 * OpenCode Service for v2 Sandboxes
 *
 * Uses the official OpenCode SDK to communicate with OpenCode inside v2 sandbox containers.
 * This is similar to opencode.ts but works with the new direct Docker sandbox system.
 *
 * Architecture:
 * Mobile App -> Management API -> OpenCode Container (via SDK)
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import type { Session, Message, Part, Permission, Agent } from "@opencode-ai/sdk";
import { getSandboxManager, type Sandbox } from "./sandbox-manager.ts";
import { createLogger } from "../utils/logger.ts";
import { config } from "../config.ts";

// =============================================================================
// Permission Cache
// =============================================================================

/**
 * In-memory cache for pending permissions.
 * 
 * This cache is necessary because OpenCode stores permissions only in memory
 * and delivers them via SSE events. When a client reconnects, they lose
 * knowledge of pending permissions since the `permission.updated` events
 * are not re-sent.
 * 
 * Structure: sandboxId -> sessionId -> permissionId -> Permission
 */
const permissionCache = new Map<string, Map<string, Map<string, Permission>>>();

/**
 * Cache a permission when we receive a permission.updated SSE event.
 * Called from the SSE event handler.
 */
export function cachePermission(sandboxId: string, permission: Permission): void {
  if (!permissionCache.has(sandboxId)) {
    permissionCache.set(sandboxId, new Map());
  }
  const sandboxPerms = permissionCache.get(sandboxId)!;
  
  if (!sandboxPerms.has(permission.sessionID)) {
    sandboxPerms.set(permission.sessionID, new Map());
  }
  const sessionPerms = sandboxPerms.get(permission.sessionID)!;
  
  sessionPerms.set(permission.id, permission);
  
  log.debug("Cached permission", {
    sandboxId,
    sessionId: permission.sessionID,
    permissionId: permission.id,
    type: permission.type,
    title: permission.title,
  });
}

/**
 * Remove a permission from cache when it's been responded to.
 * Called when we receive a permission.replied SSE event or when responding.
 */
export function uncachePermission(sandboxId: string, sessionId: string, permissionId: string): void {
  const sandboxPerms = permissionCache.get(sandboxId);
  if (!sandboxPerms) return;
  
  const sessionPerms = sandboxPerms.get(sessionId);
  if (!sessionPerms) return;
  
  sessionPerms.delete(permissionId);
  
  log.debug("Uncached permission", {
    sandboxId,
    sessionId,
    permissionId,
  });
  
  // Clean up empty maps
  if (sessionPerms.size === 0) {
    sandboxPerms.delete(sessionId);
  }
  if (sandboxPerms.size === 0) {
    permissionCache.delete(sandboxId);
  }
}

/**
 * Get all pending permissions for a session.
 * Returns permissions that haven't been responded to yet.
 */
export function getCachedPermissions(sandboxId: string, sessionId: string): Permission[] {
  const sandboxPerms = permissionCache.get(sandboxId);
  if (!sandboxPerms) return [];
  
  const sessionPerms = sandboxPerms.get(sessionId);
  if (!sessionPerms) return [];
  
  return Array.from(sessionPerms.values());
}

/**
 * Clear all cached permissions for a sandbox.
 * Called when a sandbox is stopped/deleted.
 */
export function clearPermissionCache(sandboxId: string): void {
  permissionCache.delete(sandboxId);
  log.debug("Cleared permission cache for sandbox", { sandboxId });
}

/**
 * Get all pending permissions across all sandboxes.
 * Returns an array of permissions with their associated sandboxId for context.
 */
export function getAllCachedPermissions(): Array<Permission & { sandboxId: string }> {
  const allPermissions: Array<Permission & { sandboxId: string }> = [];
  
  for (const [sandboxId, sandboxPerms] of permissionCache) {
    for (const [_sessionId, sessionPerms] of sandboxPerms) {
      for (const permission of sessionPerms.values()) {
        allPermissions.push({
          ...permission,
          sandboxId,
        });
      }
    }
  }
  
  // Sort by creation time (newest first)
  allPermissions.sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0));
  
  return allPermissions;
}

/**
 * Custom fetch that bypasses SSL verification for container-to-container communication.
 * This is needed because containers use Traefik/Let's Encrypt certs that may have chain issues
 * when accessed from within the same infrastructure.
 */
const insecureFetch = async (request: Request): Promise<Response> => {
  const url = request.url;
  const method = request.method;
  
  const isCloudflareRequest = url.includes('workers.dev');
  const isPromptCall = method === "POST" && url.includes('/session/') && url.includes('/message');
  
  if (isPromptCall) {
    const clonedReq = request.clone();
    const bodyText = await clonedReq.text();
    
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    
    log.info("insecureFetch: POST to message endpoint", {
      url,
      method,
      headers: JSON.stringify(headers),
      requestBody: bodyText.slice(0, 500),
    });
  }
  
  // For Cloudflare requests, disable compression to avoid zstd decoding issues in Bun
  let modifiedRequest = request;
  if (isCloudflareRequest) {
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Accept-Encoding', 'identity');
    modifiedRequest = new Request(request.url, {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      duplex: 'half',
    });
  }
  
  const response = await fetch(modifiedRequest, {
    tls: {
      rejectUnauthorized: false,
    },
  });
  
  if (isPromptCall) {
    const cloned = response.clone();
    const responseText = await cloned.text();
    
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });
    
    log.info("insecureFetch: Response from POST message", {
      url,
      status: response.status,
      headers: JSON.stringify(respHeaders),
      responseBodyLength: responseText.length,
      responseBodyPreview: responseText.slice(0, 1000),
    });
  }
  
  return response;
};

const log = createLogger("opencode-v2");

// =============================================================================
// Types (re-export from SDK for convenience)
// =============================================================================

export type { Session, Message, Part, Permission, Agent };

export interface SendMessageInput {
  parts: Array<{
    type: "text" | "file";
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
  /** Optional agent to use for this message (e.g., "onboarding", "plan", "build") */
  agent?: string;
  /** OpenCode config for Cloudflare sandboxes (auth, providers, settings) */
  opencodeConfig?: Record<string, unknown>;
}

// =============================================================================
// Error Class
// =============================================================================

export class OpenCodeV2Error extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "OpenCodeV2Error";
  }
}

// =============================================================================
// Client Cache
// =============================================================================

// Cache SDK clients per sandbox to reuse connections
const clientCache = new Map<string, ReturnType<typeof createOpencodeClient>>();

/**
 * Get the OpenCode API base URL for a sandbox
 * 
 * When running inside Docker, we use the internal container name for direct communication
 * over the Docker network instead of going through Traefik (which uses *.localhost domains
 * that don't resolve inside containers).
 */
function getOpenCodeUrl(sandbox: Sandbox): string {
  // For Cloudflare sandboxes, use the stored opencodeUrl directly
  if (sandbox.provider === 'cloudflare' && sandbox.opencodeUrl) {
    log.debug("Using Cloudflare URL for OpenCode", {
      sandboxId: sandbox.id,
      opencodeUrl: sandbox.opencodeUrl,
    });
    return sandbox.opencodeUrl;
  }
  
  // For Docker sandboxes, use internal Docker network URL: http://{containerName}:{opencodePort}
  const containerPrefix = config.docker.containerPrefix;
  const opencodePort = config.opencode.serverPort;
  const containerName = `${containerPrefix}-${sandbox.id}`;
  const internalUrl = `http://${containerName}:${opencodePort}`;
  
  log.debug("Using internal Docker URL for OpenCode", {
    sandboxId: sandbox.id,
    containerName,
    internalUrl,
    externalUrl: sandbox.urls?.opencode,
  });
  
  return internalUrl;
}

/**
 * Get or create an SDK client for a sandbox
 */
async function getClient(sandboxId: string) {
  const manager = getSandboxManager();
  const sandbox = await manager.getSandbox(sandboxId);

  if (!sandbox) {
    throw new OpenCodeV2Error("Sandbox not found", 404);
  }
  if (sandbox.status !== "running") {
    throw new OpenCodeV2Error(
      `Sandbox is not running (status: ${sandbox.status})`,
      503
    );
  }

  // Check cache
  if (clientCache.has(sandboxId)) {
    return { client: clientCache.get(sandboxId)!, sandbox };
  }

  // Create new client
  const baseUrl = getOpenCodeUrl(sandbox);
  log.debug("Creating OpenCode SDK client", { sandboxId, baseUrl });

  const client = createOpencodeClient({
    baseUrl,
    throwOnError: true,
    // Use custom fetch with SSL verification disabled for container-to-container communication
    fetch: insecureFetch,
  });

  clientCache.set(sandboxId, client);
  return { client, sandbox };
}

// =============================================================================
// OpenCode API Methods
// =============================================================================

export const opencodeV2 = {
  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  /**
   * List all sessions for a sandbox
   */
  async listSessions(sandboxId: string): Promise<Session[]> {
    const { client } = await getClient(sandboxId);
    const result = await client.session.list();
    return result.data ?? [];
  },

  /**
   * Create a new session
   */
  async createSession(sandboxId: string, title?: string | null): Promise<Session> {
    const { client } = await getClient(sandboxId);
    // OpenCode API expects title to be a string or omitted, not null
    const body = title ? { title } : {};
    const result = await client.session.create({
      body,
    });
    return result.data!;
  },

  /**
   * Get session details
   */
  async getSession(sandboxId: string, sessionId: string): Promise<Session> {
    const { client } = await getClient(sandboxId);
    const result = await client.session.get({
      path: { id: sessionId },
    });
    return result.data!;
  },

  /**
   * Delete a session
   */
  async deleteSession(sandboxId: string, sessionId: string): Promise<void> {
    const { client } = await getClient(sandboxId);
    await client.session.delete({
      path: { id: sessionId },
    });
  },

  /**
   * Abort a running session
   */
  async abortSession(sandboxId: string, sessionId: string): Promise<void> {
    const { client } = await getClient(sandboxId);
    await client.session.abort({
      path: { id: sessionId },
    });
  },

  /**
   * Fork a session at a specific message.
   * Creates a new session that diverges from the original at the specified point.
   * Used for branching conversations.
   * 
   * @param sandboxId - The sandbox ID
   * @param sessionId - The session ID to fork from
   * @param messageId - Optional message ID to fork at. If not provided, forks from the latest message.
   * @returns The new forked session
   */
  async forkSession(
    sandboxId: string,
    sessionId: string,
    messageId?: string
  ): Promise<Session> {
    const { client } = await getClient(sandboxId);

    log.info("Forking session", {
      sandboxId,
      sessionId,
      messageId,
    });

    const result = await client.session.fork({
      path: { id: sessionId },
      body: messageId ? { messageID: messageId } : undefined,
    });

    log.info("Session forked successfully", {
      sandboxId,
      originalSessionId: sessionId,
      newSessionId: result.data?.id,
    });

    return result.data!;
  },

  /**
   * Revert a message in a session (undo).
   * Marks the message and all subsequent messages as reverted.
   * The reverted messages are preserved and can be restored with unrevert.
   * 
   * @param sandboxId - The sandbox ID
   * @param sessionId - The session ID
   * @param messageId - The message ID to revert to
   * @param partId - Optional part ID for partial revert
   * @returns The updated session
   */
  async revertMessage(
    sandboxId: string,
    sessionId: string,
    messageId: string,
    partId?: string
  ): Promise<Session> {
    const { client } = await getClient(sandboxId);

    log.info("Reverting message", {
      sandboxId,
      sessionId,
      messageId,
      partId,
    });

    const result = await client.session.revert({
      path: { id: sessionId },
      body: { messageID: messageId, partID: partId },
    });

    log.info("Message reverted successfully", {
      sandboxId,
      sessionId,
      messageId,
    });

    return result.data!;
  },

  /**
   * Unrevert a session (redo).
   * Restores all previously reverted messages.
   * 
   * @param sandboxId - The sandbox ID
   * @param sessionId - The session ID
   * @returns The updated session
   */
  async unrevertSession(sandboxId: string, sessionId: string): Promise<Session> {
    const { client } = await getClient(sandboxId);

    log.info("Unreverting session", {
      sandboxId,
      sessionId,
    });

    const result = await client.session.unrevert({
      path: { id: sessionId },
    });

    log.info("Session unrevert successful", {
      sandboxId,
      sessionId,
    });

    return result.data!;
  },

  // ---------------------------------------------------------------------------
  // Message API
  // ---------------------------------------------------------------------------

  /**
   * List messages in a session
   */
  async listMessages(
    sandboxId: string,
    sessionId: string
  ): Promise<Array<{ info: Message; parts: Part[] }>> {
    const { client } = await getClient(sandboxId);
    const result = await client.session.messages({
      path: { id: sessionId },
    });
    return result.data ?? [];
  },

  /**
   * Send a message to a session (prompt)
   */
  async sendMessage(
    sandboxId: string,
    sessionId: string,
    input: SendMessageInput
  ): Promise<{ info: Message; parts: Part[] }> {
    const { client, sandbox } = await getClient(sandboxId);

    const sdkParts = input.parts.map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text || "" };
      } else {
        return {
          type: "file" as const,
          url: part.url || "",
          filename: part.filename,
          mime: part.mime || "application/octet-stream",
        };
      }
    });

    const body: {
      parts: typeof sdkParts;
      model?: { providerID: string; modelID: string };
      agent?: string;
    } = {
      parts: sdkParts,
    };

    if (input.model) {
      body.model = input.model;
      log.info("Sending message with model selection", {
        sandboxId,
        sessionId,
        provider: input.model.providerID,
        model: input.model.modelID,
      });
    }

    if (input.agent) {
      body.agent = input.agent;
      log.info("Sending message with agent selection", {
        sandboxId,
        sessionId,
        agent: input.agent,
      });
    }

    const baseUrl = getOpenCodeUrl(sandbox);
    log.info("SDK sendMessage call", { 
      sandboxId, 
      sessionId, 
      baseUrl,
      provider: sandbox.provider,
      bodyParts: body.parts.length,
    });

    // For Cloudflare sandboxes, use the direct /message endpoint instead of SDK proxy
    // The SDK's client.session.prompt() goes through /opencode/session/{id}/message which
    // has issues with containerFetch returning empty responses. The /message endpoint works.
    if (sandbox.provider === 'cloudflare' && config.cloudflare.workerUrl) {
      const messageUrl = `${config.cloudflare.workerUrl}/sandbox/${sandboxId}/message`;
      const textPart = sdkParts.find(p => p.type === 'text') as { type: 'text'; text: string } | undefined;
      
      log.info("Using direct /message endpoint for Cloudflare", {
        sandboxId,
        sessionId,
        messageUrl,
        messagePreview: textPart?.text?.slice(0, 100),
      });
      
      const requestBody: { 
        sessionId?: string; 
        message: string; 
        model?: { providerID: string; modelID: string };
        agent?: string;
        config?: Record<string, unknown>;
      } = {
        message: textPart?.text ?? '',
      };
      if (sessionId) {
        requestBody.sessionId = sessionId;
      }
      if (input.model) {
        requestBody.model = input.model;
      }
      if (input.agent) {
        requestBody.agent = input.agent;
      }
      const hasValidConfig = input.opencodeConfig && 
        input.opencodeConfig.provider && 
        Object.keys(input.opencodeConfig.provider as object).length > 0;
      if (hasValidConfig) {
        requestBody.config = input.opencodeConfig;
      }
      
      log.info("Cloudflare /message request", {
        sandboxId,
        messageUrl,
        requestBody: JSON.stringify(requestBody),
        hasApiToken: !!config.cloudflare.apiToken,
      });
      
      const fetchStart = Date.now();
      log.info("Cloudflare fetch starting", { sandboxId, messageUrl });
      
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(config.cloudflare.apiToken ? { 'Authorization': `Bearer ${config.cloudflare.apiToken}` } : {}),
        },
        body: JSON.stringify(requestBody),
      });
      
      log.info("Cloudflare fetch completed", { 
        sandboxId, 
        elapsed: Date.now() - fetchStart,
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        log.error("Cloudflare /message endpoint failed", {
          sandboxId,
          sessionId,
          status: response.status,
          error: errorText,
        });
        throw new OpenCodeV2Error(`Cloudflare message failed: ${response.status} - ${errorText}`, response.status);
      }
      
      const rawText = await response.text();
      log.info("Cloudflare /message raw response", {
        sandboxId,
        rawLength: rawText.length,
        rawPreview: rawText.slice(0, 500),
      });
      
      const result = JSON.parse(rawText) as {
        sessionId: string;
        response: string;
        parts?: Array<{ type: string; text?: string }>;
      };
      
      const actualSessionId = result.sessionId || sessionId;
      
      log.info("Cloudflare /message parsed response", {
        sandboxId,
        sessionId: actualSessionId,
        hasResponse: !!result.response,
        responseLength: result.response?.length,
        partsCount: result.parts?.length,
        firstTextPart: result.parts?.find(p => p.type === 'text'),
      });
      
      const timestamp = new Date().toISOString();
      return {
        info: {
          id: `msg_${Date.now()}`,
          sessionID: actualSessionId,
          role: 'assistant',
          time: timestamp,
          parentID: '',
          modelID: input.model?.modelID ?? '',
          providerID: input.model?.providerID ?? '',
          system: '',
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          error: undefined,
        } as unknown as Message,
        parts: (result.parts ?? [{ type: 'text', text: result.response }]) as unknown as Part[],
      };
    }

    // For Docker sandboxes, use the SDK as usual
    const result = await client.session.prompt({
      path: { id: sessionId },
      body,
    });
    
    log.info("SDK sendMessage response FULL", {
      sandboxId,
      sessionId,
      hasData: !!result.data,
      responseKeys: result.data ? Object.keys(result.data) : [],
      dataType: typeof result.data,
      dataStringified: JSON.stringify(result.data)?.slice(0, 500),
      resultKeys: Object.keys(result),
      hasError: !!(result as Record<string, unknown>).error,
      errorValue: (result as Record<string, unknown>).error,
      hasResponse: !!(result as Record<string, unknown>).response,
    });
    
    return result.data!;
  },

  /**
   * Get a specific message
   */
  async getMessage(
    sandboxId: string,
    sessionId: string,
    messageId: string
  ): Promise<{ info: Message; parts: Part[] }> {
    const { client } = await getClient(sandboxId);
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
  async getFileContent(
    sandboxId: string,
    filePath: string
  ): Promise<{ type: string; content: string }> {
    const { client } = await getClient(sandboxId);
    const result = await client.file.read({
      query: { path: filePath },
    });
    return result.data!;
  },

  /**
   * Find files by query
   */
  async findFiles(sandboxId: string, query: string): Promise<string[]> {
    const { client } = await getClient(sandboxId);
    const result = await client.find.files({
      query: { query },
    });
    return result.data ?? [];
  },

  /**
   * List files in a directory
   */
  async listFiles(
    sandboxId: string,
    path: string = "/"
  ): Promise<
    Array<{
      name: string;
      path: string;
      absolute: string;
      type: "file" | "directory";
      ignored: boolean;
    }>
  > {
    const { client } = await getClient(sandboxId);
    const result = await client.file.list({
      query: { path },
    });
    return result.data ?? [];
  },

  // ---------------------------------------------------------------------------
  // App Info
  // ---------------------------------------------------------------------------

  /**
   * Get OpenCode app info (config and project info)
   */
  async getAppInfo(sandboxId: string): Promise<unknown> {
    const { client } = await getClient(sandboxId);
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
   */
  async getProviders(
    sandboxId: string
  ): Promise<
    Array<{
      id: string;
      name: string;
      models: Array<{ id: string; name: string }>;
    }>
  > {
    const { client } = await getClient(sandboxId);
    const result = await client.config.providers();

    const providers = result.data?.providers ?? [];

    // Filter out providers with source="env" (auto-detected from environment)
    // Transform models from object to array for easier consumption
    return providers
      .filter((provider) => provider.source !== "env")
      .map((provider) => ({
        id: provider.id,
        name: provider.name,
        models: Object.values(provider.models || {}).map((model) => ({
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
   */
  async respondToPermission(
    sandboxId: string,
    sessionId: string,
    permissionId: string,
    response: "once" | "always" | "reject"
  ): Promise<boolean> {
    const { client } = await getClient(sandboxId);

    log.info("Responding to permission request", {
      sandboxId,
      sessionId,
      permissionId,
      response,
    });

    const result = await client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      body: { response },
    });

    // Remove from cache since it's been responded to
    uncachePermission(sandboxId, sessionId, permissionId);

    log.info("Permission response sent successfully", {
      sandboxId,
      sessionId,
      permissionId,
      response,
    });

    return result.data ?? true;
  },

  /**
   * Get pending permissions for a session from the cache.
   * This is used when a client reconnects to retrieve permissions
   * that were received via SSE but not yet responded to.
   */
  getPendingPermissions(sandboxId: string, sessionId: string): Permission[] {
    return getCachedPermissions(sandboxId, sessionId);
  },

  /**
   * Get all pending permissions across all sandboxes.
   * Used by the home page to show a global view of pending actions.
   */
  getAllPendingPermissions(): Array<Permission & { sandboxId: string }> {
    return getAllCachedPermissions();
  },

  // ---------------------------------------------------------------------------
  // Events (SSE)
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to SSE events for a sandbox
   * Returns an async iterator of events
   * 
   * For Cloudflare sandboxes, uses native SSE because the SDK's SSE implementation
   * doesn't properly handle external HTTPS URLs.
   */
  async subscribeToEvents(
    sandboxId: string,
    signal?: AbortSignal
  ): Promise<AsyncIterable<{ type: string; properties: unknown }>> {
    const { client, sandbox } = await getClient(sandboxId);
    
    // Use native SSE for Cloudflare sandboxes
    if (sandbox.provider === 'cloudflare' && sandbox.opencodeUrl) {
      log.info("Using native SSE for Cloudflare sandbox", { sandboxId, opencodeUrl: sandbox.opencodeUrl });
      return this.subscribeToEventsNative(sandbox.opencodeUrl, signal);
    }
    
    // Use SDK for Docker sandboxes
    const result = await client.event.subscribe({ signal });
    return result.stream!;
  },

  /**
   * Native SSE implementation for Cloudflare sandboxes.
   * The SDK's SSE doesn't work with external Cloudflare worker URLs,
   * so we implement SSE parsing manually using native fetch.
   */
  async *subscribeToEventsNative(
    baseUrl: string,
    signal?: AbortSignal
  ): AsyncGenerator<{ type: string; properties: unknown }> {
    log.info("subscribeToEventsNative: Generator entered", { baseUrl });
    const eventUrl = `${baseUrl}/event`;
    log.info("Connecting to native SSE", { eventUrl });

    const response = await fetch(eventUrl, {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      signal,
    });

    if (!response.ok) {
      throw new OpenCodeV2Error(
        `SSE connection failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    if (!response.body) {
      throw new OpenCodeV2Error("SSE response has no body", 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEventType = "message";
    let currentData = "";

    log.info("SSE reader created, starting read loop");

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          log.info("SSE stream ended (done=true)");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentData += line.slice(5).trim();
          } else if (line === '') {
            if (currentData) {
              try {
                const parsed = JSON.parse(currentData);
                log.info("SSE event received", { 
                  type: parsed.type || currentEventType,
                  eventType: currentEventType,
                  parsedType: parsed.type,
                  hasProperties: !!parsed.properties,
                });
                yield {
                  type: parsed.type || currentEventType,
                  properties: parsed.properties || parsed,
                };
              } catch (parseError) {
                log.warn("Failed to parse SSE data", { 
                  data: currentData.slice(0, 100),
                  error: parseError instanceof Error ? parseError.message : parseError,
                });
              }
              currentData = "";
              currentEventType = "message";
            }
          }
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        log.info("SSE stream aborted by signal");
        return;
      }
      log.error("SSE stream error", { error: error instanceof Error ? error.message : error });
      throw error;
    } finally {
      log.info("SSE generator finally block reached");
      reader.releaseLock();
    }
  },

  /**
   * Get the SSE event stream URL for a sandbox (for direct client connection)
   */
  async getEventStreamUrl(sandboxId: string): Promise<string> {
    const { sandbox } = await getClient(sandboxId);
    const baseUrl = getOpenCodeUrl(sandbox);
    return `${baseUrl}/event`;
  },

  // ---------------------------------------------------------------------------
  // Agents
  // ---------------------------------------------------------------------------

  /**
   * Get available agents from OpenCode
   * Returns all agents with their properties using SDK types
   * 
   * Note: OpenCode API returns `native` field but SDK types define `builtIn`.
   * We normalize the response to match SDK types.
   */
  async getAgents(sandboxId: string): Promise<(Agent & { hidden?: boolean })[]> {
    const { client } = await getClient(sandboxId);
    const result = await client.app.agents();
    const agents = result.data ?? [];
    
    // Normalize: OpenCode returns `native`, SDK types expect `builtIn`
    // Also include `hidden` field which isn't in SDK types but is in API response
    return agents.map((agent) => {
      const rawAgent = agent as Agent & { native?: boolean; hidden?: boolean };
      return {
        ...agent,
        builtIn: rawAgent.native ?? agent.builtIn ?? false,
        hidden: rawAgent.hidden,
      };
    });
  },

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  /**
   * Set authentication credentials for a provider in OpenCode.
   * This properly registers the provider as "connected" in OpenCode.
   * 
   * @param sandboxId - The sandbox ID
   * @param providerId - The provider ID (e.g., "github-copilot", "anthropic")
   * @param auth - The auth credentials matching OpenCode's expected format
   */
  async setAuth(
    sandboxId: string,
    providerId: string,
    auth: { type: "api"; key: string } | { type: "oauth"; refresh: string; access: string; expires: number }
  ): Promise<boolean> {
    const { client } = await getClient(sandboxId);

    log.info("Setting auth credentials via SDK", {
      sandboxId,
      providerId,
      authType: auth.type,
    });

    const result = await client.auth.set({
      path: { id: providerId },
      body: auth,
    });

    log.info("Auth credentials set successfully", {
      sandboxId,
      providerId,
      result: result.data,
    });

    return result.data ?? true;
  },

  /**
   * Set multiple provider credentials at once.
   * Useful for syncing all user credentials to a container.
   * 
   * @param sandboxId - The sandbox ID
   * @param credentials - Map of provider ID to auth credentials
   */
  async setMultipleAuth(
    sandboxId: string,
    credentials: Record<string, { type: "api"; key: string } | { type: "oauth"; refresh: string; access: string; expires: number }>
  ): Promise<{ success: string[]; failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] };

    for (const [providerId, auth] of Object.entries(credentials)) {
      try {
        await this.setAuth(sandboxId, providerId, auth);
        results.success.push(providerId);
      } catch (error) {
        log.error("Failed to set auth for provider", {
          sandboxId,
          providerId,
          error: error instanceof Error ? error.message : error,
        });
        results.failed.push(providerId);
      }
    }

    return results;
  },

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Check if OpenCode is reachable in a sandbox
   */
  async healthCheck(sandboxId: string): Promise<boolean> {
    try {
      await this.listSessions(sandboxId);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Clear cached client for a sandbox (call when sandbox is stopped/deleted)
   */
  clearClientCache(sandboxId: string): void {
    clientCache.delete(sandboxId);
  },

  /**
   * Restart the OpenCode server process inside a container.
   * 
   * This is needed because OpenCode caches provider state at startup.
   * After syncing new auth credentials via auth.set(), the provider
   * won't appear in the "connected" list until OpenCode is restarted.
   * 
   * The restart is done by:
   * 1. Killing the opencode process (pkill)
   * 2. Starting it again in the background using setsid for proper detachment
   * 3. Waiting for it to become healthy
   * 
   * @param sandboxId - The sandbox ID
   * @param timeoutMs - How long to wait for OpenCode to restart (default 30s)
   */
  async restartOpenCode(sandboxId: string, timeoutMs = 30000): Promise<boolean> {
    await getClient(sandboxId); // Validate sandbox exists and is running
    const manager = getSandboxManager();

    log.info("Restarting OpenCode server", { sandboxId });

    // Clear the cached client since we're restarting the server
    clientCache.delete(sandboxId);

    const opencodePort = config.opencode.serverPort;
    const workspace = "/home/workspace";

    // Step 1: Kill existing OpenCode process
    try {
      await manager.exec(sandboxId, ["pkill", "-f", "opencode serve"], { user: "developer" });
      log.debug("Killed existing OpenCode process", { sandboxId });
    } catch {
      // Process may not exist, that's fine
      log.debug("No existing OpenCode process to kill", { sandboxId });
    }

    // Give it a moment to fully terminate
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Step 2: Start OpenCode in the background using setsid for proper detachment
    // setsid creates a new session and detaches from the controlling terminal
    // This ensures the process survives after docker exec completes
    // XDG vars ensure OpenCode finds its config at /home/.config/opencode
    const startCommand = [
      "sh",
      "-c",
      `setsid sh -c 'export XDG_CONFIG_HOME=/home/.config && export XDG_DATA_HOME=/home/.local/share && export XDG_CACHE_HOME=/home/.cache && cd ${workspace} && exec opencode serve --port ${opencodePort} --hostname 0.0.0.0' </dev/null >/tmp/opencode.log 2>&1 &`
    ];

    try {
      await manager.exec(sandboxId, startCommand, { user: "developer" });
      log.info("OpenCode restart command executed", { sandboxId });
    } catch (error) {
      log.error("Failed to execute restart command", {
        sandboxId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }

    // Step 3: Wait for OpenCode to become healthy again
    const startTime = Date.now();
    const pollInterval = 1000;
    
    // Give OpenCode a moment to start before polling
    await new Promise((resolve) => setTimeout(resolve, 2000));

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Try to connect to the new OpenCode instance
        const isHealthy = await this.healthCheck(sandboxId);
        if (isHealthy) {
          log.info("OpenCode server restarted successfully", { sandboxId });
          return true;
        }
      } catch {
        // Still starting up, continue waiting
      }
      
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    log.warn("OpenCode restart timed out", { sandboxId, timeoutMs });
    return false;
  },
};
