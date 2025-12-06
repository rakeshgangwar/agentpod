import { db } from '../db/index.ts';
import { getCredential } from './provider-credentials.ts';
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

interface ProviderRow {
  id: string;
  name: string;
  type: string;
  api_key: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  is_default: number;
  is_configured: number;
  created_at: string;
  updated_at: string;
}

function rowToProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderType,
    apiKey: row.api_key,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    isDefault: row.is_default === 1,
    isConfigured: row.is_configured === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSummary(row: ProviderRow): ProviderSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderType,
    isDefault: row.is_default === 1,
    isConfigured: row.is_configured === 1,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get provider by ID
 */
export function getProviderById(id: string): Provider | null {
  const row = db.query('SELECT * FROM providers WHERE id = $id').get({ $id: id }) as ProviderRow | null;
  return row ? rowToProvider(row) : null;
}

/**
 * List all providers (summary only, no credentials)
 */
export function listProviders(): ProviderSummary[] {
  const rows = db.query('SELECT * FROM providers ORDER BY name').all() as ProviderRow[];
  return rows.map(rowToSummary);
}

/**
 * Get default provider
 */
export function getDefaultProvider(): Provider | null {
  const row = db.query('SELECT * FROM providers WHERE is_default = 1').get() as ProviderRow | null;
  return row ? rowToProvider(row) : null;
}

/**
 * Configure provider credentials
 */
export function configureProvider(id: string, input: ConfigureProviderInput): Provider | null {
  const provider = getProviderById(id);
  if (!provider) {
    return null;
  }
  
  const updates: string[] = [];
  const params: Record<string, string | number | null> = { $id: id };
  
  if (input.apiKey !== undefined) {
    updates.push('api_key = $apiKey');
    params.$apiKey = input.apiKey;
  }
  if (input.accessToken !== undefined) {
    updates.push('access_token = $accessToken');
    params.$accessToken = input.accessToken;
  }
  if (input.refreshToken !== undefined) {
    updates.push('refresh_token = $refreshToken');
    params.$refreshToken = input.refreshToken;
  }
  if (input.tokenExpiresAt !== undefined) {
    updates.push('token_expires_at = $tokenExpiresAt');
    params.$tokenExpiresAt = input.tokenExpiresAt;
  }
  
  // Mark as configured if we have credentials
  const hasCredentials = input.apiKey || input.accessToken;
  if (hasCredentials) {
    updates.push('is_configured = 1');
  }
  
  updates.push("updated_at = datetime('now')");
  
  const sql = `UPDATE providers SET ${updates.join(', ')} WHERE id = $id`;
  db.query(sql).run(params);
  
  return getProviderById(id);
}

/**
 * Set provider as default
 */
export function setDefaultProvider(id: string): Provider | null {
  const provider = getProviderById(id);
  if (!provider) {
    return null;
  }
  
  // Clear existing default
  db.query('UPDATE providers SET is_default = 0').run();
  
  // Set new default
  db.query("UPDATE providers SET is_default = 1, updated_at = datetime('now') WHERE id = $id").run({ $id: id });
  
  return getProviderById(id);
}

/**
 * Remove provider configuration (keep the provider, just clear credentials)
 */
export function removeProviderConfig(id: string): Provider | null {
  const provider = getProviderById(id);
  if (!provider) {
    return null;
  }
  
  db.query(`
    UPDATE providers 
    SET api_key = NULL, 
        access_token = NULL, 
        refresh_token = NULL, 
        token_expires_at = NULL,
        is_configured = 0,
        is_default = 0,
        updated_at = datetime('now')
    WHERE id = $id
  `).run({ $id: id });
  
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
export async function getProviderEnvVars(providerId?: string): Promise<Record<string, string>> {
  // If no providerId specified, try to get from settings
  const targetProviderId = providerId ?? getSetting('default_provider');
  
  const envVars: Record<string, string> = {};
  
  // Always build the full auth.json with all configured providers
  // This allows OpenCode to access all providers, not just the default one
  const authJson = await buildOpenCodeAuthJson();
  if (authJson && authJson !== '{}') {
    envVars['OPENCODE_AUTH_JSON'] = authJson;
  }
  
  if (!targetProviderId) {
    return envVars;
  }
  
  // Get decrypted credentials
  const credential = await getCredential(targetProviderId);
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
export function hasConfiguredProvider(): boolean {
  const row = db.query('SELECT 1 FROM providers WHERE is_configured = 1 LIMIT 1').get();
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
 * @param providerId - Optional specific provider, otherwise includes all configured
 * @returns JSON string for auth.json content
 */
export async function buildOpenCodeAuthJson(providerId?: string): Promise<string> {
  const authJson: Record<string, OpenCodeAuthEntry> = {};
  
  if (providerId) {
    // Get specific provider credential
    const credential = await getCredential(providerId);
    if (credential) {
      authJson[providerId] = credentialToAuthEntry(credential);
    }
  } else {
    // Get all configured credentials
    const { getAllCredentials } = await import('./provider-credentials.ts');
    const allCredentials = await getAllCredentials();
    
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
export function getSetting(key: string): string | null {
  const row = db.query(
    'SELECT value FROM settings WHERE key = $key'
  ).get({ $key: key }) as { value: string } | null;
  return row?.value || null;
}

/**
 * Set a setting value
 */
export function setSetting(key: string, value: string): void {
  db.query(`
    INSERT INTO settings (key, value, updated_at) 
    VALUES ($key, $value, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = $value, updated_at = datetime('now')
  `).run({ $key: key, $value: value });
}
