/**
 * Anthropic OAuth Service
 * 
 * Implements OAuth 2.0 with PKCE for Claude Code / Anthropic authentication.
 * Based on OpenCode's opencode-anthropic-auth plugin.
 * 
 * Two authentication modes:
 * - "max": Claude Pro/Max subscription via claude.ai (free API access for Max users)
 * - "console": API Console via console.anthropic.com (creates API key, pay-per-use)
 * 
 * OAuth Flow (PKCE):
 * 1. Generate PKCE code_verifier and code_challenge
 * 2. User visits authorization URL with challenge
 * 3. User authenticates and gets redirected to callback with authorization code
 * 4. Exchange authorization code + verifier for tokens
 * 5. Optionally create permanent API key from OAuth tokens
 * 
 * Reference: https://github.com/sst/opencode-anthropic-auth
 */

import { db } from '../../db/index.ts';
import { createLogger } from '../../utils/logger.ts';
import { saveOAuthToken, saveApiKey } from '../../models/provider-credentials.ts';

const log = createLogger('anthropic-oauth');

// =============================================================================
// Constants
// =============================================================================

// Shared client ID (from OpenCode's opencode-anthropic-auth)
const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

// OAuth endpoints
const CONSOLE_AUTH_URL = 'https://console.anthropic.com/oauth/authorize';
const CLAUDE_AI_AUTH_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const API_KEY_ENDPOINT = 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key';

// Redirect URI (Anthropic's callback page that displays the code)
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';

// OAuth scopes
const SCOPES = 'org:create_api_key user:profile user:inference';

// Required beta headers when using OAuth tokens
const OAUTH_BETA_HEADERS = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
];

// =============================================================================
// Types
// =============================================================================

export type AnthropicAuthMode = 'max' | 'console';

export interface PKCEPair {
  challenge: string;
  verifier: string;
}

export interface AnthropicAuthInit {
  id: string;
  authUrl: string;
  mode: AnthropicAuthMode;
  expiresAt: Date;
}

