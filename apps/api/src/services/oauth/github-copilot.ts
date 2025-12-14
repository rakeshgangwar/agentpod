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

import { db } from '../../db/drizzle';
import { oauthState } from '../../db/schema/providers';
import { eq, lt, or, and, inArray } from 'drizzle-orm';
import { createLogger } from '../../utils/logger.ts';
import { saveOAuthToken } from '../../models/provider-credentials.ts';
import { syncAuthJsonForUser } from '../config-sync.ts';

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

// =============================================================================
// Service
// =============================================================================

export const githubCopilotOAuth = {
  /**
   * Initialize a new device flow authentication for a user
   */
  async initDeviceFlow(userId: string): Promise<DeviceFlowInit> {
    log.info('Initiating GitHub Copilot device flow', { userId });

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
    await db.insert(oauthState).values({
      id,
      userId,
      providerId: 'github-copilot',
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      intervalSeconds: data.interval,
      expiresAt,
      status: 'pending',
      createdAt: new Date(),
    });

    log.info('Device flow initiated', { id, userId, userCode: data.user_code });

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
  async pollToken(stateId: string, userId: string): Promise<DeviceFlowStatus> {
    log.debug('Polling for token', { stateId, userId });

    // Get OAuth state from database
    const [state] = await db.select()
      .from(oauthState)
      .where(eq(oauthState.id, stateId));

    if (!state) {
      return { status: 'error', error: 'Invalid state ID' };
    }

    // Verify this state belongs to the requesting user
    if (state.userId !== userId) {
      log.warn('User attempted to poll OAuth state that does not belong to them', { stateId, userId, stateUserId: state.userId });
      return { status: 'error', error: 'Invalid state ID' };
    }

    // Check if already completed
    if (state.status === 'completed') {
      return { status: 'completed' };
    }

    // Check if expired
    if (Date.now() > state.expiresAt.getTime()) {
      await this.updateState(stateId, 'expired');
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
          device_code: state.deviceCode,
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
            await this.updateState(stateId, 'expired');
            return { status: 'expired', error: 'Device code expired' };

          case 'access_denied':
            await this.updateState(stateId, 'error', 'User denied access');
            return { status: 'error', error: 'User denied access' };

          default:
            await this.updateState(stateId, 'error', data.error_description || data.error);
            return { status: 'error', error: data.error_description || data.error };
        }
      }

      if (data.access_token) {
        // Success! Save the token for this user
        await saveOAuthToken({
          userId,
          providerId: 'github-copilot',
          accessToken: data.access_token,
          oauthProvider: 'github',
          scopes: data.scope?.split(' ') || SCOPES,
        });

        await this.updateState(stateId, 'completed');
        log.info('GitHub Copilot OAuth completed successfully', { userId });

        // Fire and forget: sync auth to running containers
        syncAuthJsonForUser(userId).catch(err => {
          log.warn('Failed to sync auth after OAuth', { userId, error: err instanceof Error ? err.message : err });
        });

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
  async getFlowStatus(stateId: string): Promise<DeviceFlowStatus | null> {
    const [state] = await db.select({
      status: oauthState.status,
      errorMessage: oauthState.errorMessage,
      expiresAt: oauthState.expiresAt,
    })
      .from(oauthState)
      .where(eq(oauthState.id, stateId));

    if (!state) {
      return null;
    }

    // Check if expired
    if (Date.now() > state.expiresAt.getTime() && state.status === 'pending') {
      await this.updateState(stateId, 'expired');
      return { status: 'expired', error: 'Device flow expired' };
    }

    return {
      status: state.status as DeviceFlowStatus['status'],
      error: state.errorMessage || undefined,
    };
  },

  /**
   * Cancel an OAuth flow
   */
  async cancelFlow(stateId: string): Promise<void> {
    await db.delete(oauthState).where(eq(oauthState.id, stateId));
    log.info('OAuth flow cancelled', { stateId });
  },

  /**
   * Clean up expired OAuth states
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await db.delete(oauthState)
      .where(
        or(
          lt(oauthState.expiresAt, now),
          and(
            inArray(oauthState.status, ['completed', 'expired', 'error']),
            lt(oauthState.createdAt, oneHourAgo)
          )
        )
      )
      .returning({ id: oauthState.id });

    const deleted = result.length;
    if (deleted > 0) {
      log.info('Cleaned up expired OAuth states', { count: deleted });
    }
    return deleted;
  },

  /**
   * Update OAuth state in database
   */
  async updateState(stateId: string, status: string, errorMessage?: string): Promise<void> {
    await db.update(oauthState)
      .set({
        status: status as 'pending' | 'completed' | 'expired' | 'error',
        errorMessage: errorMessage || null,
      })
      .where(eq(oauthState.id, stateId));
  },
};
