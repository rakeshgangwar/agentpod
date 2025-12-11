/**
 * Keycloak Service
 * Manages service account authentication for API-to-container communication
 * 
 * Uses client credentials grant to get tokens without user interaction.
 * Tokens are cached and refreshed before expiry.
 */

import { config } from '../config.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('keycloak');

// =============================================================================
// Types
// =============================================================================

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  scope: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp
}

// =============================================================================
// Token Cache
// =============================================================================

let cachedToken: CachedToken | null = null;

// Refresh token 60 seconds before expiry
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

// =============================================================================
// Service
// =============================================================================

export const keycloak = {
  /**
   * Get a valid access token for the service account
   * Returns cached token if still valid, otherwise fetches a new one
   */
  async getServiceAccountToken(): Promise<string> {
    // Check if we have a valid cached token
    if (cachedToken) {
      const now = Math.floor(Date.now() / 1000);
      if (cachedToken.expiresAt > now + TOKEN_REFRESH_BUFFER_SECONDS) {
        log.debug('Using cached service account token');
        return cachedToken.accessToken;
      }
      log.debug('Cached token expired or expiring soon, refreshing...');
    }

    // Fetch new token
    const token = await this.fetchServiceAccountToken();
    return token;
  },

  /**
   * Fetch a new service account token using client credentials grant
   */
  async fetchServiceAccountToken(): Promise<string> {
    const tokenUrl = `${config.keycloak.realmUrl}/protocol/openid-connect/token`;
    
    log.info('Fetching service account token from Keycloak', { 
      clientId: config.keycloak.apiClientId,
      tokenUrl 
    });

    if (!config.keycloak.apiClientSecret) {
      throw new Error('KEYCLOAK_API_CLIENT_SECRET is not configured');
    }

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: config.keycloak.apiClientId,
          client_secret: config.keycloak.apiClientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error('Failed to get service account token', { 
          status: response.status, 
          error: errorText 
        });
        throw new Error(`Keycloak token request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as TokenResponse;
      
      // Cache the token
      const now = Math.floor(Date.now() / 1000);
      cachedToken = {
        accessToken: data.access_token,
        expiresAt: now + data.expires_in,
      };

      log.info('Service account token obtained', { 
        expiresIn: data.expires_in,
        scope: data.scope 
      });

      return data.access_token;
    } catch (error) {
      log.error('Error fetching service account token', { error });
      throw error;
    }
  },

  /**
   * Validate an access token (introspection)
   * Used to verify tokens from mobile app or other clients
   */
  async validateToken(token: string): Promise<{ active: boolean; email?: string; username?: string }> {
    const introspectUrl = `${config.keycloak.realmUrl}/protocol/openid-connect/token/introspect`;

    log.info('Validating token via introspection', { 
      introspectUrl, 
      clientId: config.keycloak.apiClientId,
      tokenLength: token.length 
    });

    try {
      const response = await fetch(introspectUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token,
          client_id: config.keycloak.apiClientId,
          client_secret: config.keycloak.apiClientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error('Token introspection failed', { status: response.status, error: errorText });
        return { active: false };
      }

      const data = await response.json() as { active: boolean; email?: string; preferred_username?: string };
      log.info('Token introspection result', { active: data.active, email: data.email, username: data.preferred_username });
      return {
        active: data.active,
        email: data.email,
        username: data.preferred_username,
      };
    } catch (error) {
      log.error('Error during token introspection', { error });
      return { active: false };
    }
  },

  /**
   * Get user info from an access token
   */
  async getUserInfo(token: string): Promise<{ email: string; username: string; name?: string } | null> {
    const userInfoUrl = `${config.keycloak.realmUrl}/protocol/openid-connect/userinfo`;

    try {
      const response = await fetch(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        log.error('UserInfo request failed', { status: response.status });
        return null;
      }

      const data = await response.json() as { email: string; preferred_username: string; name?: string };
      return {
        email: data.email,
        username: data.preferred_username,
        name: data.name,
      };
    } catch (error) {
      log.error('Error fetching user info', { error });
      return null;
    }
  },

  /**
   * Clear the cached token (useful for testing or forced refresh)
   */
  clearCache(): void {
    cachedToken = null;
    log.debug('Token cache cleared');
  },

  /**
   * Check if Keycloak is configured
   */
  isConfigured(): boolean {
    return !!(
      config.keycloak.realmUrl &&
      config.keycloak.apiClientId &&
      config.keycloak.apiClientSecret
    );
  },

  /**
   * Get Keycloak configuration for containers
   * Returns the env vars needed for oauth2-proxy
   */
  getContainerAuthConfig(): {
    clientId: string;
    clientSecret: string;
    cookieSecret: string;
    issuerUrl: string;
  } {
    if (!config.keycloak.containerClientSecret) {
      log.warn('KEYCLOAK_CONTAINER_CLIENT_SECRET is not configured');
    }
    if (!config.keycloak.cookieSecret) {
      log.warn('KEYCLOAK_COOKIE_SECRET is not configured');
    }

    return {
      clientId: config.keycloak.containerClientId,
      clientSecret: config.keycloak.containerClientSecret,
      cookieSecret: config.keycloak.cookieSecret,
      issuerUrl: config.keycloak.realmUrl,
    };
  },
};
