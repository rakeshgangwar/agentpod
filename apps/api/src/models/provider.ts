import { db } from '../db/drizzle';
import { providers } from '../db/schema/providers';
import { settings } from '../db/schema/settings';
import { eq } from 'drizzle-orm';
import { getCredential, getAllUserCredentials } from './provider-credentials.ts';
import { modelsDev } from '../services/models-dev.ts';

// =============================================================================
// Types
// =============================================================================

export type ProviderType = 'api_key' | 'oauth';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  isDefault: boolean;
  isConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  type: ProviderType;
  isDefault: boolean;
  isConfigured: boolean;
}

export interface ConfigureProviderInput {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
}

// =============================================================================
// Database Row Mapping
// =============================================================================

type ProviderRow = typeof providers.$inferSelect;

function rowToProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderType,
    apiKey: row.apiKey,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    isDefault: row.isDefault ?? false,
    isConfigured: row.isConfigured ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToSummary(row: ProviderRow): ProviderSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderType,
    isDefault: row.isDefault ?? false,
    isConfigured: row.isConfigured ?? false,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get provider by ID
 */
export async function getProviderById(id: string): Promise<Provider | null> {
  const [row] = await db.select().from(providers).where(eq(providers.id, id));
  return row ? rowToProvider(row) : null;
}

/**
 * List all providers (summary only, no credentials)
 */
export async function listProviders(): Promise<ProviderSummary[]> {
  const rows = await db.select().from(providers).orderBy(providers.name);
  return rows.map(rowToSummary);
}

/**
 * Get default provider
 */
export async function getDefaultProvider(): Promise<Provider | null> {
  const [row] = await db.select().from(providers).where(eq(providers.isDefault, true));
  return row ? rowToProvider(row) : null;
}

/**
 * Configure provider credentials
 */
export async function configureProvider(id: string, input: ConfigureProviderInput): Promise<Provider | null> {
  const provider = await getProviderById(id);
  if (!provider) {
    return null;
  }
  
  const updates: Partial<typeof providers.$inferInsert> = {
    updatedAt: new Date(),
  };
  
  if (input.apiKey !== undefined) {
    updates.apiKey = input.apiKey;
  }
  if (input.accessToken !== undefined) {
    updates.accessToken = input.accessToken;
  }
  if (input.refreshToken !== undefined) {
    updates.refreshToken = input.refreshToken;
  }
  if (input.tokenExpiresAt !== undefined) {
    updates.tokenExpiresAt = input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null;
  }
  
  // Mark as configured if we have credentials
  const hasCredentials = input.apiKey || input.accessToken;
  if (hasCredentials) {
    updates.isConfigured = true;
  }
  
  await db.update(providers).set(updates).where(eq(providers.id, id));
  
  return getProviderById(id);
}

/**
 * Set provider as default
 */
export async function setDefaultProvider(id: string): Promise<Provider | null> {
  const provider = await getProviderById(id);
  if (!provider) {
    return null;
  }
  
  // Clear existing default
  await db.update(providers).set({ isDefault: false });
  
  // Set new default
  await db.update(providers).set({ 
    isDefault: true, 
    updatedAt: new Date() 
  }).where(eq(providers.id, id));
  
  return getProviderById(id);
}

/**
 * Remove provider configuration (keep the provider, just clear credentials)
 */
export async function removeProviderConfig(id: string): Promise<Provider | null> {
  const provider = await getProviderById(id);
  if (!provider) {
    return null;
  }
  
  await db.update(providers).set({
    apiKey: null,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    isConfigured: false,
    isDefault: false,
    updatedAt: new Date(),
  }).where(eq(providers.id, id));
  
  return getProviderById(id);
}

/**
 * Get environment variables for a provider (to inject into containers)
 * Uses encrypted credentials from provider_credentials table
 * and env var names from Models.dev API
 * 
 * Also includes OPENCODE_AUTH_JSON with the full auth.json content
 * for the OpenCode container to use.
 */