export interface AnthropicAuthStatus {
  status: 'pending' | 'completed' | 'expired' | 'error';
  error?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface ApiKeyResponse {
  raw_key: string;
}

// Database row type
interface OAuthStateRow {
  id: string;
  provider_id: string;
  pkce_verifier: string;
  auth_mode: string;
  expires_at: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

// =============================================================================
// PKCE Utilities
// =============================================================================

/**
 * Generate a cryptographically random string for PKCE
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues)
    .map(v => charset[v % charset.length])
    .join('');
}

/**
 * Generate SHA-256 hash and base64url encode it
 */
async function sha256Base64Url(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  // Convert to base64url
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate PKCE code_verifier and code_challenge pair
 */
async function generatePKCE(): Promise<PKCEPair> {
  // Generate a random code_verifier (43-128 characters)
  const verifier = generateRandomString(64);
  
  // Generate code_challenge = base64url(sha256(verifier))
  const challenge = await sha256Base64Url(verifier);
  
  return { verifier, challenge };
}

// =============================================================================
// Service
// =============================================================================

export const anthropicOAuth = {
  /**
   * Initialize OAuth flow for Anthropic
   * 
   * @param mode - 'max' for Claude Pro/Max users, 'console' for API key creation
   * @returns Auth init response with URL to redirect user to
   */
  async initAuth(mode: AnthropicAuthMode = 'console'): Promise<AnthropicAuthInit> {
    log.info('Initiating Anthropic OAuth flow', { mode });

    // Generate PKCE pair
    const pkce = await generatePKCE();

    // Build authorization URL
    const baseUrl = mode === 'console' ? CONSOLE_AUTH_URL : CLAUDE_AI_AUTH_URL;
    const url = new URL(baseUrl);
    url.searchParams.set('code', 'true');
    url.searchParams.set('client_id', ANTHROPIC_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', pkce.verifier);

    // Calculate expiry (10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Generate state ID
    const id = crypto.randomUUID();

    // Store in database for later verification
    // Note: device_code, user_code, verification_uri have NOT NULL constraints
    // from original migration, so we provide empty strings for PKCE flows
    db.query(`
      INSERT INTO oauth_state (
        id, provider_id, device_code, user_code, verification_uri,
        pkce_verifier, auth_mode, expires_at, status
      )
      VALUES ($id, $providerId, '', '', '', $verifier, $mode, $expiresAt, 'pending')
    `).run({
      $id: id,
      $providerId: 'anthropic',
      $verifier: pkce.verifier,
      $mode: mode,
      $expiresAt: expiresAt.toISOString(),
    });

    log.info('Anthropic OAuth flow initiated', { id, mode });

    return {
      id,
      authUrl: url.toString(),
      mode,
      expiresAt,
    };
  },

  /**
   * Exchange authorization code for tokens
   * 
   * @param stateId - The state ID from initAuth
   * @param code - The authorization code from Anthropic callback (format: "code#state")
   * @returns Status of the exchange
   */
  async exchangeCode(stateId: string, code: string): Promise<AnthropicAuthStatus> {
    log.info('Exchanging authorization code', { stateId });

    // Get OAuth state from database
    const state = db.query(`
      SELECT * FROM oauth_state WHERE id = $id AND provider_id = 'anthropic'
    `).get({ $id: stateId }) as OAuthStateRow | null;

    if (!state) {
      return { status: 'error', error: 'Invalid state ID' };
    }

    // Check if expired
    const expiresAt = new Date(state.expires_at);
    if (Date.now() > expiresAt.getTime()) {
      this.updateState(stateId, 'expired');
      return { status: 'expired', error: 'OAuth flow expired' };
    }

    // Check if already completed
    if (state.status === 'completed') {
      return { status: 'completed' };
    }

    try {
      // Parse the code (format: "authcode#state")
      const [authCode, codeState] = code.includes('#') 
        ? code.split('#') 
        : [code, state.pkce_verifier];

      // Exchange code for tokens
      const tokenResponse = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: authCode,
          state: codeState,
          grant_type: 'authorization_code',
          client_id: ANTHROPIC_CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          code_verifier: state.pkce_verifier,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        log.error('Token exchange failed', { status: tokenResponse.status, error: errorText });
        this.updateState(stateId, 'error', 'Token exchange failed');
        return { status: 'error', error: 'Token exchange failed' };
      }

      const tokens = await tokenResponse.json() as TokenResponse;
      const mode = state.auth_mode as AnthropicAuthMode;

      if (mode === 'console') {
        // Console mode: Create a permanent API key
        const apiKey = await this.createApiKey(tokens.access_token);
        
        if (apiKey) {
          // Save the API key
          await saveApiKey({
            providerId: 'anthropic',
            apiKey: apiKey,
          });
          
          log.info('Anthropic API key created and saved');
        } else {
          // Fallback: save OAuth tokens if API key creation fails
          await this.saveTokens(tokens);
          log.warn('API key creation failed, saved OAuth tokens instead');
        }
      } else {
        // Max mode: Save OAuth tokens for direct API access
        await this.saveTokens(tokens);
        log.info('Anthropic OAuth tokens saved (Max mode)');
      }

      this.updateState(stateId, 'completed');
      return { status: 'completed' };

    } catch (error) {
      log.error('Error exchanging code', { error });
      this.updateState(stateId, 'error', 'Exchange failed');
      return { status: 'error', error: 'Failed to exchange code' };
    }
  },

  /**
   * Create a permanent API key using OAuth tokens
   */
  async createApiKey(accessToken: string): Promise<string | null> {
    try {
      const response = await fetch(API_KEY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        log.error('API key creation failed', { status: response.status });
        return null;
      }

      const data = await response.json() as ApiKeyResponse;
      return data.raw_key;
    } catch (error) {
      log.error('Error creating API key', { error });
      return null;
    }
  },

  /**
   * Refresh an expired access token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse | null> {
    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: ANTHROPIC_CLIENT_ID,
        }),
      });

      if (!response.ok) {
        log.error('Token refresh failed', { status: response.status });
        return null;
      }

      return await response.json() as TokenResponse;
    } catch (error) {
      log.error('Error refreshing token', { error });
      return null;
    }
  },

  /**
   * Get the current status of an OAuth flow
   */
  getFlowStatus(stateId: string): AnthropicAuthStatus | null {
    const state = db.query(`
      SELECT status, error_message, expires_at FROM oauth_state 
      WHERE id = $id AND provider_id = 'anthropic'
    `).get({ $id: stateId }) as Pick<OAuthStateRow, 'status' | 'error_message' | 'expires_at'> | null;

    if (!state) {
      return null;
    }

    // Check if expired
    const expiresAt = new Date(state.expires_at);
    if (Date.now() > expiresAt.getTime() && state.status === 'pending') {
      this.updateState(stateId, 'expired');
      return { status: 'expired', error: 'OAuth flow expired' };
    }

    return {
      status: state.status as AnthropicAuthStatus['status'],
      error: state.error_message || undefined,
    };
  },

  /**
   * Cancel an OAuth flow
   */
  cancelFlow(stateId: string): void {
    db.query(`DELETE FROM oauth_state WHERE id = $id`).run({ $id: stateId });
    log.info('OAuth flow cancelled', { stateId });
  },

  /**
   * Get required beta headers for OAuth API calls
   */
  getBetaHeaders(): string {
    return OAUTH_BETA_HEADERS.join(',');
  },

  /**
   * Build headers for Anthropic API calls using OAuth token
   */
  buildOAuthHeaders(accessToken: string, additionalBetas?: string[]): Record<string, string> {
    const betas = [...OAUTH_BETA_HEADERS];
    if (additionalBetas) {
      betas.push(...additionalBetas);
    }
    
    return {
      'Authorization': `Bearer ${accessToken}`,
      'anthropic-beta': [...new Set(betas)].join(','),
    };
  },

  /**
   * Save OAuth tokens to credential storage
   */
  async saveTokens(tokens: TokenResponse): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    
    await saveOAuthToken({
      providerId: 'anthropic',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      oauthProvider: 'anthropic',
      scopes: SCOPES.split(' '),
    });
  },

  /**
   * Update OAuth state in database
   */
  updateState(stateId: string, status: string, errorMessage?: string): void {
    db.query(`
      UPDATE oauth_state 
      SET status = $status, error_message = $errorMessage 
      WHERE id = $id
    `).run({
      $id: stateId,
      $status: status,
      $errorMessage: errorMessage || null,
    });
  },

  /**
   * Clean up expired OAuth states
   */
  cleanupExpired(): number {
    const result = db.query(`
      DELETE FROM oauth_state 
      WHERE provider_id = 'anthropic' AND (
        expires_at < datetime('now') 
        OR (status IN ('completed', 'expired', 'error') AND created_at < datetime('now', '-1 hour'))
      )
    `).run();

    const deleted = (result as unknown as { changes: number }).changes;
    if (deleted > 0) {
      log.info('Cleaned up expired Anthropic OAuth states', { count: deleted });
    }
    return deleted;
  },
};
