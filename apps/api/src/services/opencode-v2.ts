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
import type { Session, Message, Part } from "@opencode-ai/sdk";
import { getSandboxManager } from "./sandbox-manager.ts";
import type { Sandbox } from "./orchestrator/types.ts";
import { createLogger } from "../utils/logger.ts";
import { config } from "../config.ts";

/**
 * Custom fetch that bypasses SSL verification for container-to-container communication.
 * This is needed because containers use Traefik/Let's Encrypt certs that may have chain issues
 * when accessed from within the same infrastructure.
 */
const insecureFetch = (request: Request): Promise<Response> => {
  return fetch(request, {
    tls: {
      rejectUnauthorized: false,
    },
  });
};

const log = createLogger("opencode-v2");

// =============================================================================
// Types (re-export from SDK for convenience)
// =============================================================================

export type { Session, Message, Part };

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
  // Use internal Docker network URL: http://{containerName}:{opencodePort}
  // Container name format: {prefix}-{sandboxId} (e.g., "agentpod-MN1N1-rsnw0v")
  const containerPrefix = config.docker.containerPrefix;
  const opencodePort = config.opencode.serverPort;
  
  // The container name is stored or can be derived from sandbox.id
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
  async createSession(sandboxId: string, title?: string): Promise<Session> {
    const { client } = await getClient(sandboxId);
    const result = await client.session.create({
      body: { title },
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
    const { client } = await getClient(sandboxId);

    // Convert our input format to SDK format
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

    // Build the body with optional model selection
    const body: {
      parts: typeof sdkParts;
      model?: { providerID: string; modelID: string };
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

    log.info("Permission response sent successfully", {
      sandboxId,
      sessionId,
      permissionId,
      response,
    });

    return result.data ?? true;
  },

  // ---------------------------------------------------------------------------
  // Events (SSE)
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to SSE events for a sandbox
   * Returns an async iterator of events
   */
  async subscribeToEvents(
    sandboxId: string,
    signal?: AbortSignal
  ): Promise<AsyncIterable<{ type: string; properties: unknown }>> {
    const { client } = await getClient(sandboxId);
    const result = await client.event.subscribe({ signal });
    return result.stream!;
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
};
