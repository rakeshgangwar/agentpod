/**
 * Agent Session Model Tests
 * 
 * Tests for session persistence and message history.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { 
  cleanupTestDatabase, 
  ensureDbInitialized,
} from '../setup';

// Set up test env before any imports
import '../setup';

// Import models after setup
import {
  createAgentSession,
  getAgentSession,
  getAgentSessionByAcpId,
  getProjectSessions,
  updateAgentSession,
  deleteAgentSession,
  endAgentSession,
  getActiveSessionCount,
  addSessionMessage,
  getSessionMessages,
  getSessionMessage,
  clearSessionMessages,
  getLastSessionMessage,
} from '../../src/models/agent-session';

import { db } from '../../src/db/index';

describe('Agent Session Model', () => {
  const TEST_PROJECT_ID = 'test-project-123';

  beforeAll(() => {
    ensureDbInitialized();
    
    // Create a test project for foreign key constraint
    db.query(`
      INSERT OR IGNORE INTO projects (
        id, name, slug, forgejo_repo_url, forgejo_owner, 
        coolify_app_uuid, coolify_server_uuid
      ) VALUES (
        $id, 'Test Project', 'test-project', 'http://test.git/repo',
        'testuser', 'app-uuid', 'server-uuid'
      )
    `).run({ $id: TEST_PROJECT_ID });
  });

  beforeEach(() => {
    // Clean up sessions and messages before each test
    db.query('DELETE FROM agent_sessions WHERE project_id = $projectId').run({
      $projectId: TEST_PROJECT_ID,
    });
  });

  afterAll(() => {
    // Clean up test project
    db.query('DELETE FROM projects WHERE id = $id').run({ $id: TEST_PROJECT_ID });
    cleanupTestDatabase();
  });

  // =========================================================================
  // Session CRUD Tests
  // =========================================================================

  describe('createAgentSession', () => {
    test('creates new session with defaults', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-session-123',
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.projectId).toBe(TEST_PROJECT_ID);
      expect(session.agentId).toBe('opencode');
      expect(session.acpSessionId).toBe('acp-session-123');
      expect(session.status).toBe('active');
      expect(session.workingDirectory).toBe('/workspace');
      expect(session.messageCount).toBe(0);
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
      expect(session.endedAt).toBeNull();
    });

    test('creates session with custom working directory', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'claude-code',
        acpSessionId: 'acp-session-456',
        workingDirectory: '/custom/path',
      });

      expect(session.workingDirectory).toBe('/custom/path');
    });
  });

  describe('getAgentSession', () => {
    test('returns null for non-existent session', () => {
      const session = getAgentSession('non-existent-id');
      expect(session).toBeNull();
    });

    test('retrieves existing session', () => {
      const created = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-123',
      });

      const retrieved = getAgentSession(created.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.projectId).toBe(TEST_PROJECT_ID);
    });
  });

  describe('getAgentSessionByAcpId', () => {
    test('finds session by ACP session ID', () => {
      const created = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'gemini-cli',
        acpSessionId: 'unique-acp-id',
      });

      const found = getAgentSessionByAcpId('unique-acp-id');
      
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    test('returns null for unknown ACP session ID', () => {
      const found = getAgentSessionByAcpId('unknown-acp-id');
      expect(found).toBeNull();
    });
  });

  describe('getProjectSessions', () => {
    test('returns empty array when no sessions', () => {
      const sessions = getProjectSessions(TEST_PROJECT_ID);
      expect(sessions).toEqual([]);
    });

    test('returns all active sessions for project', () => {
      createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });
      createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'claude-code',
        acpSessionId: 'acp-2',
      });

      const sessions = getProjectSessions(TEST_PROJECT_ID);
      expect(sessions.length).toBe(2);
    });

    test('excludes ended sessions by default', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });
      endAgentSession(session.id);

      const sessions = getProjectSessions(TEST_PROJECT_ID);
      expect(sessions.length).toBe(0);
    });

    test('includes ended sessions when requested', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });
      endAgentSession(session.id);

      const sessions = getProjectSessions(TEST_PROJECT_ID, true);
      expect(sessions.length).toBe(1);
      expect(sessions[0].status).toBe('ended');
    });
  });

  describe('updateAgentSession', () => {
    test('updates session status', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const updated = updateAgentSession(session.id, { status: 'processing' });
      
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('processing');
    });

    test('updates message count', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const updated = updateAgentSession(session.id, { messageCount: 5 });
      
      expect(updated!.messageCount).toBe(5);
    });

    test('returns null for non-existent session', () => {
      const updated = updateAgentSession('non-existent', { status: 'idle' });
      expect(updated).toBeNull();
    });
  });

  describe('deleteAgentSession', () => {
    test('deletes existing session', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const deleted = deleteAgentSession(session.id);
      expect(deleted).toBe(true);

      const retrieved = getAgentSession(session.id);
      expect(retrieved).toBeNull();
    });

    test('returns false for non-existent session', () => {
      const deleted = deleteAgentSession('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('endAgentSession', () => {
    test('marks session as ended with timestamp', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const ended = endAgentSession(session.id);
      
      expect(ended).toBeDefined();
      expect(ended!.status).toBe('ended');
      expect(ended!.endedAt).toBeDefined();
    });
  });

  describe('getActiveSessionCount', () => {
    test('returns 0 when no sessions', () => {
      const count = getActiveSessionCount(TEST_PROJECT_ID);
      expect(count).toBe(0);
    });

    test('counts only active sessions', () => {
      createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });
      const session2 = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'claude-code',
        acpSessionId: 'acp-2',
      });
      endAgentSession(session2.id);

      const count = getActiveSessionCount(TEST_PROJECT_ID);
      expect(count).toBe(1);
    });
  });

  // =========================================================================
  // Message Tests
  // =========================================================================

  describe('addSessionMessage', () => {
    test('adds user message', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const message = addSessionMessage({
        sessionId: session.id,
        role: 'user',
        content: 'Hello, world!',
      });

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.sessionId).toBe(session.id);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, world!');
      expect(message.isPartial).toBe(false);

      // Check message count was incremented
      const updated = getAgentSession(session.id);
      expect(updated!.messageCount).toBe(1);
    });

    test('adds assistant message with tool info', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const message = addSessionMessage({
        sessionId: session.id,
        role: 'assistant',
        content: 'I will read the file.',
        toolName: 'readFile',
        toolInput: { path: '/test.txt' },
        toolResult: { content: 'file contents' },
      });

      expect(message.role).toBe('assistant');
      expect(message.toolName).toBe('readFile');
      expect(message.toolInput).toBe('{"path":"/test.txt"}');
      expect(message.toolResult).toBe('{"content":"file contents"}');
    });

    test('adds partial message', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const message = addSessionMessage({
        sessionId: session.id,
        role: 'assistant',
        content: 'Thinking...',
        isPartial: true,
      });

      expect(message.isPartial).toBe(true);
    });
  });

  describe('getSessionMessages', () => {
    test('returns empty array when no messages', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const messages = getSessionMessages(session.id);
      expect(messages).toEqual([]);
    });

    test('returns messages in chronological order', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      addSessionMessage({
        sessionId: session.id,
        role: 'user',
        content: 'First',
      });
      addSessionMessage({
        sessionId: session.id,
        role: 'assistant',
        content: 'Second',
      });
      addSessionMessage({
        sessionId: session.id,
        role: 'user',
        content: 'Third',
      });

      const messages = getSessionMessages(session.id);
      expect(messages.length).toBe(3);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });

    test('respects limit parameter', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      for (let i = 0; i < 10; i++) {
        addSessionMessage({
          sessionId: session.id,
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const messages = getSessionMessages(session.id, 5);
      expect(messages.length).toBe(5);
    });
  });

  describe('getLastSessionMessage', () => {
    test('returns null when no messages', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      const last = getLastSessionMessage(session.id);
      expect(last).toBeNull();
    });

    test('returns most recent message', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      addSessionMessage({
        sessionId: session.id,
        role: 'user',
        content: 'First',
      });
      addSessionMessage({
        sessionId: session.id,
        role: 'assistant',
        content: 'Last',
      });

      const last = getLastSessionMessage(session.id);
      expect(last).toBeDefined();
      expect(last!.content).toBe('Last');
    });
  });

  describe('clearSessionMessages', () => {
    test('removes all messages and resets count', () => {
      const session = createAgentSession({
        projectId: TEST_PROJECT_ID,
        agentId: 'opencode',
        acpSessionId: 'acp-1',
      });

      addSessionMessage({
        sessionId: session.id,
        role: 'user',
        content: 'Message 1',
      });
      addSessionMessage({
        sessionId: session.id,
        role: 'assistant',
        content: 'Message 2',
      });

      const deleted = clearSessionMessages(session.id);
      expect(deleted).toBe(2);

      const messages = getSessionMessages(session.id);
      expect(messages.length).toBe(0);

      const updated = getAgentSession(session.id);
      expect(updated!.messageCount).toBe(0);
    });
  });
});
