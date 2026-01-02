import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/drizzle.ts';
import { 
  mcpServers, 
  mcpNamespaces,
  mcpNamespaceServers,
  mcpEndpoints,
} from '../db/schema/mcp.ts';
import { config } from '../config.ts';
import { metamcpClient } from '../services/metamcp-client.ts';
import { metamcpTrpcClient, type CreateMcpServerInput } from '../services/metamcp-trpc-client.ts';
import { createLogger } from '../utils/logger.ts';
import {
  encryptAuthConfig,
  encryptEnvironment,
  decryptAuthConfig,
  createMcpApiKey,
  listMcpApiKeys,
  revokeMcpApiKey,
  type McpAuthConfig,
  type EncryptedAuthConfig,
} from '../services/mcp-credentials.ts';
import {
  generatePKCEChallenge,
  buildAuthorizationUrl,
  exchangeOAuth2Code,
  getOAuthCallbackUrl,
  getOAuth2ProviderConfig,
  resolveProviderLinkToken,
} from '../services/mcp-auth-handlers.ts';
import {
  detectProviderMcpServer,
  getAuthConfigForProviderMcp,
  getProviderLinkDisplayInfo,
} from '../services/mcp-provider-servers.ts';
import { isProviderConfigured } from '../models/provider-credentials.ts';
import { githubCopilotOAuth } from '../services/oauth/github-copilot.ts';

const log = createLogger('mcp-servers-routes');

function getUser(c: { get: (key: string) => unknown }): { id: string } | null {
  const user = c.get("user") as { id?: string } | undefined;
  if (!user?.id || user.id === "anonymous") {
    return null;
  }
  return { id: user.id };
}

function generateId(): string {
  return crypto.randomUUID();
}

const createServerSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['STDIO', 'SSE', 'STREAMABLE_HTTP']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  auth: z.object({
    type: z.enum(['none', 'api_key', 'bearer_token', 'oauth2', 'env_vars', 'provider_link']),
    apiKey: z.string().optional(),
    bearerToken: z.string().optional(),
    oauth2: z.object({
      clientId: z.string(),
      clientSecret: z.string().optional(),
      scope: z.string().optional(),
      authorizationUrl: z.string().optional(),
      tokenUrl: z.string().optional(),
    }).optional(),
    envVars: z.record(z.string()).optional(),
    headers: z.record(z.string()).optional(),
    providerLink: z.object({
      providerId: z.string(),
      providerName: z.string().optional(),
    }).optional(),
  }).optional(),
  environment: z.record(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

const updateServerSchema = createServerSchema.partial();

const createNamespaceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  serverIds: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

const updateNamespaceSchema = createNamespaceSchema.partial();

const createEndpointSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  namespaceId: z.string(),
  authEnabled: z.boolean().optional(),
  authType: z.enum(['api_key', 'oauth']).optional(),
  isPublic: z.boolean().optional(),
});

