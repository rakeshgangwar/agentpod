import { db } from '../db/drizzle.ts';
import { mcpServers, mcpApiKeys } from '../db/schema/mcp.ts';
import { eq, and } from 'drizzle-orm';
import { encrypt, decrypt } from '../utils/encryption.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('mcp-credentials');

export type McpAuthType = 'none' | 'api_key' | 'bearer_token' | 'oauth2' | 'env_vars' | 'provider_link';

/**
 * Provider link configuration for MCP servers that use tokens from existing LLM providers.
 * This allows MCP servers (like GitHub Copilot MCP) to use the same authentication
 * as their corresponding LLM provider.
 */
export interface ProviderLinkConfig {
  /** The provider ID to link to (e.g., 'github-copilot') */
  providerId: string;
  /** Display name for the linked provider */
  providerName?: string;
}

export interface McpAuthConfig {
  type: McpAuthType;
  apiKey?: string;
  bearerToken?: string;
  oauth2?: {
    clientId: string;
    clientSecret?: string;
    scope?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
  envVars?: Record<string, string>;
  headers?: Record<string, string>;
  /** Link to an existing provider's credentials for authentication */
  providerLink?: ProviderLinkConfig;
}

export interface EncryptedAuthConfig {
  type: McpAuthType;
  apiKeyEncrypted?: string;
  bearerTokenEncrypted?: string;
  oauth2?: {
    clientId: string;
    clientSecretEncrypted?: string;
    scope?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    accessTokenEncrypted?: string;
    refreshTokenEncrypted?: string;
    expiresAt?: string;
  };
  envVarsEncrypted?: Record<string, string>;
  headersEncrypted?: Record<string, string>;
}

export async function encryptAuthConfig(config: McpAuthConfig): Promise<EncryptedAuthConfig> {
  const encrypted: EncryptedAuthConfig = { type: config.type };

  if (config.apiKey) {
    encrypted.apiKeyEncrypted = await encrypt(config.apiKey);
  }

  if (config.bearerToken) {
    encrypted.bearerTokenEncrypted = await encrypt(config.bearerToken);
  }

  if (config.oauth2) {
    encrypted.oauth2 = {
      clientId: config.oauth2.clientId,
      scope: config.oauth2.scope,
      authorizationUrl: config.oauth2.authorizationUrl,
      tokenUrl: config.oauth2.tokenUrl,
      expiresAt: config.oauth2.expiresAt,
    };
    if (config.oauth2.clientSecret) {
      encrypted.oauth2.clientSecretEncrypted = await encrypt(config.oauth2.clientSecret);
    }
    if (config.oauth2.accessToken) {
      encrypted.oauth2.accessTokenEncrypted = await encrypt(config.oauth2.accessToken);
    }
    if (config.oauth2.refreshToken) {
      encrypted.oauth2.refreshTokenEncrypted = await encrypt(config.oauth2.refreshToken);
    }
  }

  if (config.envVars) {
    encrypted.envVarsEncrypted = {};
    for (const [key, value] of Object.entries(config.envVars)) {
      encrypted.envVarsEncrypted[key] = await encrypt(value);
    }
  }

  if (config.headers) {
    encrypted.headersEncrypted = {};
    for (const [key, value] of Object.entries(config.headers)) {
      encrypted.headersEncrypted[key] = await encrypt(value);
    }
  }

  return encrypted;
}

export async function decryptAuthConfig(encrypted: EncryptedAuthConfig): Promise<McpAuthConfig> {
  const config: McpAuthConfig = { type: encrypted.type };

  if (encrypted.apiKeyEncrypted) {
    config.apiKey = await decrypt(encrypted.apiKeyEncrypted);
  }

  if (encrypted.bearerTokenEncrypted) {
    config.bearerToken = await decrypt(encrypted.bearerTokenEncrypted);
  }

  if (encrypted.oauth2) {
    config.oauth2 = {
      clientId: encrypted.oauth2.clientId,
      scope: encrypted.oauth2.scope,
      authorizationUrl: encrypted.oauth2.authorizationUrl,
      tokenUrl: encrypted.oauth2.tokenUrl,
      expiresAt: encrypted.oauth2.expiresAt,
    };
    if (encrypted.oauth2.clientSecretEncrypted) {
      config.oauth2.clientSecret = await decrypt(encrypted.oauth2.clientSecretEncrypted);
    }
    if (encrypted.oauth2.accessTokenEncrypted) {
      config.oauth2.accessToken = await decrypt(encrypted.oauth2.accessTokenEncrypted);
    }
    if (encrypted.oauth2.refreshTokenEncrypted) {
      config.oauth2.refreshToken = await decrypt(encrypted.oauth2.refreshTokenEncrypted);
    }
  }

  if (encrypted.envVarsEncrypted) {
    config.envVars = {};
    for (const [key, value] of Object.entries(encrypted.envVarsEncrypted)) {
      config.envVars[key] = await decrypt(value);
    }
  }

  if (encrypted.headersEncrypted) {
    config.headers = {};
    for (const [key, value] of Object.entries(encrypted.headersEncrypted)) {
      config.headers[key] = await decrypt(value);
    }
  }

  return config;
}

export async function encryptEnvironment(env: Record<string, string>): Promise<Record<string, string>> {
  const encrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    encrypted[key] = await encrypt(value);
  }
  return encrypted;
}

