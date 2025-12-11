/**
 * GitHub Copilot OAuth Service
 * 
 * Implements the device flow OAuth for GitHub Copilot authentication.
 * 
 * Device Flow:
 * 1. App requests device code from GitHub
 * 2. User visits verification URL and enters user code
 * 3. App polls for access token until user completes auth
 * 
 * Reference: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 */

import { db } from '../../db/index.ts';
import { createLogger } from '../../utils/logger.ts';
import { saveOAuthToken } from '../../models/provider-credentials.ts';

const log = createLogger('github-copilot-oauth');

// =============================================================================
// Constants
// =============================================================================

// GitHub Copilot uses the VS Code Copilot client ID
const GITHUB_COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';

// Required scopes for Copilot
const SCOPES = ['copilot'];

// =============================================================================
// Types
// =============================================================================

export interface DeviceFlowInit {
  id: string;
  userCode: string;
  verificationUri: string;
  expiresAt: Date;
  interval: number;
}

export interface DeviceFlowStatus {
  status: 'pending' | 'completed' | 'expired' | 'error';
  error?: string;
}

// GitHub API response types
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

// Database row type
interface OAuthStateRow {
  id: string;
  provider_id: string;
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval_seconds: number;
  expires_at: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

// =============================================================================
// Service
// =============================================================================

export const githubCopilotOAuth = {
  /**
   * Initialize a new device flow authentication
   */
  async initDeviceFlow(): Promise<DeviceFlowInit> {
    log.info('Initiating GitHub Copilot device flow');

    // Request device code from GitHub
    const response = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GITHUB_COPILOT_CLIENT_ID,
        scope: SCOPES.join(' '),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('Failed to get device code', { status: response.status, error: errorText });
      throw new Error(`Failed to initiate device flow: ${response.status}`);
    }

    const data = await response.json() as DeviceCodeResponse;

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Generate state ID
    const id = crypto.randomUUID();

    // Store in database
    db.query(`
      INSERT INTO oauth_state (
        id, provider_id, device_code, user_code, verification_uri, 
        interval_seconds, expires_at, status
      )
      VALUES ($id, $providerId, $deviceCode, $userCode, $verificationUri, $interval, $expiresAt, 'pending')
    `).run({
      $id: id,
      $providerId: 'github-copilot',
      $deviceCode: data.device_code,
      $userCode: data.user_code,
      $verificationUri: data.verification_uri,
      $interval: data.interval,
      $expiresAt: expiresAt.toISOString(),
    });

    log.info('Device flow initiated', { id, userCode: data.user_code });

    return {
      id,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresAt,
      interval: data.interval,
    };
  },

  /**
   * Poll for the access token (called by client periodically)
   */
  async pollToken(stateId: string): Promise<DeviceFlowStatus> {
    log.debug('Polling for token', { stateId });

    // Get OAuth state from database
    const state = db.query(`
      SELECT * FROM oauth_state WHERE id = $id
    `).get({ $id: stateId }) as OAuthStateRow | null;

    if (!state) {
      return { status: 'error', error: 'Invalid state ID' };
    }

    // Check if already completed
    if (state.status === 'completed') {
      return { status: 'completed' };
    }

    // Check if expired
    const expiresAt = new Date(state.expires_at);
    if (Date.now() > expiresAt.getTime()) {
      this.updateState(stateId, 'expired');
      return { status: 'expired', error: 'Device flow expired' };
    }

    // Poll GitHub for token
    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GITHUB_COPILOT_CLIENT_ID,
          device_code: state.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const data = await response.json() as TokenResponse;

      if (data.error) {
        // Handle known error states
        switch (data.error) {
          case 'authorization_pending':
            // User hasn't authorized yet, keep waiting
            return { status: 'pending' };

          case 'slow_down':
            // We're polling too fast, client should increase interval
            log.warn('GitHub says slow down polling');
            return { status: 'pending' };

          case 'expired_token':
            this.updateState(stateId, 'expired');
            return { status: 'expired', error: 'Device code expired' };

          case 'access_denied':
            this.updateState(stateId, 'error', 'User denied access');
            return { status: 'error', error: 'User denied access' };

          default:
            this.updateState(stateId, 'error', data.error_description || data.error);
            return { status: 'error', error: data.error_description || data.error };
        }
      }

      if (data.access_token) {
        // Success! Save the token
        await saveOAuthToken({
          providerId: 'github-copilot',
          accessToken: data.access_token,
          oauthProvider: 'github',
          scopes: data.scope?.split(' ') || SCOPES,
        });

        this.updateState(stateId, 'completed');
        log.info('GitHub Copilot OAuth completed successfully');

        return { status: 'completed' };
      }

      // Unknown response
      return { status: 'pending' };
    } catch (error) {
      log.error('Error polling for token', { error });
      return { status: 'error', error: 'Network error' };
    }
  },

  /**
   * Get the current status of an OAuth flow
   */
  getFlowStatus(stateId: string): DeviceFlowStatus | null {
    const state = db.query(`
      SELECT status, error_message, expires_at FROM oauth_state WHERE id = $id
    `).get({ $id: stateId }) as Pick<OAuthStateRow, 'status' | 'error_message' | 'expires_at'> | null;

    if (!state) {
      return null;
    }

    // Check if expired
    const expiresAt = new Date(state.expires_at);
    if (Date.now() > expiresAt.getTime() && state.status === 'pending') {
      this.updateState(stateId, 'expired');
      return { status: 'expired', error: 'Device flow expired' };
    }

    return {
      status: state.status as DeviceFlowStatus['status'],
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
   * Clean up expired OAuth states
   */
  cleanupExpired(): number {
    const result = db.query(`
      DELETE FROM oauth_state 
      WHERE expires_at < datetime('now') 
      OR (status IN ('completed', 'expired', 'error') AND created_at < datetime('now', '-1 hour'))
    `).run();

    const deleted = (result as unknown as { changes: number }).changes;
    if (deleted > 0) {
      log.info('Cleaned up expired OAuth states', { count: deleted });
    }
    return deleted;
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
};