export const mcpServerRoutes = new Hono()
  .get('/', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const servers = await db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.userId, user.id));

      return c.json({ servers });
    } catch (error) {
      log.error('Failed to list MCP servers', { error });
      return c.json({ error: 'Failed to list servers' }, 500);
    }
  })

  .get('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const [server] = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.id)));

      if (!server) {
        return c.json({ error: 'Server not found' }, 404);
      }

      return c.json({ server });
    } catch (error) {
      log.error('Failed to get MCP server', { id, error });
      return c.json({ error: 'Failed to get server' }, 500);
    }
  })

  .post('/', zValidator('json', createServerSchema), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const data = c.req.valid('json');
    const id = generateId();

    try {
      let authConfig = data.auth as McpAuthConfig | undefined;
      let providerMcpDetected = false;
      let providerConfigured = false;

      if (data.url && (data.type === 'SSE' || data.type === 'STREAMABLE_HTTP')) {
        const detectedServer = detectProviderMcpServer(data.url);
        if (detectedServer) {
          providerMcpDetected = true;
          const providerId = detectedServer.providerLink.providerId;
          providerConfigured = await isProviderConfigured(user.id, providerId);
          
          if (providerConfigured) {
            authConfig = getAuthConfigForProviderMcp(detectedServer);
            log.info('Auto-detected provider MCP server', { 
              url: data.url, 
              providerId,
              providerName: detectedServer.providerLink.providerName 
            });
          } else if (providerId === 'github-copilot') {
            try {
              const deviceFlow = await githubCopilotOAuth.initDeviceFlow(user.id);
              log.info('Auto-initiated device flow for MCP server', { 
                url: data.url, 
                providerId,
                stateId: deviceFlow.id 
              });
              
              return c.json({ 
                error: 'Authentication required',
                code: 'AUTH_REQUIRED',
                message: `This MCP server requires ${detectedServer.providerLink.providerName} authentication.`,
                providerRequired: providerId,
                providerName: detectedServer.providerLink.providerName,
                deviceFlow: {
                  stateId: deviceFlow.id,
                  userCode: deviceFlow.userCode,
                  verificationUri: deviceFlow.verificationUri,
                  expiresAt: deviceFlow.expiresAt.toISOString(),
                  interval: deviceFlow.interval,
                },
              }, 401);
            } catch (flowError) {
              log.error('Failed to initiate device flow', { error: flowError });
              return c.json({ 
                error: 'Provider not configured',
                message: `This MCP server requires ${detectedServer.providerLink.providerName} authentication. Please configure it in your provider settings first.`,
                providerRequired: providerId,
                providerName: detectedServer.providerLink.providerName,
              }, 400);
            }
          } else {
            return c.json({ 
              error: 'Provider not configured',
              message: `This MCP server requires ${detectedServer.providerLink.providerName} authentication. Please configure it in your provider settings first.`,
              providerRequired: providerId,
              providerName: detectedServer.providerLink.providerName,
            }, 400);
          }
        }
      }

      const encryptedAuthConfig = authConfig 
        ? await encryptAuthConfig(authConfig)
        : { type: 'none' as const };
      
      const encryptedEnv = data.environment 
        ? await encryptEnvironment(data.environment)
        : {};

      // Step 1: Insert into AgentPod first (prevents orphaned MetaMCP records if this fails)
      let [server] = await db
        .insert(mcpServers)
        .values({
          id,
          userId: user.id,
          name: data.name,
          description: data.description,
          type: data.type,
          command: data.command,
          args: data.args || [],
          url: data.url,
          authType: authConfig?.type || 'none',
          authConfig: encryptedAuthConfig as unknown as Record<string, unknown>,
          environment: encryptedEnv,
          metamcpServerId: null, // Will be updated after MetaMCP sync
          enabled: true,
          isPublic: data.isPublic || false,
        })
        .returning();

      log.info('MCP server created in AgentPod', { userId: user.id, serverId: id, name: data.name });

      // Step 2: Sync to MetaMCP (if enabled)
      let metamcpServerId: string | null = null;

      if (config.metamcp.enabled) {
        try {
          let bearerToken = data.auth?.bearerToken;
          
          if (authConfig?.type === 'provider_link' && authConfig.providerLink?.providerId) {
            const resolved = await resolveProviderLinkToken(user.id, authConfig.providerLink.providerId);
            if (resolved) {
              bearerToken = resolved.accessToken;
            }
          }

          // Build headers - include Authorization header if we have a bearer token
          // MetaMCP may use headers field for HTTP transports
          const headers: Record<string, string> = { ...(data.auth?.headers || {}) };
          if (bearerToken) {
            headers['authorization'] = `Bearer ${bearerToken}`;
          }

          const metamcpInput: CreateMcpServerInput = {
            name: data.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
            description: data.description,
            type: data.type,
            command: data.command,
            args: data.args,
            url: data.url,
            env: data.environment,
            bearerToken,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            user_id: user.id,
          };
          const metamcpServer = await metamcpTrpcClient.createServer(metamcpInput);
          metamcpServerId = metamcpServer.uuid;
          log.info('Synced MCP server to MetaMCP', { metamcpServerId, name: data.name });

          // Step 3: Update AgentPod record with MetaMCP server ID
          const [updatedServer] = await db
            .update(mcpServers)
            .set({ metamcpServerId })
            .where(eq(mcpServers.id, id))
            .returning();
          
          server = updatedServer;
          log.info('Updated AgentPod record with MetaMCP server ID', { serverId: id, metamcpServerId });
        } catch (syncError) {
          log.warn('Failed to sync MCP server to MetaMCP, continuing without sync', { 
            error: syncError, 
            name: data.name 
          });
          // Server exists in AgentPod but not synced to MetaMCP - this is acceptable
        }
      }

      const providerLinkInfo = authConfig?.type === 'provider_link' && authConfig.providerLink
        ? getProviderLinkDisplayInfo(authConfig.providerLink.providerId)
        : null;

      return c.json({ 
        server,
        providerLink: providerLinkInfo ? {
          detected: providerMcpDetected,
          providerId: authConfig?.providerLink?.providerId,
          ...providerLinkInfo,
        } : undefined,
      }, 201);
    } catch (error) {
      log.error('Failed to create MCP server', { error });
      return c.json({ error: 'Failed to create server' }, 500);
    }
  })

  .put('/:id', zValidator('json', updateServerSchema), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const data = c.req.valid('json');

    try {
      const [existing] = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.id)));

      if (!existing) {
        return c.json({ error: 'Server not found' }, 404);
      }

      const encryptedAuthConfig = data.auth 
        ? await encryptAuthConfig(data.auth as McpAuthConfig)
        : undefined;
      
      const encryptedEnv = data.environment 
        ? await encryptEnvironment(data.environment)
        : undefined;

      let metamcpServerId = existing.metamcpServerId;

      if (config.metamcp.enabled && metamcpServerId) {
        try {
          const updatedName = (data.name ?? existing.name).replace(/[^a-zA-Z0-9_-]/g, '_');
          await metamcpTrpcClient.updateServer({
            uuid: metamcpServerId,
            name: updatedName,
            description: data.description ?? existing.description ?? undefined,
            type: data.type ?? existing.type,
            command: data.command ?? existing.command ?? undefined,
            args: data.args ?? existing.args ?? undefined,
            url: data.url ?? existing.url ?? undefined,
            env: (encryptedEnv ?? existing.environment) as Record<string, string> | undefined,
            bearerToken: data.auth?.bearerToken,
            headers: data.auth?.headers,
          });
          log.info('Synced MCP server update to MetaMCP', { metamcpServerId });
        } catch (syncError) {
          log.warn('Failed to sync MCP server update to MetaMCP', { 
            error: syncError, 
            metamcpServerId 
          });
        }
      }

      const [server] = await db
        .update(mcpServers)
        .set({
          name: data.name ?? existing.name,
          description: data.description ?? existing.description,
          type: data.type ?? existing.type,
          command: data.command ?? existing.command,
          args: data.args ?? existing.args,
          url: data.url ?? existing.url,
          authType: data.auth?.type ?? existing.authType,
          authConfig: encryptedAuthConfig 
            ? encryptedAuthConfig as unknown as Record<string, unknown>
            : existing.authConfig,
          environment: encryptedEnv ?? existing.environment,
          isPublic: data.isPublic ?? existing.isPublic,
          updatedAt: new Date(),
        })
        .where(eq(mcpServers.id, id))
        .returning();

      log.info('MCP server updated', { userId: user.id, serverId: id, metamcpServerId });

      return c.json({ server });
    } catch (error) {
      log.error('Failed to update MCP server', { id, error });
      return c.json({ error: 'Failed to update server' }, 500);
    }
  })

  .delete('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const [existing] = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.id)));

      if (!existing) {
        return c.json({ error: 'Server not found' }, 404);
      }

      await db.delete(mcpServers).where(eq(mcpServers.id, id));

      log.info('MCP server deleted', { userId: user.id, serverId: id });

      return c.json({ success: true });
    } catch (error) {
      log.error('Failed to delete MCP server', { id, error });
      return c.json({ error: 'Failed to delete server' }, 500);
    }
  })

  .post('/:id/test', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const [server] = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.id)));

      if (!server) {
        return c.json({ error: 'Server not found' }, 404);
      }

      // For SSE/HTTP servers, we can test the URL directly
      if (server.type === 'SSE' || server.type === 'STREAMABLE_HTTP') {
        if (!server.url) {
          return c.json({ 
            success: false, 
            message: 'No URL configured for this server' 
          });
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const response = await fetch(server.url, {
            method: 'HEAD',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok || response.status === 405) {
            // 405 Method Not Allowed is acceptable - means server is responding
            return c.json({ 
              success: true, 
              message: `Server is reachable (status: ${response.status})` 
            });
          } else {
            return c.json({ 
              success: false, 
              message: `Server responded with status ${response.status}` 
            });
          }
        } catch (fetchError) {
          const err = fetchError as Error;
          return c.json({ 
            success: false, 
            message: `Failed to connect: ${err.message}` 
          });
        }
      }

      // For STDIO servers, we can only validate the configuration
      if (server.type === 'STDIO') {
        if (!server.command) {
          return c.json({ 
            success: false, 
            message: 'No command configured for this server' 
          });
        }

        // STDIO servers require running the command to truly test
        // We return configuration status instead
        return c.json({ 
          success: true, 
          message: `STDIO server configured: ${server.command} ${(server.args || []).join(' ')}` 
        });
      }

      return c.json({ 
        success: false, 
        message: 'Unknown server type' 
      });
    } catch (error) {
      log.error('Failed to test MCP server connection', { id, error });
      return c.json({ error: 'Failed to test connection' }, 500);
    }
  })

  .post('/:id/oauth/init', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const [server] = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.id)));

      if (!server) {
        return c.json({ error: 'Server not found' }, 404);
      }

      if (server.authType !== 'oauth2') {
        return c.json({ error: 'Server is not configured for OAuth2' }, 400);
      }

      const authConfig = server.authConfig as Record<string, unknown>;
      const oauth2Config = authConfig.oauth2 as Record<string, unknown> | undefined;
      
      if (!oauth2Config?.clientId || !oauth2Config?.authorizationUrl) {
        return c.json({ error: 'OAuth2 configuration incomplete' }, 400);
      }

      const pkce = await generatePKCEChallenge();
      const state = crypto.randomUUID();
      const redirectUri = getOAuthCallbackUrl(id);

      const authUrl = buildAuthorizationUrl(
        oauth2Config.authorizationUrl as string,
        oauth2Config.clientId as string,
        redirectUri,
        oauth2Config.scope as string | undefined,
        state,
        pkce
      );

      return c.json({ 
        authorizationUrl: authUrl,
        state,
        codeVerifier: pkce.codeVerifier,
        redirectUri,
      });
    } catch (error) {
      log.error('Failed to init OAuth2 flow', { id, error });
      return c.json({ error: 'Failed to initialize OAuth2 flow' }, 500);
    }
  })

  .post('/:id/oauth/callback', zValidator('json', z.object({
    code: z.string(),
    state: z.string(),
    codeVerifier: z.string().optional(),
  })), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const { code, codeVerifier } = c.req.valid('json');

    try {
      const [server] = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.id)));

      if (!server) {
        return c.json({ error: 'Server not found' }, 404);
      }

      const authConfig = server.authConfig as Record<string, unknown>;
      const oauth2Config = authConfig.oauth2 as Record<string, unknown> | undefined;
      
      if (!oauth2Config?.tokenUrl || !oauth2Config?.clientId) {
        return c.json({ error: 'OAuth2 configuration incomplete' }, 400);
      }

      const redirectUri = getOAuthCallbackUrl(id);
      let clientSecret: string | undefined;
      
      if (oauth2Config.clientSecretEncrypted) {
        const { decrypt } = await import('../utils/encryption.ts');
        clientSecret = await decrypt(oauth2Config.clientSecretEncrypted as string);
      }

      const tokenResponse = await exchangeOAuth2Code(
        oauth2Config.tokenUrl as string,
        oauth2Config.clientId as string,
        clientSecret,
        code,
        redirectUri,
        codeVerifier
      );

      const { encrypt } = await import('../utils/encryption.ts');
      const updatedOAuth2 = {
        ...oauth2Config,
        accessTokenEncrypted: await encrypt(tokenResponse.access_token),
        refreshTokenEncrypted: tokenResponse.refresh_token 
          ? await encrypt(tokenResponse.refresh_token) 
          : undefined,
        expiresAt: tokenResponse.expires_in 
          ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
          : undefined,
      };

      await db
        .update(mcpServers)
        .set({
          authConfig: { ...authConfig, oauth2: updatedOAuth2 },
          updatedAt: new Date(),
        })
        .where(eq(mcpServers.id, id));

      log.info('OAuth2 tokens saved', { userId: user.id, serverId: id });

      return c.json({ success: true });
    } catch (error) {
      log.error('Failed to complete OAuth2 flow', { id, error });
      return c.json({ error: 'Failed to complete OAuth2 flow' }, 500);
    }
  });

