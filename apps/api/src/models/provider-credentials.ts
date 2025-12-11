/**
 * Provider Credentials Model
 * 
 * Manages encrypted storage of LLM provider credentials (API keys, OAuth tokens).
 * Credentials are global and shared across all projects.
 */

import { db } from '../db/index.ts';
import { encrypt, decrypt } from '../utils/encryption.ts';
import { createLogger } from '../utils/logger.ts';
import type { AuthType } from '../services/models-dev.ts';

const log = createLogger('provider-credentials');

// =============================================================================
// Types
// =============================================================================

export interface ProviderCredential {
  id: string;
  providerId: string;
  authType: AuthType;
  
  // Decrypted values (only populated after calling get/decrypt)
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  
  // Token expiry
  tokenExpiresAt?: string;
  
  // OAuth metadata
  oauthProvider?: string;
  oauthScopes?: string[];
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Database row type (encrypted fields)
interface CredentialRow {
  id: string;
  provider_id: string;
  auth_type: string;
  api_key_encrypted: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  oauth_provider: string | null;
  oauth_scopes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveApiKeyInput {
  providerId: string;
  apiKey: string;
}

export interface SaveOAuthTokenInput {
  providerId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  oauthProvider?: string;
  scopes?: string[];
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Get a credential by provider ID (decrypts sensitive fields)
 */
export async function getCredential(providerId: string): Promise<ProviderCredential | null> {
  const row = db.query(`
    SELECT * FROM provider_credentials WHERE provider_id = $providerId
  `).get({ $providerId: providerId }) as CredentialRow | null;

  if (!row) {
    return null;
  }

  return await decryptCredential(row);
}

/**
 * Get all configured provider IDs (without decrypting)
 */
export function getConfiguredProviderIds(): string[] {
  const rows = db.query(`
    SELECT provider_id FROM provider_credentials
  `).all() as Array<{ provider_id: string }>;

  return rows.map(r => r.provider_id);
}

/**
 * Check if a provider is configured
 */
export function isProviderConfigured(providerId: string): boolean {
  const row = db.query(`
    SELECT 1 FROM provider_credentials WHERE provider_id = $providerId
  `).get({ $providerId: providerId });

  return row !== null;
}

/**
 * Save an API key credential (encrypts before storage)
 */
export async function saveApiKey(input: SaveApiKeyInput): Promise<void> {
  const { providerId, apiKey } = input;

  log.info('Saving API key credential', { providerId });

  // Encrypt the API key
  const apiKeyEncrypted = await encrypt(apiKey);

  // Check if credential exists
  const existing = db.query(`
    SELECT id FROM provider_credentials WHERE provider_id = $providerId
  `).get({ $providerId: providerId }) as { id: string } | null;

  if (existing) {
    // Update existing
    db.query(`
      UPDATE provider_credentials 
      SET api_key_encrypted = $apiKey,
          auth_type = 'api_key',
          updated_at = datetime('now')
      WHERE provider_id = $providerId
    `).run({
      $providerId: providerId,
      $apiKey: apiKeyEncrypted,
    });
  } else {
    // Insert new
    const id = crypto.randomUUID();
    db.query(`
      INSERT INTO provider_credentials (id, provider_id, auth_type, api_key_encrypted)
      VALUES ($id, $providerId, 'api_key', $apiKey)
    `).run({
      $id: id,
      $providerId: providerId,
      $apiKey: apiKeyEncrypted,
    });
  }

  log.info('API key credential saved', { providerId });
}

/**
 * Save OAuth tokens (encrypts before storage)
 */
export async function saveOAuthToken(input: SaveOAuthTokenInput): Promise<void> {
  const { providerId, accessToken, refreshToken, expiresAt, oauthProvider, scopes } = input;

  log.info('Saving OAuth token credential', { providerId, oauthProvider });

  // Encrypt tokens
  const accessTokenEncrypted = await encrypt(accessToken);
  const refreshTokenEncrypted = refreshToken ? await encrypt(refreshToken) : null;
  const tokenExpiresAt = expiresAt ? expiresAt.toISOString() : null;
  const oauthScopesJson = scopes ? JSON.stringify(scopes) : null;

  // Check if credential exists
  const existing = db.query(`
    SELECT id FROM provider_credentials WHERE provider_id = $providerId
  `).get({ $providerId: providerId }) as { id: string } | null;

  if (existing) {
    // Update existing
    db.query(`
      UPDATE provider_credentials 
      SET access_token_encrypted = $accessToken,
          refresh_token_encrypted = $refreshToken,
          token_expires_at = $expiresAt,
          oauth_provider = $oauthProvider,
          oauth_scopes = $scopes,
          auth_type = 'oauth',
          updated_at = datetime('now')
      WHERE provider_id = $providerId
    `).run({
      $providerId: providerId,
      $accessToken: accessTokenEncrypted,
      $refreshToken: refreshTokenEncrypted,
      $expiresAt: tokenExpiresAt,
      $oauthProvider: oauthProvider || null,
      $scopes: oauthScopesJson,
    });
  } else {
    // Insert new
    const id = crypto.randomUUID();
    db.query(`
      INSERT INTO provider_credentials (
        id, provider_id, auth_type, 
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        oauth_provider, oauth_scopes
      )
      VALUES ($id, $providerId, 'oauth', $accessToken, $refreshToken, $expiresAt, $oauthProvider, $scopes)
    `).run({
      $id: id,
      $providerId: providerId,
      $accessToken: accessTokenEncrypted,
      $refreshToken: refreshTokenEncrypted,
      $expiresAt: tokenExpiresAt,
      $oauthProvider: oauthProvider || null,
      $scopes: oauthScopesJson,
    });
  }

  log.info('OAuth token credential saved', { providerId });
}

/**
 * Delete a credential
 */
export function deleteCredential(providerId: string): boolean {
  log.info('Deleting credential', { providerId });

  const result = db.query(`
    DELETE FROM provider_credentials WHERE provider_id = $providerId
  `).run({ $providerId: providerId });

  // Bun sqlite returns changes as a property
  const deleted = (result as unknown as { changes: number }).changes > 0;
  
  if (deleted) {
    log.info('Credential deleted', { providerId });
  } else {
    log.warn('Credential not found', { providerId });
  }

  return deleted;
}

/**
 * Check if an OAuth token needs refresh
 */
export function isTokenExpired(credential: ProviderCredential, bufferMinutes = 5): boolean {
  if (!credential.tokenExpiresAt) {
    return false; // No expiry set, assume valid
  }

  const expiresAt = new Date(credential.tokenExpiresAt);
  const buffer = bufferMinutes * 60 * 1000; // Convert to ms
  
  return Date.now() > expiresAt.getTime() - buffer;
}

/**
 * Get all credentials for container auth injection (decrypts all)
 */
export async function getAllCredentials(): Promise<ProviderCredential[]> {
  const rows = db.query(`SELECT * FROM provider_credentials`).all() as CredentialRow[];
  
  const credentials = await Promise.all(rows.map(row => decryptCredential(row)));
  return credentials;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Decrypt a credential row from the database
 */
async function decryptCredential(row: CredentialRow): Promise<ProviderCredential> {
  const credential: ProviderCredential = {
    id: row.id,
    providerId: row.provider_id,
    authType: row.auth_type as AuthType,
    tokenExpiresAt: row.token_expires_at || undefined,
    oauthProvider: row.oauth_provider || undefined,
    oauthScopes: row.oauth_scopes ? JSON.parse(row.oauth_scopes) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Decrypt sensitive fields
  if (row.api_key_encrypted) {
    credential.apiKey = await decrypt(row.api_key_encrypted);
  }
  if (row.access_token_encrypted) {
    credential.accessToken = await decrypt(row.access_token_encrypted);
  }
  if (row.refresh_token_encrypted) {
    credential.refreshToken = await decrypt(row.refresh_token_encrypted);
  }

  return credential;
}
