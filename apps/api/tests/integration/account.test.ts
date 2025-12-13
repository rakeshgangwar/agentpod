/**
 * Integration Tests for Account Routes
 * 
 * Tests the /api/account endpoints which manage:
 * - Account info retrieval (GET /api/account)
 * - Account deletion with data cleanup (DELETE /api/account)
 * - User data export for GDPR compliance (GET /api/account/data-export)
 */

// IMPORTANT: Import setup first to set environment variables
import '../setup.ts';

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../../src/db/index.ts';

// Import the full app after environment is set up
import { app } from '../../src/index.ts';

// =============================================================================
// Constants
// =============================================================================

const AUTH_HEADER = { 'Authorization': 'Bearer test-token' };
// The default user ID when using API key auth (from config.defaultUserId)
const DEFAULT_USER_ID = 'default-user';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestUser(userId: string = DEFAULT_USER_ID, email: string = 'default@test.com'): void {
  const now = new Date().toISOString();
  db.run(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 0, ?, ?)
  `, [userId, 'Default Test User', email, now, now]);
}

function deleteTestUser(userId: string = DEFAULT_USER_ID): void {
  // Clean up in reverse order of foreign key dependencies
  db.run('DELETE FROM user_preferences WHERE user_id = ?', [userId]);
  db.run('DELETE FROM user_opencode_files WHERE user_id = ?', [userId]);
  db.run('DELETE FROM user_opencode_config WHERE user_id = ?', [userId]);
  // provider_credentials is global (no user_id column) - don't clean here
  db.run('DELETE FROM activity_log WHERE user_id = ?', [userId]);
  // Delete sandboxes (which will cascade to chat_sessions and chat_messages)
  db.run('DELETE FROM sandboxes WHERE user_id = ?', [userId]);
  db.run('DELETE FROM session WHERE userId = ?', [userId]);
  db.run('DELETE FROM account WHERE userId = ?', [userId]);
  db.run('DELETE FROM user WHERE id = ?', [userId]);
}

function createTestSandbox(userId: string, sandboxId: string, name: string): void {
  const now = new Date().toISOString();
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  db.run(`
    INSERT INTO sandboxes (
      id, user_id, name, slug, repo_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'stopped', ?, ?)
  `, [sandboxId, userId, name, slug, `test-repo-${sandboxId}`, now, now]);
}

function createTestChatSession(sandboxId: string, sessionId: string, title: string, userId: string = DEFAULT_USER_ID): void {
  const now = new Date().toISOString();
  db.run(`
    INSERT INTO chat_sessions (
      id, sandbox_id, user_id, source, title, message_count, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'opencode', ?, 0, 'active', ?, ?)
  `, [sessionId, sandboxId, userId, title, now, now]);
}

function createTestActivityLog(userId: string, action: string): void {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.run(`
    INSERT INTO activity_log (
      id, user_id, action, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, '127.0.0.1', 'Test Agent', ?)
  `, [id, userId, action, now]);
}

function createTestPreferences(userId: string): void {
  const now = new Date().toISOString();
  db.run(`
    INSERT OR IGNORE INTO user_preferences (
      user_id, theme_mode, theme_preset, settings_version, created_at, updated_at
    ) VALUES (?, 'dark', 'ocean-blue', 1, ?, ?)
  `, [userId, now, now]);
}

function createTestOpenCodeConfig(userId: string): void {
  const now = new Date().toISOString();
  db.run(`
    INSERT OR IGNORE INTO user_opencode_config (
      user_id, settings, agents_md, created_at, updated_at
    ) VALUES (?, '{"theme":"dark"}', '# Agents Config', ?, ?)
  `, [userId, now, now]);
}

function cleanupAllTestData(): void {
  // Clean up all test data
  db.run('DELETE FROM activity_log WHERE user_id = ?', [DEFAULT_USER_ID]);
  db.run('DELETE FROM user_preferences WHERE user_id = ?', [DEFAULT_USER_ID]);
  db.run('DELETE FROM user_opencode_files WHERE user_id = ?', [DEFAULT_USER_ID]);
  db.run('DELETE FROM user_opencode_config WHERE user_id = ?', [DEFAULT_USER_ID]);
  // provider_credentials is global (no user_id column) - clean test providers
  db.run("DELETE FROM provider_credentials WHERE provider_id LIKE 'test-provider-%'");
  // Delete chat_messages first (foreign key to chat_sessions)
  const sessions = db.query<{ id: string }, [string]>(
    'SELECT cs.id FROM chat_sessions cs JOIN sandboxes s ON cs.sandbox_id = s.id WHERE s.user_id = ?'
  ).all(DEFAULT_USER_ID);
  for (const session of sessions) {
    db.run('DELETE FROM chat_messages WHERE session_id = ?', [session.id]);
  }
  // Delete chat_sessions
  const sandboxes = db.query<{ id: string }, [string]>(
    'SELECT id FROM sandboxes WHERE user_id = ?'
  ).all(DEFAULT_USER_ID);
  for (const sandbox of sandboxes) {
    db.run('DELETE FROM chat_sessions WHERE sandbox_id = ?', [sandbox.id]);
  }
  // Delete sandboxes
  db.run('DELETE FROM sandboxes WHERE user_id = ?', [DEFAULT_USER_ID]);
}

// =============================================================================
// Tests
// =============================================================================

describe('Account Routes Integration Tests', () => {
  beforeAll(() => {
    // Create the test user (foreign key constraint)
    createTestUser();
  });

  afterAll(() => {
    cleanupAllTestData();
    deleteTestUser();
  });

  beforeEach(() => {
    cleanupAllTestData();
    // Recreate user if it was deleted
    createTestUser();
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe('Authentication', () => {
    test('should return 401 without auth header for GET /api/account', async () => {
      const res = await app.request('/api/account');
      expect(res.status).toBe(401);
    });

    test('should return 401 without auth header for DELETE /api/account', async () => {
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }),
      });
      expect(res.status).toBe(401);
    });

    test('should return 401 without auth header for GET /api/account/data-export', async () => {
      const res = await app.request('/api/account/data-export');
      expect(res.status).toBe(401);
    });

    test('should return 401 with invalid token', async () => {
      const res = await app.request('/api/account', {
        headers: { 'Authorization': 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    test('should succeed with valid auth token', async () => {
      const res = await app.request('/api/account', {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // GET /api/account - Get Account Info
  // ===========================================================================

  describe('GET /api/account', () => {
    test('should return account info with empty stats for new user', async () => {
      const res = await app.request('/api/account', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(DEFAULT_USER_ID);
      expect(data.stats).toBeDefined();
      expect(data.stats.sandboxCount).toBe(0);
      expect(data.stats.chatSessionCount).toBe(0);
    });

    test('should return correct sandbox count', async () => {
      // Create test sandboxes
      createTestSandbox(DEFAULT_USER_ID, 'sandbox-1', 'Test Sandbox 1');
      createTestSandbox(DEFAULT_USER_ID, 'sandbox-2', 'Test Sandbox 2');
      createTestSandbox(DEFAULT_USER_ID, 'sandbox-3', 'Test Sandbox 3');
      
      const res = await app.request('/api/account', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.stats.sandboxCount).toBe(3);
    });

    test('should return correct chat session count', async () => {
      // Create sandbox and chat sessions
      createTestSandbox(DEFAULT_USER_ID, 'sandbox-chat', 'Chat Test Sandbox');
      createTestChatSession('sandbox-chat', 'session-1', 'Session 1');
      createTestChatSession('sandbox-chat', 'session-2', 'Session 2');
      
      const res = await app.request('/api/account', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.stats.sandboxCount).toBe(1);
      expect(data.stats.chatSessionCount).toBe(2);
    });

    test('should aggregate chat sessions across multiple sandboxes', async () => {
      // Create multiple sandboxes with chat sessions
      createTestSandbox(DEFAULT_USER_ID, 'sandbox-a', 'Sandbox A');
      createTestSandbox(DEFAULT_USER_ID, 'sandbox-b', 'Sandbox B');
      createTestChatSession('sandbox-a', 'session-a1', 'Session A1');
      createTestChatSession('sandbox-a', 'session-a2', 'Session A2');
      createTestChatSession('sandbox-b', 'session-b1', 'Session B1');
      
      const res = await app.request('/api/account', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.stats.sandboxCount).toBe(2);
      expect(data.stats.chatSessionCount).toBe(3);
    });
  });

  // ===========================================================================
  // DELETE /api/account - Delete Account
  // ===========================================================================

  describe('DELETE /api/account', () => {
    test('should require confirmPhrase', async () => {
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      expect(res.status).toBe(400);
    });

    test('should require exact confirmPhrase "DELETE MY ACCOUNT"', async () => {
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmPhrase: 'delete my account' }), // lowercase
      });
      
      expect(res.status).toBe(400);
    });

    test('should delete user account with no data', async () => {
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted');
      expect(data.results.userDeleted).toBe(true);
    });

    test('should delete preferences when deleting account', async () => {
      // Create preferences
      createTestPreferences(DEFAULT_USER_ID);
      
      // Verify preferences exist
      const prefsBefore = db.query<{ user_id: string }, [string]>(
        'SELECT user_id FROM user_preferences WHERE user_id = ?'
      ).get(DEFAULT_USER_ID);
      expect(prefsBefore).toBeDefined();
      
      // Delete account
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.results.preferencesDeleted).toBe(true);
      
      // Verify preferences are deleted
      const prefsAfter = db.query<{ user_id: string }, [string]>(
        'SELECT user_id FROM user_preferences WHERE user_id = ?'
      ).get(DEFAULT_USER_ID);
      expect(prefsAfter).toBeNull();
    });

    test('should anonymize activity logs when deleting account', async () => {
      // Create activity logs
      createTestActivityLog(DEFAULT_USER_ID, 'sandbox.create');
      createTestActivityLog(DEFAULT_USER_ID, 'chat.message_send');
      
      // Verify logs exist with user_id
      const logsBefore = db.query<{ user_id: string | null, anonymized: number }, [string]>(
        'SELECT user_id, anonymized FROM activity_log WHERE user_id = ?'
      ).all(DEFAULT_USER_ID);
      expect(logsBefore.length).toBe(2);
      expect(logsBefore[0].anonymized).toBe(0);
      
      // Delete account
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.results.activityLogsAnonymized).toBe(2);
      
      // Verify logs are anonymized (user_id set to NULL)
      const logsAfter = db.query<{ user_id: string | null, anonymized: number }, []>(
        'SELECT user_id, anonymized FROM activity_log WHERE anonymized = 1'
      ).all();
      expect(logsAfter.length).toBeGreaterThanOrEqual(2);
      expect(logsAfter.every(log => log.user_id === null)).toBe(true);
    });

    // Note: provider_credentials is global (not per-user) in this schema
    // Account deletion doesn't affect provider_credentials

    test('should delete OpenCode config when deleting account', async () => {
      // Create OpenCode config
      createTestOpenCodeConfig(DEFAULT_USER_ID);
      
      // Verify config exists
      const configBefore = db.query<{ user_id: string }, [string]>(
        'SELECT user_id FROM user_opencode_config WHERE user_id = ?'
      ).get(DEFAULT_USER_ID);
      expect(configBefore).toBeDefined();
      
      // Delete account
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }),
      });
      
      expect(res.status).toBe(200);
      
      // Verify config is deleted
      const configAfter = db.query<{ user_id: string }, [string]>(
        'SELECT user_id FROM user_opencode_config WHERE user_id = ?'
      ).get(DEFAULT_USER_ID);
      expect(configAfter).toBeNull();
    });

    test('should return results summary', async () => {
      // Set up data to delete
      createTestPreferences(DEFAULT_USER_ID);
      createTestActivityLog(DEFAULT_USER_ID, 'test.action');
      createTestOpenCodeConfig(DEFAULT_USER_ID);
      
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.results).toBeDefined();
      expect(typeof data.results.sandboxesDeleted).toBe('number');
      expect(typeof data.results.activityLogsAnonymized).toBe('number');
      expect(typeof data.results.preferencesDeleted).toBe('boolean');
      expect(typeof data.results.userDeleted).toBe('boolean');
      expect(Array.isArray(data.results.errors)).toBe(true);
    });

    test('should default deleteContainers to true', async () => {
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }),
      });
      
      expect(res.status).toBe(200);
      // The request should succeed - we're just testing the default value is accepted
    });

    test('should accept deleteContainers option', async () => {
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          confirmPhrase: 'DELETE MY ACCOUNT',
          deleteContainers: false,
        }),
      });
      
      expect(res.status).toBe(200);
    });

    test('should accept deleteRepositories option', async () => {
      const res = await app.request('/api/account', {
        method: 'DELETE',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          confirmPhrase: 'DELETE MY ACCOUNT',
          deleteRepositories: false,
        }),
      });
      
      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // GET /api/account/data-export - Export User Data
  // ===========================================================================

  describe('GET /api/account/data-export', () => {
    test('should return export data structure for user with no data', async () => {
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.exportedAt).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(DEFAULT_USER_ID);
      expect(data.sandboxes).toEqual([]);
      expect(data.chatHistory).toEqual([]);
      expect(data.opencodeConfig).toBeNull();
      expect(data.opencodeFiles).toEqual([]);
      expect(data.preferences).toBeNull();
    });

    test('should include sandboxes in export', async () => {
      createTestSandbox(DEFAULT_USER_ID, 'export-sandbox-1', 'Export Test 1');
      createTestSandbox(DEFAULT_USER_ID, 'export-sandbox-2', 'Export Test 2');
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.sandboxes.length).toBe(2);
      expect(data.sandboxes[0].id).toBeDefined();
      expect(data.sandboxes[0].name).toBeDefined();
      expect(data.sandboxes[0].slug).toBeDefined();
    });

    test('should include chat history in export', async () => {
      createTestSandbox(DEFAULT_USER_ID, 'chat-export-sandbox', 'Chat Export');
      createTestChatSession('chat-export-sandbox', 'export-session-1', 'Export Session 1');
      createTestChatSession('chat-export-sandbox', 'export-session-2', 'Export Session 2');
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.chatHistory.length).toBe(1);
      expect(data.chatHistory[0].sandboxId).toBe('chat-export-sandbox');
      expect(data.chatHistory[0].sessions.length).toBe(2);
    });

    test('should include preferences in export', async () => {
      createTestPreferences(DEFAULT_USER_ID);
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences).toBeDefined();
      expect(data.preferences.theme_mode).toBe('dark');
      expect(data.preferences.theme_preset).toBe('ocean-blue');
    });

    test('should include OpenCode config in export', async () => {
      createTestOpenCodeConfig(DEFAULT_USER_ID);
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.opencodeConfig).toBeDefined();
      expect(data.opencodeConfig.settings).toEqual({ theme: 'dark' });
      expect(data.opencodeConfig.agentsMd).toBe('# Agents Config');
    });

    test('should have Content-Disposition header for download', async () => {
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const disposition = res.headers.get('Content-Disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain(`user-data-${DEFAULT_USER_ID}.json`);
    });

    test('should return valid JSON', async () => {
      createTestSandbox(DEFAULT_USER_ID, 'json-test-sandbox', 'JSON Test');
      createTestChatSession('json-test-sandbox', 'json-test-session', 'JSON Session');
      createTestPreferences(DEFAULT_USER_ID);
      createTestOpenCodeConfig(DEFAULT_USER_ID);
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      
      // Should be valid JSON
      const data = await res.json();
      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
    });

    test('should include exportedAt timestamp in ISO format', async () => {
      const beforeTime = new Date().toISOString();
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      const afterTime = new Date().toISOString();
      
      // exportedAt should be a valid ISO timestamp
      expect(data.exportedAt).toBeDefined();
      const exportedAt = new Date(data.exportedAt);
      expect(exportedAt.getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
      expect(exportedAt.getTime()).toBeLessThanOrEqual(new Date(afterTime).getTime());
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    test('should handle user with large amount of data', async () => {
      // Create multiple sandboxes with sessions
      for (let i = 0; i < 10; i++) {
        createTestSandbox(DEFAULT_USER_ID, `bulk-sandbox-${i}`, `Bulk Sandbox ${i}`);
        createTestChatSession(`bulk-sandbox-${i}`, `bulk-session-${i}`, `Bulk Session ${i}`);
      }
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.sandboxes.length).toBe(10);
      expect(data.chatHistory.length).toBe(10);
    });

    test('should handle concurrent account info requests', async () => {
      createTestSandbox(DEFAULT_USER_ID, 'concurrent-sandbox', 'Concurrent Test');
      
      const requests = Array(5).fill(null).map(() =>
        app.request('/api/account', {
          headers: AUTH_HEADER,
        })
      );
      
      const responses = await Promise.all(requests);
      
      for (const res of responses) {
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.stats.sandboxCount).toBe(1);
      }
    });

    test('should handle special characters in sandbox names', async () => {
      const specialName = "Test's Sandbox & More <> \"quotes\"";
      createTestSandbox(DEFAULT_USER_ID, 'special-chars-sandbox', specialName);
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.sandboxes.length).toBe(1);
      expect(data.sandboxes[0].name).toBe(specialName);
    });

    test('should count chat sessions correctly across many sandboxes', async () => {
      // Create sandboxes with varying numbers of sessions
      createTestSandbox(DEFAULT_USER_ID, 'count-sandbox-1', 'Count 1');
      createTestSandbox(DEFAULT_USER_ID, 'count-sandbox-2', 'Count 2');
      createTestSandbox(DEFAULT_USER_ID, 'count-sandbox-3', 'Count 3');
      
      // Sandbox 1: 3 sessions
      createTestChatSession('count-sandbox-1', 'count-s1-a', 'Session A');
      createTestChatSession('count-sandbox-1', 'count-s1-b', 'Session B');
      createTestChatSession('count-sandbox-1', 'count-s1-c', 'Session C');
      
      // Sandbox 2: 2 sessions
      createTestChatSession('count-sandbox-2', 'count-s2-a', 'Session A');
      createTestChatSession('count-sandbox-2', 'count-s2-b', 'Session B');
      
      // Sandbox 3: 1 session
      createTestChatSession('count-sandbox-3', 'count-s3-a', 'Session A');
      
      const res = await app.request('/api/account', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.stats.sandboxCount).toBe(3);
      expect(data.stats.chatSessionCount).toBe(6); // 3 + 2 + 1
    });
  });
});