export const mcpNamespaceRoutes = new Hono()
  .get('/', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const namespaces = await db
        .select()
        .from(mcpNamespaces)
        .where(eq(mcpNamespaces.userId, user.id));

      return c.json({ namespaces });
    } catch (error) {
      log.error('Failed to list MCP namespaces', { error });
      return c.json({ error: 'Failed to list namespaces' }, 500);
    }
  })

  .get('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const [namespace] = await db
        .select()
        .from(mcpNamespaces)
        .where(and(eq(mcpNamespaces.id, id), eq(mcpNamespaces.userId, user.id)));

      if (!namespace) {
        return c.json({ error: 'Namespace not found' }, 404);
      }

      const servers = await db
        .select({ serverId: mcpNamespaceServers.serverId, enabled: mcpNamespaceServers.enabled })
        .from(mcpNamespaceServers)
        .where(eq(mcpNamespaceServers.namespaceId, id));

      return c.json({ namespace, servers });
    } catch (error) {
      log.error('Failed to get MCP namespace', { id, error });
      return c.json({ error: 'Failed to get namespace' }, 500);
    }
  })

  .post('/', zValidator('json', createNamespaceSchema), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const data = c.req.valid('json');
    const id = generateId();

    try {
      const [namespace] = await db
        .insert(mcpNamespaces)
        .values({
          id,
          userId: user.id,
          name: data.name,
          description: data.description,
          isPublic: data.isPublic || false,
        })
        .returning();

      if (data.serverIds && data.serverIds.length > 0) {
        await db.insert(mcpNamespaceServers).values(
          data.serverIds.map(serverId => ({
            namespaceId: id,
            serverId,
            enabled: true,
          }))
        );
      }

      log.info('MCP namespace created', { userId: user.id, namespaceId: id, name: data.name });

      return c.json({ namespace }, 201);
    } catch (error) {
      log.error('Failed to create MCP namespace', { error });
      return c.json({ error: 'Failed to create namespace' }, 500);
    }
  })

  .put('/:id', zValidator('json', updateNamespaceSchema), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const data = c.req.valid('json');

    try {
      const [existing] = await db
        .select()
        .from(mcpNamespaces)
        .where(and(eq(mcpNamespaces.id, id), eq(mcpNamespaces.userId, user.id)));

      if (!existing) {
        return c.json({ error: 'Namespace not found' }, 404);
      }

      const [namespace] = await db
        .update(mcpNamespaces)
        .set({
          name: data.name ?? existing.name,
          description: data.description ?? existing.description,
          isPublic: data.isPublic ?? existing.isPublic,
          updatedAt: new Date(),
        })
        .where(eq(mcpNamespaces.id, id))
        .returning();

      if (data.serverIds) {
        await db.delete(mcpNamespaceServers).where(eq(mcpNamespaceServers.namespaceId, id));
        if (data.serverIds.length > 0) {
          await db.insert(mcpNamespaceServers).values(
            data.serverIds.map(serverId => ({
              namespaceId: id,
              serverId,
              enabled: true,
            }))
          );
        }
      }

      log.info('MCP namespace updated', { userId: user.id, namespaceId: id });

      return c.json({ namespace });
    } catch (error) {
      log.error('Failed to update MCP namespace', { id, error });
      return c.json({ error: 'Failed to update namespace' }, 500);
    }
  })

  .delete('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const [existing] = await db
        .select()
        .from(mcpNamespaces)
        .where(and(eq(mcpNamespaces.id, id), eq(mcpNamespaces.userId, user.id)));

      if (!existing) {
        return c.json({ error: 'Namespace not found' }, 404);
      }

      await db.delete(mcpNamespaces).where(eq(mcpNamespaces.id, id));

      log.info('MCP namespace deleted', { userId: user.id, namespaceId: id });

      return c.json({ success: true });
    } catch (error) {
      log.error('Failed to delete MCP namespace', { id, error });
      return c.json({ error: 'Failed to delete namespace' }, 500);
    }
  });