export async function decryptEnvironment(encrypted: Record<string, string>): Promise<Record<string, string>> {
  const decrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(encrypted)) {
    decrypted[key] = await decrypt(value);
  }
  return decrypted;
}

export interface McpServerWithDecryptedAuth {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  type: string;
  command: string | null;
  args: string[];
  url: string | null;
  authType: McpAuthType;
  authConfig: McpAuthConfig;
  environment: Record<string, string>;
  metamcpServerId: string | null;
  enabled: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function getServerWithDecryptedAuth(
  serverId: string, 
  userId: string
): Promise<McpServerWithDecryptedAuth | null> {
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.userId, userId)));

  if (!server) {
    return null;
  }

  const rawAuthConfig = server.authConfig as Record<string, unknown> | null;
  const encryptedConfig: EncryptedAuthConfig = rawAuthConfig 
    ? { type: (rawAuthConfig.type as McpAuthType) || 'none', ...rawAuthConfig }
    : { type: 'none' };
  const authConfig = await decryptAuthConfig(encryptedConfig);
  const environment = server.environment 
    ? await decryptEnvironment(server.environment as Record<string, string>)
    : {};

  return {
    id: server.id,
    userId: server.userId,
    name: server.name,
    description: server.description,
    type: server.type,
    command: server.command,
    args: server.args as string[],
    url: server.url,
    authType: server.authType as McpAuthType,
    authConfig,
    environment,
    metamcpServerId: server.metamcpServerId,
    enabled: server.enabled,
    isPublic: server.isPublic,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

const API_KEY_PREFIX = 'sk_mcp_';
const API_KEY_LENGTH = 32;

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = API_KEY_PREFIX;
  for (let i = 0; i < API_KEY_LENGTH; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface CreateApiKeyResult {
  id: string;
  key: string;
  keyPrefix: string;
}

export async function createMcpApiKey(
  userId: string,
  endpointId: string | null,
  description?: string,
  scopes?: string[],
  expiresAt?: Date
): Promise<CreateApiKeyResult> {
  const key = generateApiKey();
  const keyHash = await hashApiKey(key);
  const keyPrefix = key.slice(0, API_KEY_PREFIX.length + 8);
  const id = crypto.randomUUID();

  await db.insert(mcpApiKeys).values({
    id,
    userId,
    endpointId,
    keyHash,
    keyPrefix,
    description: description || null,
    scopes: scopes || [],
    expiresAt: expiresAt || null,
    createdAt: new Date(),
  });

  log.info('MCP API key created', { userId, endpointId, keyPrefix });

  return { id, key, keyPrefix };
}

export async function validateMcpApiKey(key: string): Promise<{ valid: boolean; userId?: string; endpointId?: string | null }> {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return { valid: false };
  }

  const keyHash = await hashApiKey(key);

  const [apiKey] = await db
    .select()
    .from(mcpApiKeys)
    .where(eq(mcpApiKeys.keyHash, keyHash));

  if (!apiKey) {
    return { valid: false };
  }

  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return { valid: false };
  }

  await db
    .update(mcpApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpApiKeys.id, apiKey.id));

  return { 
    valid: true, 
    userId: apiKey.userId, 
    endpointId: apiKey.endpointId 
  };
}

export async function revokeMcpApiKey(userId: string, keyId: string): Promise<boolean> {
  const result = await db
    .delete(mcpApiKeys)
    .where(and(eq(mcpApiKeys.id, keyId), eq(mcpApiKeys.userId, userId)))
    .returning({ id: mcpApiKeys.id });

  if (result.length > 0) {
    log.info('MCP API key revoked', { userId, keyId });
    return true;
  }

  return false;
}

export async function listMcpApiKeys(userId: string, endpointId?: string) {
  const whereClause = endpointId
    ? and(eq(mcpApiKeys.userId, userId), eq(mcpApiKeys.endpointId, endpointId))
    : eq(mcpApiKeys.userId, userId);

  return db
    .select({
      id: mcpApiKeys.id,
      keyPrefix: mcpApiKeys.keyPrefix,
      description: mcpApiKeys.description,
      scopes: mcpApiKeys.scopes,
      endpointId: mcpApiKeys.endpointId,
      expiresAt: mcpApiKeys.expiresAt,
      lastUsedAt: mcpApiKeys.lastUsedAt,
      createdAt: mcpApiKeys.createdAt,
    })
    .from(mcpApiKeys)
    .where(whereClause);
}