export async function getProviderEnvVars(userId: string, providerId?: string): Promise<Record<string, string>> {
  // If no providerId specified, try to get from settings
  const targetProviderId = providerId ?? await getSetting('default_provider');
  
  const envVars: Record<string, string> = {};
  
  // Always build the full auth.json with all configured providers for this user
  // This allows OpenCode to access all providers, not just the default one
  const authJson = await buildOpenCodeAuthJson(userId);
  if (authJson && authJson !== '{}') {
    envVars['OPENCODE_AUTH_JSON'] = authJson;
  }
  
  if (!targetProviderId) {
    return envVars;
  }
  
  // Get decrypted credentials for this user
  const credential = await getCredential(userId, targetProviderId);
  if (!credential) {
    return envVars;
  }
  
  // Get env var name from Models.dev
  const provider = await modelsDev.getProvider(targetProviderId);
  
  // Use the env var from Models.dev if available
  const envVar = provider?.apiKeyEnvVar;
  if (!envVar) {
    return envVars;
  }
  
  // Return the appropriate credential (for backwards compatibility with other tools)
  if (credential.authType === 'api_key' && credential.apiKey) {
    envVars[envVar] = credential.apiKey;
  } else if ((credential.authType === 'oauth' || credential.authType === 'device_flow') && credential.accessToken) {
    envVars[envVar] = credential.accessToken;
  }
  
  return envVars;
}

/**
 * Check if any provider is configured
 */
export async function hasConfiguredProvider(): Promise<boolean> {
  const [row] = await db.select({ id: providers.id })
    .from(providers)
    .where(eq(providers.isConfigured, true))
    .limit(1);
  return !!row;
}

/**
 * OpenCode auth.json entry format
 */
interface OpenCodeAuthEntry {
  type: 'api' | 'oauth';
  key?: string;       // For API key auth
  refresh?: string;   // For OAuth (the token we received)
  access?: string;    // For OAuth (same as refresh for device flow)
  expires?: number;   // Token expiry timestamp in ms
}

/**
 * Build the auth.json content for OpenCode container
 * This is the format OpenCode expects in ~/.local/share/opencode/auth.json
 * 
 * @param userId - The user to build auth.json for
 * @param providerId - Optional specific provider, otherwise includes all configured
 * @returns JSON string for auth.json content
 */
export async function buildOpenCodeAuthJson(userId: string, providerId?: string): Promise<string> {
  const authJson: Record<string, OpenCodeAuthEntry> = {};
  
  if (providerId) {
    // Get specific provider credential for this user
    const credential = await getCredential(userId, providerId);
    if (credential) {
      authJson[providerId] = credentialToAuthEntry(credential);
    }
  } else {
    // Get all configured credentials for this user
    const allCredentials = await getAllUserCredentials(userId);
    
    for (const credential of allCredentials) {
      authJson[credential.providerId] = credentialToAuthEntry(credential);
    }
  }
  
  return JSON.stringify(authJson);
}

/**
 * Convert a ProviderCredential to OpenCode auth.json entry format
 */
function credentialToAuthEntry(credential: Awaited<ReturnType<typeof getCredential>>): OpenCodeAuthEntry {
  if (!credential) {
    return { type: 'api' };
  }
  
  if (credential.authType === 'api_key' && credential.apiKey) {
    return {
      type: 'api',
      key: credential.apiKey,
    };
  }
  
  if ((credential.authType === 'oauth' || credential.authType === 'device_flow') && credential.accessToken) {
    // For device flow (like GitHub Copilot), the access token is also used as refresh token
    return {
      type: 'oauth',
      refresh: credential.accessToken,
      access: credential.accessToken,
      expires: credential.tokenExpiresAt 
        ? new Date(credential.tokenExpiresAt).getTime() 
        : 0,
    };
  }
  
  return { type: 'api' };
}

// =============================================================================
// Settings Operations
// =============================================================================

/**
 * Get a setting value
 */
export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  return row?.value ?? null;
}

/**
 * Set a setting value
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(settings)
    .values({
      key,
      value,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value,
        updatedAt: new Date(),
      },
    });
}