export const mcpEndpointRoutes = new Hono()
  .get('/', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const endpoints = await db
        .select()
        .from(mcpEndpoints)
        .where(eq(mcpEndpoints.userId, user.id));

      return c.json({ endpoints });
    } catch (error) {
      log.error('Failed to list MCP endpoints', { error });
      return c.json({ error: 'Failed to list endpoints' }, 500);
    }
  })

  .get('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const [endpoint] = await db
        .select()
        .from(mcpEndpoints)
        .where(and(eq(mcpEndpoints.id, id), eq(mcpEndpoints.userId, user.id)));

      if (!endpoint) {
        return c.json({ error: 'Endpoint not found' }, 404);
      }

      const urls = {
        sse: `${config.metamcp.url}/metamcp/${endpoint.name}/sse`,
        mcp: `${config.metamcp.url}/metamcp/${endpoint.name}/mcp`,
        api: `${config.metamcp.url}/metamcp/${endpoint.name}/api`,
        openapi: `${config.metamcp.url}/metamcp/${endpoint.name}/api/openapi.json`,
      };

      return c.json({ endpoint, urls });
    } catch (error) {
      log.error('Failed to get MCP endpoint', { id, error });
      return c.json({ error: 'Failed to get endpoint' }, 500);
    }
  })

  .post('/', zValidator('json', createEndpointSchema), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const data = c.req.valid('json');
    const id = generateId();

    try {
      const [namespace] = await db
        .select()
        .from(mcpNamespaces)
        .where(and(eq(mcpNamespaces.id, data.namespaceId), eq(mcpNamespaces.userId, user.id)));

      if (!namespace) {
        return c.json({ error: 'Namespace not found' }, 404);
      }

      const results = await db
        .insert(mcpEndpoints)
        .values({
          id,
          userId: user.id,
          namespaceId: data.namespaceId,
          name: data.name,
          authEnabled: data.authEnabled ?? true,
          authType: data.authType ?? 'api_key',
          isPublic: data.isPublic || false,
        })
        .returning();

      const endpoint = results[0];
      if (!endpoint) {
        return c.json({ error: 'Failed to create endpoint' }, 500);
      }

      log.info('MCP endpoint created', { userId: user.id, endpointId: id, name: data.name });

      const urls = {
        sse: `${config.metamcp.url}/metamcp/${endpoint.name}/sse`,
        mcp: `${config.metamcp.url}/metamcp/${endpoint.name}/mcp`,
        api: `${config.metamcp.url}/metamcp/${endpoint.name}/api`,
        openapi: `${config.metamcp.url}/metamcp/${endpoint.name}/api/openapi.json`,
      };

      return c.json({ endpoint, urls }, 201);
    } catch (error) {
      log.error('Failed to create MCP endpoint', { error });
      return c.json({ error: 'Failed to create endpoint' }, 500);
    }
  })

  .delete('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const [existing] = await db
        .select()
        .from(mcpEndpoints)
        .where(and(eq(mcpEndpoints.id, id), eq(mcpEndpoints.userId, user.id)));

      if (!existing) {
        return c.json({ error: 'Endpoint not found' }, 404);
      }

      await db.delete(mcpEndpoints).where(eq(mcpEndpoints.id, id));

      log.info('MCP endpoint deleted', { userId: user.id, endpointId: id });

      return c.json({ success: true });
    } catch (error) {
      log.error('Failed to delete MCP endpoint', { id, error });
      return c.json({ error: 'Failed to delete endpoint' }, 500);
    }
  });

