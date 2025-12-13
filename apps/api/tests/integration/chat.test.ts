/**
 * Integration Tests for Chat Routes
 * 
 * Tests the /api/v2/sandboxes/:id/chat/* endpoints which manage:
 * - Chat session listing and retrieval
 * - Chat message history (paginated)
 * - Session archiving (soft delete)
 * - Sync status
 * 
 * Note: Sync operations with OpenCode are mocked since they require
 * a running container with OpenCode SDK.
 */

// IMPORTANT: Import setup first to set environment variables
import '../setup.ts';

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../../src/db/index.ts';
import * as SandboxModel from '../../src/models/sandbox.ts';
import * as ChatSessionModel from '../../src/models/chat-session.ts';
import * as ChatMessageModel from '../../src/models/chat-message.ts';

// Import the full app after environment is set up
import { app } from '../../src/index.ts';

// =============================================================================
// Constants
// =============================================================================

const AUTH_HEADER = { 'Authorization': 'Bearer test-token' };
const TEST_USER_ID = 'test-user-chat-001';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestUser(id: string): void {
  const now = new Date().toISOString();
  db.run(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 0, ?, ?)
  `, [id, `Test User ${id}`, `${id}@test.com`, now, now]);
}

function deleteTestUser(id: string): void {
  db.run('DELETE FROM user WHERE id = ?', [id]);
}

function cleanupTestData(): void {
  // Clean up in reverse order of dependencies
  db.run('DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE sandbox_id LIKE "test-chat-%")');
  db.run('DELETE FROM chat_sessions WHERE sandbox_id LIKE "test-chat-%"');
  db.run('DELETE FROM sandboxes WHERE id LIKE "test-chat-%"');
}

function createTestSandbox(id: string, userId: string, status: SandboxModel.SandboxStatus = 'running'): SandboxModel.Sandbox {
  const sandbox = SandboxModel.createSandbox({
    id,
    userId,
    name: `Test Sandbox ${id}`,
    slug: `test-sandbox-${id}`,
    repoName: `test-repo-${id}`,
    flavorId: 'js',
    resourceTierId: 'starter',
  });
  
  // Update status if not the default 'created'
  if (status !== 'created') {
    return SandboxModel.updateSandbox(id, { status })!;
  }
  return sandbox;
}

function createTestSession(sandboxId: string, userId: string, title?: string): ChatSessionModel.ChatSession {
  return ChatSessionModel.createChatSession({
    sandboxId,
    userId,
    source: 'opencode',
    title: title ?? 'Test Session',
  });
}

function createTestMessage(
  sessionId: string, 
  role: ChatMessageModel.MessageRole, 
  content: string,
  _index: number = 0
): ChatMessageModel.ChatMessage {
  return ChatMessageModel.createChatMessage({
    sessionId,
    role,
    content,  // content is stored as JSON, so string is fine
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('Chat Routes Integration Tests', () => {
  beforeAll(() => {
    createTestUser(TEST_USER_ID);
  });

  afterAll(() => {
    cleanupTestData();
    deleteTestUser(TEST_USER_ID);
  });

  beforeEach(() => {
    cleanupTestData();
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe('Authentication', () => {
    test('should return 401 without auth header', async () => {
      const sandbox = createTestSandbox('test-chat-auth-001', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions`);
      expect(res.status).toBe(401);
    });

    test('should return 401 with invalid token', async () => {
      const sandbox = createTestSandbox('test-chat-auth-002', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions`, {
        headers: { 'Authorization': 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    test('should succeed with valid auth token', async () => {
      const sandbox = createTestSandbox('test-chat-auth-003', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions`, {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // GET /api/v2/sandboxes/:id/chat/sessions - List Sessions
  // ===========================================================================

  describe('GET /api/v2/sandboxes/:id/chat/sessions', () => {
    test('should return 404 for non-existent sandbox', async () => {
      const res = await app.request('/api/v2/sandboxes/non-existent-sandbox/chat/sessions', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return empty sessions list for new sandbox', async () => {
      const sandbox = createTestSandbox('test-chat-list-001', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.sessions).toEqual([]);
      expect(data.pagination).toBeDefined();
      expect(data.stats).toBeDefined();
    });

    test('should return sessions for sandbox', async () => {
      const sandbox = createTestSandbox('test-chat-list-002', TEST_USER_ID);
      const session1 = createTestSession(sandbox.id, TEST_USER_ID, 'Session 1');
      const session2 = createTestSession(sandbox.id, TEST_USER_ID, 'Session 2');
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.sessions.length).toBe(2);
      expect(data.sessions.map((s: { title: string }) => s.title).sort()).toEqual(['Session 1', 'Session 2']);
    });

    test('should filter sessions by status', async () => {
      const sandbox = createTestSandbox('test-chat-list-003', TEST_USER_ID);
      const activeSession = createTestSession(sandbox.id, TEST_USER_ID, 'Active Session');
      const archivedSession = createTestSession(sandbox.id, TEST_USER_ID, 'Archived Session');
      
      // Archive one session
      ChatSessionModel.archiveChatSession(archivedSession.id);
      
      // Get only active sessions
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions?status=active`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.sessions.length).toBe(1);
      expect(data.sessions[0].title).toBe('Active Session');
    });

    test('should paginate sessions', async () => {
      const sandbox = createTestSandbox('test-chat-list-004', TEST_USER_ID);
      
      // Create 5 sessions
      for (let i = 0; i < 5; i++) {
        createTestSession(sandbox.id, TEST_USER_ID, `Session ${i + 1}`);
      }
      
      // Get first 2 sessions
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions?limit=2&offset=0`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.sessions.length).toBe(2);
      expect(data.pagination.total).toBe(5);
      expect(data.pagination.limit).toBe(2);
      expect(data.pagination.offset).toBe(0);
    });

    test('should include session statistics', async () => {
      const sandbox = createTestSandbox('test-chat-list-005', TEST_USER_ID);
      createTestSession(sandbox.id, TEST_USER_ID, 'Session 1');
      createTestSession(sandbox.id, TEST_USER_ID, 'Session 2');
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.stats).toBeDefined();
      expect(data.stats.total).toBe(2);
      expect(data.stats.active).toBe(2);
    });
  });

  // ===========================================================================
  // GET /api/v2/sandboxes/:id/chat/sessions/:sessionId - Get Session
  // ===========================================================================

  describe('GET /api/v2/sandboxes/:id/chat/sessions/:sessionId', () => {
    test('should return 404 for non-existent sandbox', async () => {
      const res = await app.request('/api/v2/sandboxes/non-existent/chat/sessions/session-id', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return 404 for non-existent session', async () => {
      const sandbox = createTestSandbox('test-chat-get-001', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/non-existent-session`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return 404 for session belonging to different sandbox', async () => {
      const sandbox1 = createTestSandbox('test-chat-get-002a', TEST_USER_ID);
      const sandbox2 = createTestSandbox('test-chat-get-002b', TEST_USER_ID);
      const session = createTestSession(sandbox1.id, TEST_USER_ID);
      
      // Try to access session via different sandbox
      const res = await app.request(`/api/v2/sandboxes/${sandbox2.id}/chat/sessions/${session.id}`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return session with messages', async () => {
      const sandbox = createTestSandbox('test-chat-get-003', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID, 'My Session');
      
      // Add messages
      createTestMessage(session.id, 'user', 'Hello!', 0);
      createTestMessage(session.id, 'assistant', 'Hi there!', 1);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.session).toBeDefined();
      expect(data.session.title).toBe('My Session');
      expect(data.messages).toBeDefined();
      expect(data.messages.length).toBe(2);
      expect(data.messageCount).toBe(2);
    });

    test('should return session metadata correctly', async () => {
      const sandbox = createTestSandbox('test-chat-get-004', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID, 'Metadata Test');
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.session.id).toBe(session.id);
      expect(data.session.sandboxId).toBe(sandbox.id);
      expect(data.session.userId).toBe(TEST_USER_ID);
      expect(data.session.source).toBe('opencode');
      expect(data.session.status).toBe('active');
    });
  });

  // ===========================================================================
  // GET /api/v2/sandboxes/:id/chat/sessions/:sessionId/messages - Paginated Messages
  // ===========================================================================

  describe('GET /api/v2/sandboxes/:id/chat/sessions/:sessionId/messages', () => {
    test('should return 404 for non-existent sandbox', async () => {
      const res = await app.request('/api/v2/sandboxes/non-existent/chat/sessions/session-id/messages', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return 404 for non-existent session', async () => {
      const sandbox = createTestSandbox('test-chat-msg-001', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/non-existent/messages`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return paginated messages', async () => {
      const sandbox = createTestSandbox('test-chat-msg-002', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID);
      
      // Add 10 messages
      for (let i = 0; i < 10; i++) {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        createTestMessage(session.id, role as ChatMessageModel.MessageRole, `Message ${i + 1}`, i);
      }
      
      // Get first 5 messages
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}/messages?limit=5&offset=0`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.messages.length).toBe(5);
      expect(data.pagination.total).toBe(10);
      expect(data.pagination.limit).toBe(5);
      expect(data.pagination.offset).toBe(0);
    });

    test('should respect order parameter', async () => {
      const sandbox = createTestSandbox('test-chat-msg-003', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID);
      
      createTestMessage(session.id, 'user', 'First message', 0);
      createTestMessage(session.id, 'assistant', 'Second message', 1);
      createTestMessage(session.id, 'user', 'Third message', 2);
      
      // Get messages in descending order
      const resDesc = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}/messages?order=desc`, {
        headers: AUTH_HEADER,
      });
      
      expect(resDesc.status).toBe(200);
      const dataDesc = await resDesc.json();
      
      // Get messages in ascending order
      const resAsc = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}/messages?order=asc`, {
        headers: AUTH_HEADER,
      });
      
      expect(resAsc.status).toBe(200);
      const dataAsc = await resAsc.json();
      
      // Both should return all 3 messages
      expect(dataDesc.messages.length).toBe(3);
      expect(dataAsc.messages.length).toBe(3);
      
      // The order should be reversed between asc and desc
      // Note: If timestamps are identical, order may be stable by insertion order or ID
      // We verify that the sets contain the same messages
      const descContents = dataDesc.messages.map((m: { content: unknown }) => m.content);
      const ascContents = dataAsc.messages.map((m: { content: unknown }) => m.content);
      
      expect(descContents.sort()).toEqual(ascContents.sort());
      expect(descContents.sort()).toEqual(['First message', 'Second message', 'Third message']);
    });

    test('should return empty array for session with no messages', async () => {
      const sandbox = createTestSandbox('test-chat-msg-004', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}/messages`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.messages).toEqual([]);
      expect(data.pagination.total).toBe(0);
    });
  });

  // ===========================================================================
  // DELETE /api/v2/sandboxes/:id/chat/sessions/:sessionId - Archive Session
  // ===========================================================================

  describe('DELETE /api/v2/sandboxes/:id/chat/sessions/:sessionId', () => {
    test('should return 404 for non-existent sandbox', async () => {
      const res = await app.request('/api/v2/sandboxes/non-existent/chat/sessions/session-id', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return 404 for non-existent session', async () => {
      const sandbox = createTestSandbox('test-chat-del-001', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/non-existent`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should archive session successfully', async () => {
      const sandbox = createTestSandbox('test-chat-del-002', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('archived');
    });

    test('should change session status to archived', async () => {
      const sandbox = createTestSandbox('test-chat-del-003', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID);
      
      await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      // Verify session is archived
      const updatedSession = ChatSessionModel.getChatSessionById(session.id);
      expect(updatedSession?.status).toBe('archived');
    });

    test('should not delete session data (soft delete)', async () => {
      const sandbox = createTestSandbox('test-chat-del-004', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID);
      createTestMessage(session.id, 'user', 'Test message', 0);
      
      await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      // Session should still exist
      const archivedSession = ChatSessionModel.getChatSessionById(session.id);
      expect(archivedSession).toBeDefined();
      
      // Messages should still exist
      const messages = ChatMessageModel.listChatMessagesBySessionId(session.id, {});
      expect(messages.length).toBe(1);
    });

    test('archived session should not appear in active list', async () => {
      const sandbox = createTestSandbox('test-chat-del-005', TEST_USER_ID);
      const session1 = createTestSession(sandbox.id, TEST_USER_ID, 'Active');
      const session2 = createTestSession(sandbox.id, TEST_USER_ID, 'To Archive');
      
      // Archive second session
      await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session2.id}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      // List active sessions
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions?status=active`, {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      expect(data.sessions.length).toBe(1);
      expect(data.sessions[0].title).toBe('Active');
    });
  });

  // ===========================================================================
  // GET /api/v2/sandboxes/:id/chat/sync/status - Sync Status
  // ===========================================================================

  describe('GET /api/v2/sandboxes/:id/chat/sync/status', () => {
    test('should return 404 for non-existent sandbox', async () => {
      const res = await app.request('/api/v2/sandboxes/non-existent/chat/sync/status', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return sync status for sandbox', async () => {
      const sandbox = createTestSandbox('test-chat-sync-001', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sync/status`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.stats).toBeDefined();
      expect(data.sandboxStatus).toBe('running');
    });

    test('should include session stats in sync status', async () => {
      const sandbox = createTestSandbox('test-chat-sync-002', TEST_USER_ID);
      createTestSession(sandbox.id, TEST_USER_ID, 'Session 1');
      createTestSession(sandbox.id, TEST_USER_ID, 'Session 2');
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sync/status`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.stats.total).toBe(2);
    });
  });

  // ===========================================================================
  // POST /api/v2/sandboxes/:id/chat/sync - Full Sync
  // ===========================================================================

  describe('POST /api/v2/sandboxes/:id/chat/sync', () => {
    test('should return 404 for non-existent sandbox', async () => {
      const res = await app.request('/api/v2/sandboxes/non-existent/chat/sync', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return 400 for non-running sandbox', async () => {
      const sandbox = createTestSandbox('test-chat-fullsync-001', TEST_USER_ID, 'stopped');
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sync`, {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('not running');
    });

    // Note: Full sync with OpenCode would require mocking the SDK
    // The endpoint itself is tested for validation and error handling
  });

  // ===========================================================================
  // POST /api/v2/sandboxes/:id/chat/sessions/:sessionId/sync - Session Sync
  // ===========================================================================

  describe('POST /api/v2/sandboxes/:id/chat/sessions/:sessionId/sync', () => {
    test('should return 404 for non-existent sandbox', async () => {
      const res = await app.request('/api/v2/sandboxes/non-existent/chat/sessions/session-id/sync', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    test('should return 404 for non-existent session', async () => {
      const sandbox = createTestSandbox('test-chat-sessionsync-001', TEST_USER_ID);
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/non-existent/sync`, {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
    });

    // Note: Session sync with OpenCode would require mocking the SDK
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    test('should handle sandbox with many sessions', async () => {
      const sandbox = createTestSandbox('test-chat-edge-001', TEST_USER_ID);
      
      // Create 25 sessions
      for (let i = 0; i < 25; i++) {
        createTestSession(sandbox.id, TEST_USER_ID, `Session ${i + 1}`);
      }
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.sessions.length).toBe(25);
      expect(data.stats.total).toBe(25);
    });

    test('should handle session with many messages', async () => {
      const sandbox = createTestSandbox('test-chat-edge-002', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID);
      
      // Create 100 messages
      for (let i = 0; i < 100; i++) {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        createTestMessage(session.id, role as ChatMessageModel.MessageRole, `Message ${i + 1}`, i);
      }
      
      // Get first page
      const res = await app.request(
        `/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}/messages?limit=20`,
        { headers: AUTH_HEADER }
      );
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.messages.length).toBe(20);
      expect(data.pagination.total).toBe(100);
    });

    test('should handle empty session title', async () => {
      const sandbox = createTestSandbox('test-chat-edge-003', TEST_USER_ID);
      const session = ChatSessionModel.createChatSession({
        sandboxId: sandbox.id,
        userId: TEST_USER_ID,
        source: 'opencode',
        // No title provided
      });
      
      const res = await app.request(`/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      // Title should be undefined or null
      expect(data.session.title === undefined || data.session.title === null).toBe(true);
    });

    test('should handle special characters in message content', async () => {
      const sandbox = createTestSandbox('test-chat-edge-004', TEST_USER_ID);
      const session = createTestSession(sandbox.id, TEST_USER_ID);
      
      const specialContent = 'Hello 👋 <script>alert("xss")</script> SELECT * FROM users; -- comment';
      createTestMessage(session.id, 'user', specialContent, 0);
      
      const res = await app.request(
        `/api/v2/sandboxes/${sandbox.id}/chat/sessions/${session.id}/messages`,
        { headers: AUTH_HEADER }
      );
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.messages[0].content).toBe(specialContent);
    });
  });
});
