/**
 * Integration Tests for Preferences Routes
 * 
 * Tests the /api/users/me/preferences/* endpoints which manage:
 * - User preferences retrieval (GET)
 * - Preferences update (PUT/PATCH)
 * - Settings version for sync
 * - Sync status check
 * - Reset to defaults
 */

import '../setup.ts';

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { rawSql } from '../../src/db/drizzle';
import { setupTestUsers, DEFAULT_USER_ID } from '../helpers/database';

import { app } from '../../src/index.ts';

const AUTH_HEADER = { 'Authorization': 'Bearer test-token' };

async function cleanupPreferences(): Promise<void> {
  await rawSql`DELETE FROM user_preferences WHERE user_id = ${DEFAULT_USER_ID}`;
}

// =============================================================================
// Tests
// =============================================================================

describe('Preferences Routes Integration Tests', () => {
  beforeAll(async () => {
    await setupTestUsers();
    await cleanupPreferences();
  });

  afterAll(async () => {
    await cleanupPreferences();
  });

  beforeEach(async () => {
    await cleanupPreferences();
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe('Authentication', () => {
    test('should return 401 without auth header', async () => {
      const res = await app.request('/api/users/me/preferences');
      expect(res.status).toBe(401);
    });

    test('should return 401 with invalid token', async () => {
      const res = await app.request('/api/users/me/preferences', {
        headers: { 'Authorization': 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    test('should succeed with valid auth token', async () => {
      const res = await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // GET /api/users/me/preferences - Get Preferences
  // ===========================================================================

  describe('GET /api/users/me/preferences', () => {
    test('should create default preferences for new user', async () => {
      const res = await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences).toBeDefined();
      expect(data.preferences.userId).toBe(DEFAULT_USER_ID);
      expect(data.preferences.themeMode).toBe('system');
      expect(data.preferences.themePreset).toBe('default-neutral');
      expect(data.preferences.autoRefreshInterval).toBe(30);
      expect(data.preferences.inAppNotifications).toBe(true);
      expect(data.preferences.systemNotifications).toBe(true);
      expect(data.preferences.defaultResourceTierId).toBe('starter');
      expect(data.preferences.defaultFlavorId).toBe('js');
      expect(data.preferences.defaultAddonIds).toEqual(['code-server']);
      expect(data.preferences.defaultAgentId).toBe('opencode');
      expect(data.preferences.settingsVersion).toBe(1);
    });

    test('should return existing preferences', async () => {
      // First call creates preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      // Second call returns existing
      const res = await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences).toBeDefined();
      expect(data.preferences.settingsVersion).toBe(1);
    });
  });

  // ===========================================================================
  // PUT /api/users/me/preferences - Replace Preferences
  // ===========================================================================

  describe('PUT /api/users/me/preferences', () => {
    test('should update theme mode', async () => {
      // Ensure preferences exist
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeMode: 'dark',
        }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences.themeMode).toBe('dark');
      expect(data.message).toBe('Preferences updated');
    });

    test('should update multiple fields', async () => {
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeMode: 'light',
          themePreset: 'ocean-blue',
          autoRefreshInterval: 60,
          inAppNotifications: false,
        }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences.themeMode).toBe('light');
      expect(data.preferences.themePreset).toBe('ocean-blue');
      expect(data.preferences.autoRefreshInterval).toBe(60);
      expect(data.preferences.inAppNotifications).toBe(false);
    });

    test('should increment settings version on update', async () => {
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      // First update
      await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeMode: 'dark',
        }),
      });
      
      // Check version
      const res = await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences.settingsVersion).toBe(2);
    });

    test('should validate autoRefreshInterval range', async () => {
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      // Too low
      const resLow = await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          autoRefreshInterval: 1,
        }),
      });
      
      expect(resLow.status).toBe(400);
      
      // Too high
      const resHigh = await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          autoRefreshInterval: 500,
        }),
      });
      
      expect(resHigh.status).toBe(400);
    });

    test('should validate themeMode enum', async () => {
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeMode: 'invalid-mode',
        }),
      });
      
      expect(res.status).toBe(400);
    });

    test('should update default sandbox configuration', async () => {
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          defaultResourceTierId: 'pro',
          defaultFlavorId: 'python',
          defaultAddonIds: ['code-server', 'gui'],
          defaultAgentId: 'custom-agent',
        }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences.defaultResourceTierId).toBe('pro');
      expect(data.preferences.defaultFlavorId).toBe('python');
      expect(data.preferences.defaultAddonIds).toEqual(['code-server', 'gui']);
      expect(data.preferences.defaultAgentId).toBe('custom-agent');
    });
  });

  // ===========================================================================
  // PATCH /api/users/me/preferences - Partial Update
  // ===========================================================================

  describe('PATCH /api/users/me/preferences', () => {
    test('should update only specified fields', async () => {
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PATCH',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeMode: 'dark',
        }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      // Updated field
      expect(data.preferences.themeMode).toBe('dark');
      
      // Unchanged defaults
      expect(data.preferences.themePreset).toBe('default-neutral');
      expect(data.preferences.autoRefreshInterval).toBe(30);
    });

    test('should work with empty body', async () => {
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PATCH',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      // Version should not change if no updates
      expect(data.preferences.settingsVersion).toBe(1);
    });
  });

  // ===========================================================================
  // GET /api/users/me/preferences/version - Get Version
  // ===========================================================================

  describe('GET /api/users/me/preferences/version', () => {
    test('should return 0 for non-existent preferences', async () => {
      const res = await app.request('/api/users/me/preferences/version', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.version).toBe(0);
      expect(data.userId).toBe(DEFAULT_USER_ID);
    });

    test('should return current version', async () => {
      // Create preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const res = await app.request('/api/users/me/preferences/version', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.version).toBe(1);
    });

    test('should reflect version after update', async () => {
      // Create and update preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeMode: 'dark',
        }),
      });
      
      const res = await app.request('/api/users/me/preferences/version', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.version).toBe(2);
    });
  });

  // ===========================================================================
  // GET /api/users/me/preferences/sync - Check Sync Status
  // ===========================================================================

  describe('GET /api/users/me/preferences/sync', () => {
    test('should require localVersion parameter', async () => {
      const res = await app.request('/api/users/me/preferences/sync', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(400);
    });

    test('should indicate sync needed when server is ahead', async () => {
      // Create preferences (version 1)
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      // Check with local version 0
      const res = await app.request('/api/users/me/preferences/sync?localVersion=0', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.localVersion).toBe(0);
      expect(data.serverVersion).toBe(1);
      expect(data.needsSync).toBe(true);
      expect(data.message).toContain('newer');
    });

    test('should indicate in sync when versions match', async () => {
      // Create preferences (version 1)
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      // Check with local version 1
      const res = await app.request('/api/users/me/preferences/sync?localVersion=1', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.localVersion).toBe(1);
      expect(data.serverVersion).toBe(1);
      expect(data.needsSync).toBe(false);
      expect(data.message).toContain('in sync');
    });

    test('should indicate in sync when local is ahead', async () => {
      // Create preferences (version 1)
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      // Check with local version 5 (ahead)
      const res = await app.request('/api/users/me/preferences/sync?localVersion=5', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.localVersion).toBe(5);
      expect(data.serverVersion).toBe(1);
      expect(data.needsSync).toBe(false);
    });
  });

  // ===========================================================================
  // DELETE /api/users/me/preferences - Reset to Defaults
  // ===========================================================================

  describe('DELETE /api/users/me/preferences', () => {
    test('should reset preferences to defaults', async () => {
      // Create and modify preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      await app.request('/api/users/me/preferences', {
        method: 'PUT',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeMode: 'dark',
          themePreset: 'custom-theme',
          autoRefreshInterval: 120,
        }),
      });
      
      // Reset
      const res = await app.request('/api/users/me/preferences', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.message).toContain('reset');
      expect(data.preferences.themeMode).toBe('system');
      expect(data.preferences.themePreset).toBe('default-neutral');
      expect(data.preferences.autoRefreshInterval).toBe(30);
      expect(data.preferences.settingsVersion).toBe(1);
    });

    test('should work even if no preferences exist', async () => {
      const res = await app.request('/api/users/me/preferences', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences).toBeDefined();
      expect(data.preferences.userId).toBe(DEFAULT_USER_ID);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    test('should handle rapid sequential updates', async () => {
      // Create preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      // Rapid updates
      for (let i = 0; i < 5; i++) {
        await app.request('/api/users/me/preferences', {
          method: 'PATCH',
          headers: {
            ...AUTH_HEADER,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            autoRefreshInterval: 30 + i * 10,
          }),
        });
      }
      
      // Check final state
      const res = await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences.autoRefreshInterval).toBe(70); // 30 + 4*10
      expect(data.preferences.settingsVersion).toBe(6); // 1 initial + 5 updates
    });

    test('should handle boolean toggle', async () => {
      // Create preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      // Toggle notifications off
      let res = await app.request('/api/users/me/preferences', {
        method: 'PATCH',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inAppNotifications: false,
          systemNotifications: false,
        }),
      });
      
      expect(res.status).toBe(200);
      let data = await res.json();
      expect(data.preferences.inAppNotifications).toBe(false);
      expect(data.preferences.systemNotifications).toBe(false);
      
      // Toggle back on
      res = await app.request('/api/users/me/preferences', {
        method: 'PATCH',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inAppNotifications: true,
          systemNotifications: true,
        }),
      });
      
      expect(res.status).toBe(200);
      data = await res.json();
      expect(data.preferences.inAppNotifications).toBe(true);
      expect(data.preferences.systemNotifications).toBe(true);
    });

    test('should handle empty array for defaultAddonIds', async () => {
      // Create preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PATCH',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          defaultAddonIds: [],
        }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences.defaultAddonIds).toEqual([]);
    });

    test('should handle special characters in theme preset', async () => {
      // Create preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const specialPreset = 'my-custom_theme.v2';
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PATCH',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themePreset: specialPreset,
        }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences.themePreset).toBe(specialPreset);
    });

    test('should handle multiple addon IDs', async () => {
      // Create preferences
      await app.request('/api/users/me/preferences', {
        headers: AUTH_HEADER,
      });
      
      const addons = ['code-server', 'gui', 'database-postgres', 'cloud-aws'];
      
      const res = await app.request('/api/users/me/preferences', {
        method: 'PATCH',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          defaultAddonIds: addons,
        }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences.defaultAddonIds).toEqual(addons);
    });
  });
});