async function checkMetaMcpHealth() {
  if (!config.metamcp.enabled) {
    return { 
      enabled: false, 
      status: 'disabled',
      message: 'MetaMCP integration is disabled' 
    };
  }

  try {
    const health = await metamcpClient.healthCheck();
    return { 
      enabled: true, 
      status: 'connected',
      metamcp: health 
    };
  } catch (error) {
    log.error('MetaMCP health check failed', { error });
    return { 
      enabled: true, 
      status: 'error',
      error: 'Failed to connect to MetaMCP' 
    };
  }
}

export const mcpStatusRoutes = new Hono()
  .get('/health', async (c) => {
    const result = await checkMetaMcpHealth();
    return c.json(result);
  })
  
  .post('/detect-provider', zValidator('json', z.object({
    url: z.string().url(),
  })), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { url } = c.req.valid('json');
    const detected = detectProviderMcpServer(url);
    
    if (!detected) {
      return c.json({ 
        isProviderMcp: false,
      });
    }

    const providerConfigured = await isProviderConfigured(user.id, detected.providerLink.providerId);
    const displayInfo = getProviderLinkDisplayInfo(detected.providerLink.providerId);

    return c.json({
      isProviderMcp: true,
      providerId: detected.providerLink.providerId,
      providerName: detected.providerLink.providerName,
      providerConfigured,
      displayInfo,
      suggestedName: detected.name,
      suggestedDescription: detected.description,
    });
  });

