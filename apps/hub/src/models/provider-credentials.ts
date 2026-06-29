/**
 * Provider Credentials Model
 * 
 * Manages encrypted storage of LLM provider credentials (API keys, OAuth tokens).
 * Credentials are stored per-user - each user has their own set of provider credentials.
 */

import { db } from '../db/drizzle';
import { providerCredentials } from '../db/schema/providers';
import { eq, and } from 'drizzle-orm';
import { encrypt, decrypt } from '../utils/encryption.ts';
import { createLogger } from '../utils/logger.ts';
import type { AuthType } from '../services/models-dev.ts';

const log = createLogger('provider-credentials');

// =============================================================================
// Types
// =============================================================================

export interface ProviderCredential {
  id: string;
  userId: string;
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

// Database row type from Drizzle schema
type CredentialRow = typeof providerCredentials.$inferSelect;

export interface SaveApiKeyInput {
  userId: string;
  providerId: string;
  apiKey: string;
}

export interface SaveOAuthTokenInput {
  userId: string;
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
 * Get a credential by user ID and provider ID (decrypts sensitive fields)
 */
export async function getCredential(userId: string, providerId: string): Promise<ProviderCredential | null> {
  const [row] = await db.select()
    .from(providerCredentials)
    .where(and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.providerId, providerId)
    ));

  if (!row) {
    return null;
  }

  return await decryptCredential(row);
}

/**
 * Get all configured provider IDs for a user (without decrypting)
 */
export async function getConfiguredProviderIds(userId: string): Promise<string[]> {
  const rows = await db.select({ providerId: providerCredentials.providerId })
    .from(providerCredentials)
    .where(eq(providerCredentials.userId, userId));

  return rows.map(r => r.providerId);
}

/**
 * Check if a provider is configured for a user
 */
export async function isProviderConfigured(userId: string, providerId: string): Promise<boolean> {
  const [row] = await db.select({ id: providerCredentials.id })
    .from(providerCredentials)
    .where(and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.providerId, providerId)
    ))
    .limit(1);

  return row !== undefined;
}

/**
 * Save an API key credential (encrypts before storage)
 */
export async function saveApiKey(input: SaveApiKeyInput): Promise<void> {
  const { userId, providerId, apiKey } = input;

  log.info('Saving API key credential', { userId, providerId });

  // Encrypt the API key
  const apiKeyEncrypted = await encrypt(apiKey);

  // Check if credential exists for this user+provider
  const [existing] = await db.select({ id: providerCredentials.id })
    .from(providerCredentials)
    .where(and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.providerId, providerId)
    ));

  if (existing) {
    // Update existing
    await db.update(providerCredentials)
      .set({
        apiKeyEncrypted,
        authType: 'api_key',
        updatedAt: new Date(),
      })
      .where(and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.providerId, providerId)
      ));
  } else {
    // Insert new
    const id = crypto.randomUUID();
    await db.insert(providerCredentials)
      .values({
        id,
        userId,
        providerId,
        authType: 'api_key',
        apiKeyEncrypted,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
  }

  log.info('API key credential saved', { userId, providerId });
}

/**
 * Save OAuth tokens (encrypts before storage)
 */
export async function saveOAuthToken(input: SaveOAuthTokenInput): Promise<void> {
  const { userId, providerId, accessToken, refreshToken, expiresAt, oauthProvider, scopes } = input;

  log.info('Saving OAuth token credential', { userId, providerId, oauthProvider });

  // Encrypt tokens
  const accessTokenEncrypted = await encrypt(accessToken);
  const refreshTokenEncrypted = refreshToken ? await encrypt(refreshToken) : null;
  const oauthScopesJson = scopes ? JSON.stringify(scopes) : null;

  // Check if credential exists for this user+provider
  const [existing] = await db.select({ id: providerCredentials.id })
    .from(providerCredentials)
    .where(and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.providerId, providerId)
    ));

  if (existing) {
    // Update existing
    await db.update(providerCredentials)
      .set({
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiresAt: expiresAt || null,
        oauthProvider: oauthProvider || null,
        oauthScopes: oauthScopesJson,
        authType: 'oauth',
        updatedAt: new Date(),
      })
      .where(and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.providerId, providerId)
      ));
  } else {
    // Insert new
    const id = crypto.randomUUID();
    await db.insert(providerCredentials)
      .values({
        id,
        userId,
        providerId,
        authType: 'oauth',
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiresAt: expiresAt || null,
        oauthProvider: oauthProvider || null,
        oauthScopes: oauthScopesJson,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
  }

  log.info('OAuth token credential saved', { userId, providerId });
}

/**
 * Delete a credential for a specific user and provider
 */
export async function deleteCredential(userId: string, providerId: string): Promise<boolean> {
  log.info('Deleting credential', { userId, providerId });

  const result = await db.delete(providerCredentials)
    .where(and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.providerId, providerId)
    ))
    .returning({ id: providerCredentials.id });

  const deleted = result.length > 0;
  
  if (deleted) {
    log.info('Credential deleted', { userId, providerId });
  } else {
    log.warn('Credential not found', { userId, providerId });
  }

  return deleted;
}

/**
 * Delete all credentials for a user (used during account deletion)
 */
export async function deleteAllUserCredentials(userId: string): Promise<number> {
  log.info('Deleting all credentials for user', { userId });

  const result = await db.delete(providerCredentials)
    .where(eq(providerCredentials.userId, userId))
    .returning({ id: providerCredentials.id });

  log.info('Deleted user credentials', { userId, count: result.length });
  return result.length;
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
 * Get all credentials for a user (decrypts all)
 */
export async function getAllUserCredentials(userId: string): Promise<ProviderCredential[]> {
  const rows = await db.select()
    .from(providerCredentials)
    .where(eq(providerCredentials.userId, userId));
  
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
    userId: row.userId,
    providerId: row.providerId,
    authType: row.authType as AuthType,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() || undefined,
    oauthProvider: row.oauthProvider || undefined,
    oauthScopes: row.oauthScopes ? JSON.parse(row.oauthScopes) : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  // Decrypt sensitive fields
  if (row.apiKeyEncrypted) {
    credential.apiKey = await decrypt(row.apiKeyEncrypted);
  }
  if (row.accessTokenEncrypted) {
    credential.accessToken = await decrypt(row.accessTokenEncrypted);
  }
  if (row.refreshTokenEncrypted) {
    credential.refreshToken = await decrypt(row.refreshTokenEncrypted);
  }

  return credential;
}
