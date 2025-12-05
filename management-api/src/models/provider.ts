import { db } from '../db/index.ts';

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
  const params: Record<string, unknown> = { $id: id };
  
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
 */
export function getProviderEnvVars(providerId?: string): Record<string, string> {
  const provider = providerId 
    ? getProviderById(providerId) 
    : getDefaultProvider();
  
  if (!provider || !provider.isConfigured) {
    return {};
  }
  
  const envVarMap: Record<string, string> = {
    'anthropic': 'ANTHROPIC_API_KEY',
    'openai': 'OPENAI_API_KEY',
    'openrouter': 'OPENROUTER_API_KEY',
    'google': 'GOOGLE_GENERATIVE_AI_API_KEY',
    'amazon-bedrock': 'AWS_ACCESS_KEY_ID', // Bedrock needs multiple vars
    'github-copilot': 'GITHUB_TOKEN',
  };
  
  const envVar = envVarMap[provider.id];
  if (!envVar) {
    return {};
  }
  
  // For API key providers
  if (provider.type === 'api_key' && provider.apiKey) {
    return { [envVar]: provider.apiKey };
  }
  
  // For OAuth providers
  if (provider.type === 'oauth' && provider.accessToken) {
    return { [envVar]: provider.accessToken };
  }
  
  return {};
}

/**
 * Check if any provider is configured
 */
export function hasConfiguredProvider(): boolean {
  const row = db.query('SELECT 1 FROM providers WHERE is_configured = 1 LIMIT 1').get();
  return !!row;
}