export const mcpPublicStatusRoutes = new Hono()
  .get('/health', async (c) => {
    const result = await checkMetaMcpHealth();
    return c.json(result);
  });

export const mcpApiKeyRoutes = new Hono()
  .get('/', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const endpointId = c.req.query('endpointId');

    try {
      const keys = await listMcpApiKeys(user.id, endpointId);
      return c.json({ keys });
    } catch (error) {
      log.error('Failed to list MCP API keys', { error });
      return c.json({ error: 'Failed to list API keys' }, 500);
    }
  })

  .post('/', zValidator('json', z.object({
    endpointId: z.string().optional(),
    description: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    expiresInDays: z.number().optional(),
  })), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const data = c.req.valid('json');

    try {
      const expiresAt = data.expiresInDays 
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      const result = await createMcpApiKey(
        user.id,
        data.endpointId || null,
        data.description,
        data.scopes,
        expiresAt
      );

      log.info('MCP API key created', { userId: user.id, keyPrefix: result.keyPrefix });

      return c.json({ 
        id: result.id,
        key: result.key,
        keyPrefix: result.keyPrefix,
      }, 201);
    } catch (error) {
      log.error('Failed to create MCP API key', { error });
      return c.json({ error: 'Failed to create API key' }, 500);
    }
  })

  .delete('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');

    try {
      const revoked = await revokeMcpApiKey(user.id, id);
      
      if (!revoked) {
        return c.json({ error: 'API key not found' }, 404);
      }

      return c.json({ success: true });
    } catch (error) {
      log.error('Failed to revoke MCP API key', { id, error });
      return c.json({ error: 'Failed to revoke API key' }, 500);
    }
  });
