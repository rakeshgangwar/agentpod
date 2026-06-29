/**
 * Integration Tests for Account Routes
 * 
 * Tests the /api/account endpoints which manage:
 * - Account info retrieval (GET /api/account)
 * - Account deletion with data cleanup (DELETE /api/account)
 * - User data export for GDPR compliance (GET /api/account/data-export)
 */

// IMPORTANT: Import setup first to set environment variables
import '../setup';

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../../src/db/drizzle';
import { 
  user, 
  session, 
  account,
  userPreferences, 
  userOpencodeConfig, 
  userOpencodeFiles,
  activityLog,
  sandboxes,
  chatSessions,
  chatMessages,
} from '../../src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

import { app } from '../../src/index';

// =============================================================================
// Constants
// =============================================================================

const AUTH_HEADER = { 'Authorization': 'Bearer test-token' };
// The default user ID when using API key auth (from config.defaultUserId)
const DEFAULT_USER_ID = 'default-user';

// =============================================================================
// Test Helpers
// =============================================================================

async function createTestUser(userId: string = DEFAULT_USER_ID, email: string = 'default@test.com'): Promise<void> {
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: 'Default Test User',
    email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

async function deleteTestUser(userId: string = DEFAULT_USER_ID): Promise<void> {
  // Clean up in reverse order of foreign key dependencies
  // Note: Most tables have ON DELETE CASCADE, but we clean explicitly for safety
  await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
  await db.delete(userOpencodeFiles).where(eq(userOpencodeFiles.userId, userId));
  await db.delete(userOpencodeConfig).where(eq(userOpencodeConfig.userId, userId));
  await db.delete(activityLog).where(eq(activityLog.userId, userId));
  
  // Delete chat sessions (cascade will delete messages)
  const userSandboxes = await db.select({ id: sandboxes.id }).from(sandboxes).where(eq(sandboxes.userId, userId));
  for (const sandbox of userSandboxes) {
    await db.delete(chatSessions).where(eq(chatSessions.sandboxId, sandbox.id));
  }
  
  // Delete sandboxes
  await db.delete(sandboxes).where(eq(sandboxes.userId, userId));
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(account).where(eq(account.userId, userId));
  await db.delete(user).where(eq(user.id, userId));
}

async function createTestSandbox(userId: string, sandboxId: string, name: string): Promise<void> {
  const now = new Date();
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  await db.insert(sandboxes).values({
    id: sandboxId,
    userId,
    name,
    slug,
    repoName: `test-repo-${sandboxId}`,
    status: 'stopped',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

async function createTestChatSession(sandboxId: string, sessionId: string, title: string, userId: string = DEFAULT_USER_ID): Promise<void> {
  const now = new Date();
  await db.insert(chatSessions).values({
    id: sessionId,
    sandboxId,
    userId,
    source: 'opencode',
    title,
    messageCount: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

async function createTestActivityLog(userId: string, action: string): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(activityLog).values({
    id,
    userId,
    action,
    ipAddress: '127.0.0.1',
    userAgent: 'Test Agent',
    createdAt: now,
  });
}

async function createTestPreferences(userId: string): Promise<void> {
  const now = new Date();
  await db.insert(userPreferences).values({
    id: crypto.randomUUID(),
    userId,
    themeMode: 'dark',
    themePreset: 'ocean-blue',
    settingsVersion: 1,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

async function createTestOpenCodeConfig(userId: string): Promise<void> {
  const now = new Date();
  await db.insert(userOpencodeConfig).values({
    id: crypto.randomUUID(),
    userId,
    settings: '{"theme":"dark"}',
    agentsMd: '# Agents Config',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

async function cleanupAllTestData(): Promise<void> {
  // Clean up all test data for default user
  await db.delete(activityLog).where(eq(activityLog.userId, DEFAULT_USER_ID));
  await db.delete(userPreferences).where(eq(userPreferences.userId, DEFAULT_USER_ID));
  await db.delete(userOpencodeFiles).where(eq(userOpencodeFiles.userId, DEFAULT_USER_ID));
  await db.delete(userOpencodeConfig).where(eq(userOpencodeConfig.userId, DEFAULT_USER_ID));
  
  // Get user's sandboxes
  const userSandboxes = await db.select({ id: sandboxes.id }).from(sandboxes).where(eq(sandboxes.userId, DEFAULT_USER_ID));
  
  // Delete chat sessions (cascade will delete messages)
  for (const sandbox of userSandboxes) {
    await db.delete(chatSessions).where(eq(chatSessions.sandboxId, sandbox.id));
  }
  
  // Delete sandboxes
  await db.delete(sandboxes).where(eq(sandboxes.userId, DEFAULT_USER_ID));
}

// =============================================================================
// Tests
// =============================================================================

describe('Account Routes Integration Tests', () => {
  beforeAll(async () => {
    // Create the test user (foreign key constraint)
    await createTestUser();
  });

  afterAll(async () => {
    await cleanupAllTestData();
    await deleteTestUser();
  });

  beforeEach(async () => {
    await cleanupAllTestData();
    // Recreate user if it was deleted
    await createTestUser();
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
      await createTestSandbox(DEFAULT_USER_ID, 'sandbox-1', 'Test Sandbox 1');
      await createTestSandbox(DEFAULT_USER_ID, 'sandbox-2', 'Test Sandbox 2');
      await createTestSandbox(DEFAULT_USER_ID, 'sandbox-3', 'Test Sandbox 3');
      
      const res = await app.request('/api/account', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.stats.sandboxCount).toBe(3);
    });

    test('should return correct chat session count', async () => {
      // Create sandbox and chat sessions
      await createTestSandbox(DEFAULT_USER_ID, 'sandbox-chat', 'Chat Test Sandbox');
      await createTestChatSession('sandbox-chat', 'session-1', 'Session 1');
      await createTestChatSession('sandbox-chat', 'session-2', 'Session 2');
      
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
      await createTestSandbox(DEFAULT_USER_ID, 'sandbox-a', 'Sandbox A');
      await createTestSandbox(DEFAULT_USER_ID, 'sandbox-b', 'Sandbox B');
      await createTestChatSession('sandbox-a', 'session-a1', 'Session A1');
      await createTestChatSession('sandbox-a', 'session-a2', 'Session A2');
      await createTestChatSession('sandbox-b', 'session-b1', 'Session B1');
      
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
      await createTestPreferences(DEFAULT_USER_ID);
      
      // Verify preferences exist
      const [prefsBefore] = await db.select({ userId: userPreferences.userId })
        .from(userPreferences)
        .where(eq(userPreferences.userId, DEFAULT_USER_ID));
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
      const [prefsAfter] = await db.select({ userId: userPreferences.userId })
        .from(userPreferences)
        .where(eq(userPreferences.userId, DEFAULT_USER_ID));
      expect(prefsAfter).toBeUndefined();
    });

    test('should anonymize activity logs when deleting account', async () => {
      // Create activity logs
      await createTestActivityLog(DEFAULT_USER_ID, 'sandbox.create');
      await createTestActivityLog(DEFAULT_USER_ID, 'chat.message_send');
      
      // Verify logs exist with user_id
      const logsBefore = await db.select({ userId: activityLog.userId, anonymized: activityLog.anonymized })
        .from(activityLog)
        .where(eq(activityLog.userId, DEFAULT_USER_ID));
      expect(logsBefore.length).toBe(2);
      expect(logsBefore[0].anonymized).toBe(false);
      
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
      const logsAfter = await db.select({ userId: activityLog.userId, anonymized: activityLog.anonymized })
        .from(activityLog)
        .where(eq(activityLog.anonymized, true));
      expect(logsAfter.length).toBeGreaterThanOrEqual(2);
      expect(logsAfter.every(log => log.userId === null)).toBe(true);
    });

    // Note: provider_credentials is global (not per-user) in this schema
    // Account deletion doesn't affect provider_credentials

    test('should delete OpenCode config when deleting account', async () => {
      // Create OpenCode config
      await createTestOpenCodeConfig(DEFAULT_USER_ID);
      
      // Verify config exists
      const [configBefore] = await db.select({ userId: userOpencodeConfig.userId })
        .from(userOpencodeConfig)
        .where(eq(userOpencodeConfig.userId, DEFAULT_USER_ID));
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
      const [configAfter] = await db.select({ userId: userOpencodeConfig.userId })
        .from(userOpencodeConfig)
        .where(eq(userOpencodeConfig.userId, DEFAULT_USER_ID));
      expect(configAfter).toBeUndefined();
    });

    test('should return results summary', async () => {
      // Set up data to delete
      await createTestPreferences(DEFAULT_USER_ID);
      await createTestActivityLog(DEFAULT_USER_ID, 'test.action');
      await createTestOpenCodeConfig(DEFAULT_USER_ID);
      
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
      expect(data.preferences == null).toBe(true);
    });

    test('should include sandboxes in export', async () => {
      await createTestSandbox(DEFAULT_USER_ID, 'export-sandbox-1', 'Export Test 1');
      await createTestSandbox(DEFAULT_USER_ID, 'export-sandbox-2', 'Export Test 2');
      
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
      await createTestSandbox(DEFAULT_USER_ID, 'chat-export-sandbox', 'Chat Export');
      await createTestChatSession('chat-export-sandbox', 'export-session-1', 'Export Session 1');
      await createTestChatSession('chat-export-sandbox', 'export-session-2', 'Export Session 2');
      
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
      await createTestPreferences(DEFAULT_USER_ID);
      
      const res = await app.request('/api/account/data-export', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.preferences).toBeDefined();
      expect(data.preferences.themeMode).toBe('dark');
      expect(data.preferences.themePreset).toBe('ocean-blue');
    });

    test('should include OpenCode config in export', async () => {
      await createTestOpenCodeConfig(DEFAULT_USER_ID);
      
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
      await createTestSandbox(DEFAULT_USER_ID, 'json-test-sandbox', 'JSON Test');
      await createTestChatSession('json-test-sandbox', 'json-test-session', 'JSON Session');
      await createTestPreferences(DEFAULT_USER_ID);
      await createTestOpenCodeConfig(DEFAULT_USER_ID);
      
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
        await createTestSandbox(DEFAULT_USER_ID, `bulk-sandbox-${i}`, `Bulk Sandbox ${i}`);
        await createTestChatSession(`bulk-sandbox-${i}`, `bulk-session-${i}`, `Bulk Session ${i}`);
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
      await createTestSandbox(DEFAULT_USER_ID, 'concurrent-sandbox', 'Concurrent Test');
      
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
      await createTestSandbox(DEFAULT_USER_ID, 'special-chars-sandbox', specialName);
      
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
      await createTestSandbox(DEFAULT_USER_ID, 'count-sandbox-1', 'Count 1');
      await createTestSandbox(DEFAULT_USER_ID, 'count-sandbox-2', 'Count 2');
      await createTestSandbox(DEFAULT_USER_ID, 'count-sandbox-3', 'Count 3');
      
      // Sandbox 1: 3 sessions
      await createTestChatSession('count-sandbox-1', 'count-s1-a', 'Session A');
      await createTestChatSession('count-sandbox-1', 'count-s1-b', 'Session B');
      await createTestChatSession('count-sandbox-1', 'count-s1-c', 'Session C');
      
      // Sandbox 2: 2 sessions
      await createTestChatSession('count-sandbox-2', 'count-s2-a', 'Session A');
      await createTestChatSession('count-sandbox-2', 'count-s2-b', 'Session B');
      
      // Sandbox 3: 1 session
      await createTestChatSession('count-sandbox-3', 'count-s3-a', 'Session A');
      
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
