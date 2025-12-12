/**
 * Integration Tests for Data Persistence Features
 * Tests the full user data persistence system including:
 * - User Preferences
 * - Activity Logging
 * - Chat Sessions/Messages (models only - no live sandbox)
 * - Account Management
 */

// IMPORTANT: Import setup first to set environment variables
import '../setup';

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../../src/db/index';

// Import models directly for testing
import * as UserPreferencesModel from '../../src/models/user-preferences';
import * as ActivityLogModel from '../../src/models/activity-log';
import * as ChatSessionModel from '../../src/models/chat-session';
import * as ChatMessageModel from '../../src/models/chat-message';
import * as SandboxModel from '../../src/models/sandbox';

// Test user ID
const TEST_USER_ID = 'test-user-persistence-123';
const TEST_USER_ID_2 = 'test-user-persistence-456';

// =============================================================================
// Setup & Teardown
// =============================================================================

beforeAll(() => {
  // Ensure test user exists in the user table (required for foreign keys)
  try {
    db.run(
      "INSERT OR IGNORE INTO user (id, email, name, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))",
      [TEST_USER_ID, 'test@persistence.test', 'Test User']
    );
    db.run(
      "INSERT OR IGNORE INTO user (id, email, name, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))",
      [TEST_USER_ID_2, 'test2@persistence.test', 'Test User 2']
    );
  } catch (e) {
    // User might already exist
  }
});

afterAll(() => {
  // Clean up test data
  try {
    db.run('DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id = ?)', [TEST_USER_ID]);
    db.run('DELETE FROM chat_sessions WHERE user_id = ?', [TEST_USER_ID]);
    db.run('DELETE FROM sandboxes WHERE user_id = ?', [TEST_USER_ID]);
    db.run('DELETE FROM activity_log WHERE user_id = ?', [TEST_USER_ID]);
    db.run('DELETE FROM activity_log WHERE user_id = ?', [TEST_USER_ID_2]);
    db.run('DELETE FROM user_preferences WHERE user_id = ?', [TEST_USER_ID]);
    db.run('DELETE FROM user_preferences WHERE user_id = ?', [TEST_USER_ID_2]);
  } catch (e) {
    // Ignore cleanup errors
  }
});

// =============================================================================
// User Preferences Tests
// =============================================================================

describe('User Preferences Model', () => {
  beforeEach(() => {
    // Clean up preferences before each test
    UserPreferencesModel.deleteUserPreferences(TEST_USER_ID);
  });

  test('should create default preferences for new user', () => {
    const prefs = UserPreferencesModel.createUserPreferences(TEST_USER_ID);
    
    expect(prefs.userId).toBe(TEST_USER_ID);
    expect(prefs.themeMode).toBe('system');
    expect(prefs.themePreset).toBe('default-neutral');
    expect(prefs.autoRefreshInterval).toBe(30);
    expect(prefs.inAppNotifications).toBe(true);
    expect(prefs.systemNotifications).toBe(true);
    expect(prefs.defaultResourceTierId).toBe('starter');
    expect(prefs.defaultFlavorId).toBe('fullstack');
    expect(prefs.settingsVersion).toBe(1);
  });

  test('should get existing preferences', () => {
    UserPreferencesModel.createUserPreferences(TEST_USER_ID);
    const prefs = UserPreferencesModel.getUserPreferences(TEST_USER_ID);
    
    expect(prefs).not.toBeNull();
    expect(prefs!.userId).toBe(TEST_USER_ID);
  });

  test('should return null for non-existent user', () => {
    const prefs = UserPreferencesModel.getUserPreferences('non-existent-user');
    expect(prefs).toBeNull();
  });

  test('should get or create preferences', () => {
    // First call creates
    const prefs1 = UserPreferencesModel.getOrCreateUserPreferences(TEST_USER_ID);
    expect(prefs1.userId).toBe(TEST_USER_ID);
    
    // Second call gets existing
    const prefs2 = UserPreferencesModel.getOrCreateUserPreferences(TEST_USER_ID);
    expect(prefs2.id).toBe(prefs1.id);
  });

  test('should update preferences and increment version', () => {
    UserPreferencesModel.createUserPreferences(TEST_USER_ID);
    
    const updated = UserPreferencesModel.updateUserPreferences(TEST_USER_ID, {
      themeMode: 'dark',
      autoRefreshInterval: 60,
    });
    
    expect(updated!.themeMode).toBe('dark');
    expect(updated!.autoRefreshInterval).toBe(60);
    expect(updated!.settingsVersion).toBe(2); // Incremented
  });

  test('should track sync version correctly', () => {
    UserPreferencesModel.createUserPreferences(TEST_USER_ID);
    
    const initialVersion = UserPreferencesModel.getSettingsVersion(TEST_USER_ID);
    expect(initialVersion).toBe(1);
    
    UserPreferencesModel.updateUserPreferences(TEST_USER_ID, { themeMode: 'light' });
    
    const newVersion = UserPreferencesModel.getSettingsVersion(TEST_USER_ID);
    expect(newVersion).toBe(2);
    
    // Check out of sync
    expect(UserPreferencesModel.isOutOfSync(TEST_USER_ID, 1)).toBe(true);
    expect(UserPreferencesModel.isOutOfSync(TEST_USER_ID, 2)).toBe(false);
  });

  test('should delete preferences', () => {
    UserPreferencesModel.createUserPreferences(TEST_USER_ID);
    
    const deleted = UserPreferencesModel.deleteUserPreferences(TEST_USER_ID);
    expect(deleted).toBe(true);
    
    const prefs = UserPreferencesModel.getUserPreferences(TEST_USER_ID);
    expect(prefs).toBeNull();
  });
});

// =============================================================================
// Activity Log Tests
// =============================================================================

describe('Activity Log Model', () => {
  beforeEach(() => {
    // Clean up activity logs before each test
    db.run('DELETE FROM activity_log WHERE user_id = ?', [TEST_USER_ID]);
    db.run('DELETE FROM activity_log WHERE user_id = ?', [TEST_USER_ID_2]);
  });

  test('should create activity log entry', () => {
    const log = ActivityLogModel.createActivityLog({
      userId: TEST_USER_ID,
      action: 'sandbox.create',
      entityType: 'sandbox',
      entityId: 'test-sandbox-1',
      metadata: { sandboxName: 'Test Sandbox' },
    });
    
    expect(log.userId).toBe(TEST_USER_ID);
    expect(log.action).toBe('sandbox.create');
    expect(log.entityType).toBe('sandbox');
    expect(log.entityId).toBe('test-sandbox-1');
    expect(log.metadata?.sandboxName).toBe('Test Sandbox');
    expect(log.anonymized).toBe(false);
  });

  test('should list activity logs by user', () => {
    // Create multiple logs
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.create' });
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.start' });
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID_2, action: 'sandbox.create' });
    
    const logs = ActivityLogModel.listActivityLogsByUserId(TEST_USER_ID);
    
    expect(logs.length).toBe(2);
    expect(logs.every(l => l.userId === TEST_USER_ID)).toBe(true);
  });

  test('should filter logs by action', () => {
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.create' });
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.start' });
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.create' });
    
    const logs = ActivityLogModel.listActivityLogsByUserId(TEST_USER_ID, { action: 'sandbox.create' });
    
    expect(logs.length).toBe(2);
    expect(logs.every(l => l.action === 'sandbox.create')).toBe(true);
  });

  test('should count activity logs', () => {
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.create' });
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.start' });
    
    const count = ActivityLogModel.countActivityLogsByUserId(TEST_USER_ID);
    expect(count).toBe(2);
  });

  test('should get activity stats', () => {
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.create' });
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.create' });
    ActivityLogModel.createActivityLog({ userId: TEST_USER_ID, action: 'sandbox.start' });
    
    const stats = ActivityLogModel.getActivityStats();
    
    const createStat = stats.find(s => s.action === 'sandbox.create');
    const startStat = stats.find(s => s.action === 'sandbox.start');
    
    expect(createStat?.count).toBeGreaterThanOrEqual(2);
    expect(startStat?.count).toBeGreaterThanOrEqual(1);
  });

  test('should anonymize user logs', () => {
    ActivityLogModel.createActivityLog({
      userId: TEST_USER_ID,
      action: 'auth.login',
      ipAddress: '192.168.1.1',
      userAgent: 'Test Browser',
    });
    
    const anonymizedCount = ActivityLogModel.anonymizeUserLogs(TEST_USER_ID);
    expect(anonymizedCount).toBe(1);
    
    // Check that logs are anonymized
    const logs = db.query<{ user_id: string | null; anonymized: number; ip_address: string | null }, []>(
      'SELECT user_id, anonymized, ip_address FROM activity_log WHERE action = ?'
    ).all('auth.login');
    
    const anonymizedLog = logs.find(l => l.anonymized === 1);
    expect(anonymizedLog).toBeDefined();
    expect(anonymizedLog?.user_id).toBeNull();
    expect(anonymizedLog?.ip_address).toBeNull();
  });

  test('convenience functions should work', () => {
    const loginLog = ActivityLogModel.logLogin(TEST_USER_ID, '10.0.0.1', 'Mozilla/5.0');
    expect(loginLog.action).toBe('auth.login');
    expect(loginLog.ipAddress).toBe('10.0.0.1');
    
    const sandboxLog = ActivityLogModel.logSandboxCreate(TEST_USER_ID, 'sandbox-123', 'My Project');
    expect(sandboxLog.action).toBe('sandbox.create');
    expect(sandboxLog.entityId).toBe('sandbox-123');
    expect(sandboxLog.metadata?.sandboxName).toBe('My Project');
  });
});

// =============================================================================
// Sandbox Model Tests
// =============================================================================

describe('Sandbox Model', () => {
  let testSandboxId: string;

  beforeEach(() => {
    // Clean up sandboxes before each test
    db.run('DELETE FROM sandboxes WHERE user_id = ?', [TEST_USER_ID]);
    testSandboxId = `test-sandbox-${Date.now()}`;
  });

  test('should create sandbox', () => {
    const sandbox = SandboxModel.createSandbox({
      id: testSandboxId,
      userId: TEST_USER_ID,
      name: 'Test Sandbox',
      slug: 'test-sandbox',
      description: 'A test sandbox',
      repoName: 'test-repo',
      resourceTierId: 'builder',
      flavorId: 'js',
      addonIds: ['code-server', 'vnc'],
    });
    
    expect(sandbox.id).toBe(testSandboxId);
    expect(sandbox.userId).toBe(TEST_USER_ID);
    expect(sandbox.name).toBe('Test Sandbox');
    expect(sandbox.status).toBe('created');
    expect(sandbox.flavorId).toBe('js');
  });

  test('should get sandbox by ID', () => {
    SandboxModel.createSandbox({
      id: testSandboxId,
      userId: TEST_USER_ID,
      name: 'Test',
      slug: 'test',
      repoName: 'repo',
    });
    
    const sandbox = SandboxModel.getSandboxById(testSandboxId);
    expect(sandbox).not.toBeNull();
    expect(sandbox!.id).toBe(testSandboxId);
  });

  test('should list sandboxes by user', () => {
    SandboxModel.createSandbox({ id: `${testSandboxId}-1`, userId: TEST_USER_ID, name: 'S1', slug: 's1', repoName: 'r1' });
    SandboxModel.createSandbox({ id: `${testSandboxId}-2`, userId: TEST_USER_ID, name: 'S2', slug: 's2', repoName: 'r2' });
    
    const sandboxes = SandboxModel.listSandboxesByUserId(TEST_USER_ID);
    expect(sandboxes.length).toBeGreaterThanOrEqual(2);
  });

  test('should update sandbox status', () => {
    SandboxModel.createSandbox({ id: testSandboxId, userId: TEST_USER_ID, name: 'Test', slug: 'test', repoName: 'repo' });
    
    SandboxModel.updateSandboxStatus(testSandboxId, 'running');
    let sandbox = SandboxModel.getSandboxById(testSandboxId);
    expect(sandbox!.status).toBe('running');
    
    SandboxModel.updateSandboxStatus(testSandboxId, 'error', 'Something went wrong');
    sandbox = SandboxModel.getSandboxById(testSandboxId);
    expect(sandbox!.status).toBe('error');
    expect(sandbox!.errorMessage).toBe('Something went wrong');
  });

  test('should update sandbox URLs', () => {
    SandboxModel.createSandbox({ id: testSandboxId, userId: TEST_USER_ID, name: 'Test', slug: 'test', repoName: 'repo' });
    
    SandboxModel.updateSandbox(testSandboxId, {
      opencodeUrl: 'http://localhost:4000',
      vncUrl: 'http://localhost:5900',
      codeServerUrl: 'http://localhost:8080',
    });
    
    const sandbox = SandboxModel.getSandboxById(testSandboxId);
    expect(sandbox!.opencodeUrl).toBe('http://localhost:4000');
    expect(sandbox!.vncUrl).toBe('http://localhost:5900');
    expect(sandbox!.codeServerUrl).toBe('http://localhost:8080');
  });

  test('should delete sandbox', () => {
    SandboxModel.createSandbox({ id: testSandboxId, userId: TEST_USER_ID, name: 'Test', slug: 'test', repoName: 'repo' });
    
    const deleted = SandboxModel.deleteSandbox(testSandboxId);
    expect(deleted).toBe(true);
    
    const sandbox = SandboxModel.getSandboxById(testSandboxId);
    expect(sandbox).toBeNull();
  });

  test('should generate unique slug', () => {
    const slug1 = SandboxModel.generateUniqueSlug(TEST_USER_ID, 'My Project');
    expect(slug1).toBe('my-project');
    
    // Create sandbox with that slug
    SandboxModel.createSandbox({ id: `${testSandboxId}-slug`, userId: TEST_USER_ID, name: 'My Project', slug: slug1, repoName: 'repo' });
    
    // Next slug should have suffix
    const slug2 = SandboxModel.generateUniqueSlug(TEST_USER_ID, 'My Project');
    expect(slug2).toBe('my-project-1');
  });
});

// =============================================================================
// Chat Session Model Tests
// =============================================================================

describe('Chat Session Model', () => {
  let testSandboxId: string;
  let testSessionId: string;

  beforeEach(() => {
    testSandboxId = `chat-test-sandbox-${Date.now()}`;
    testSessionId = '';
    
    // Create a test sandbox
    try {
      SandboxModel.createSandbox({
        id: testSandboxId,
        userId: TEST_USER_ID,
        name: 'Chat Test Sandbox',
        slug: `chat-test-${Date.now()}`,
        repoName: `repo-${Date.now()}`,
      });
    } catch (e) {
      // Might already exist
    }
  });

  afterEach(() => {
    // Clean up
    try {
      db.run('DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE sandbox_id = ?)', [testSandboxId]);
      db.run('DELETE FROM chat_sessions WHERE sandbox_id = ?', [testSandboxId]);
      SandboxModel.deleteSandbox(testSandboxId);
    } catch (e) {
      // Ignore
    }
  });

  test('should create chat session', () => {
    const session = ChatSessionModel.createChatSession({
      sandboxId: testSandboxId,
      userId: TEST_USER_ID,
      source: 'opencode',
      title: 'Test Session',
    });
    testSessionId = session.id;
    
    expect(session.sandboxId).toBe(testSandboxId);
    expect(session.userId).toBe(TEST_USER_ID);
    expect(session.source).toBe('opencode');
    expect(session.title).toBe('Test Session');
    expect(session.status).toBe('active');
    expect(session.messageCount).toBe(0);
  });

  test('should get or create OpenCode session', () => {
    const opcSessionId = `opc-session-${Date.now()}`;
    
    // First call creates
    const session1 = ChatSessionModel.getOrCreateOpencodeSession(
      testSandboxId,
      TEST_USER_ID,
      opcSessionId,
      'New Session'
    );
    expect(session1.opencodeSessionId).toBe(opcSessionId);
    
    // Second call gets existing
    const session2 = ChatSessionModel.getOrCreateOpencodeSession(
      testSandboxId,
      TEST_USER_ID,
      opcSessionId
    );
    expect(session2.id).toBe(session1.id);
  });

  test('should list sessions by sandbox', () => {
    ChatSessionModel.createChatSession({ sandboxId: testSandboxId, userId: TEST_USER_ID, source: 'opencode', title: 'S1' });
    ChatSessionModel.createChatSession({ sandboxId: testSandboxId, userId: TEST_USER_ID, source: 'opencode', title: 'S2' });
    
    const sessions = ChatSessionModel.listChatSessionsBySandboxId(testSandboxId);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  test('should get session stats', () => {
    ChatSessionModel.createChatSession({ sandboxId: testSandboxId, userId: TEST_USER_ID, source: 'opencode', status: 'active' });
    ChatSessionModel.createChatSession({ sandboxId: testSandboxId, userId: TEST_USER_ID, source: 'opencode', status: 'archived' });
    
    const stats = ChatSessionModel.getChatSessionStats(testSandboxId);
    expect(stats.total).toBeGreaterThanOrEqual(2);
    expect(stats.active).toBeGreaterThanOrEqual(1);
    expect(stats.archived).toBeGreaterThanOrEqual(1);
  });

  test('should archive session', () => {
    const session = ChatSessionModel.createChatSession({
      sandboxId: testSandboxId,
      userId: TEST_USER_ID,
      source: 'opencode',
    });
    
    ChatSessionModel.archiveChatSession(session.id);
    
    const updated = ChatSessionModel.getChatSessionById(session.id);
    expect(updated!.status).toBe('archived');
  });

  test('should increment message counts', () => {
    const session = ChatSessionModel.createChatSession({
      sandboxId: testSandboxId,
      userId: TEST_USER_ID,
      source: 'opencode',
    });
    
    ChatSessionModel.incrementMessageCount(session.id, 'user');
    ChatSessionModel.incrementMessageCount(session.id, 'assistant');
    ChatSessionModel.incrementMessageCount(session.id, 'assistant');
    
    const updated = ChatSessionModel.getChatSessionById(session.id);
    expect(updated!.messageCount).toBe(3);
    expect(updated!.userMessageCount).toBe(1);
    expect(updated!.assistantMessageCount).toBe(2);
  });
});

// =============================================================================
// Chat Message Model Tests
// =============================================================================

describe('Chat Message Model', () => {
  let testSandboxId: string;
  let testSessionId: string;

  beforeEach(() => {
    testSandboxId = `msg-test-sandbox-${Date.now()}`;
    
    // Create test sandbox and session
    SandboxModel.createSandbox({
      id: testSandboxId,
      userId: TEST_USER_ID,
      name: 'Message Test Sandbox',
      slug: `msg-test-${Date.now()}`,
      repoName: `repo-${Date.now()}`,
    });
    
    const session = ChatSessionModel.createChatSession({
      sandboxId: testSandboxId,
      userId: TEST_USER_ID,
      source: 'opencode',
    });
    testSessionId = session.id;
  });

  afterEach(() => {
    try {
      db.run('DELETE FROM chat_messages WHERE session_id = ?', [testSessionId]);
      db.run('DELETE FROM chat_sessions WHERE id = ?', [testSessionId]);
      SandboxModel.deleteSandbox(testSandboxId);
    } catch (e) {
      // Ignore
    }
  });

  test('should create chat message', () => {
    const message = ChatMessageModel.createChatMessage({
      sessionId: testSessionId,
      role: 'user',
      content: { text: 'Hello, world!' },
    });
    
    expect(message.sessionId).toBe(testSessionId);
    expect(message.role).toBe('user');
    expect(message.content).toEqual({ text: 'Hello, world!' });
    expect(message.status).toBe('complete');
  });

  test('should create message with external ID', () => {
    const externalId = `ext-msg-${Date.now()}`;
    
    const message = ChatMessageModel.createChatMessage({
      sessionId: testSessionId,
      externalMessageId: externalId,
      role: 'assistant',
      content: { text: 'Hello!' },
      modelProvider: 'anthropic',
      modelId: 'claude-3-sonnet',
    });
    
    expect(message.externalMessageId).toBe(externalId);
    expect(message.modelProvider).toBe('anthropic');
    expect(message.modelId).toBe('claude-3-sonnet');
  });

  test('should get message by external ID', () => {
    const externalId = `ext-${Date.now()}`;
    
    ChatMessageModel.createChatMessage({
      sessionId: testSessionId,
      externalMessageId: externalId,
      role: 'user',
      content: {},
    });
    
    const message = ChatMessageModel.getChatMessageByExternalId(testSessionId, externalId);
    expect(message).not.toBeNull();
    expect(message!.externalMessageId).toBe(externalId);
  });

  test('should list messages by session', () => {
    ChatMessageModel.createChatMessage({ sessionId: testSessionId, role: 'user', content: { text: 'Q1' } });
    ChatMessageModel.createChatMessage({ sessionId: testSessionId, role: 'assistant', content: { text: 'A1' } });
    ChatMessageModel.createChatMessage({ sessionId: testSessionId, role: 'user', content: { text: 'Q2' } });
    
    const messages = ChatMessageModel.listChatMessagesBySessionId(testSessionId);
    expect(messages.length).toBe(3);
  });

  test('should get recent messages', () => {
    for (let i = 0; i < 10; i++) {
      ChatMessageModel.createChatMessage({
        sessionId: testSessionId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: { text: `Message ${i}` },
      });
    }
    
    const recent = ChatMessageModel.getRecentMessages(testSessionId, 5);
    expect(recent.length).toBe(5);
  });

  test('should update message', () => {
    const message = ChatMessageModel.createChatMessage({
      sessionId: testSessionId,
      role: 'assistant',
      content: { text: 'Streaming...' },
      status: 'streaming',
    });
    
    ChatMessageModel.updateChatMessage(message.id, {
      content: { text: 'Complete response!' },
      status: 'complete',
      completedAt: new Date().toISOString(),
    });
    
    const updated = ChatMessageModel.getChatMessageById(message.id);
    expect(updated!.content).toEqual({ text: 'Complete response!' });
    expect(updated!.status).toBe('complete');
    expect(updated!.completedAt).not.toBeNull();
  });

  test('should count messages', () => {
    ChatMessageModel.createChatMessage({ sessionId: testSessionId, role: 'user', content: {} });
    ChatMessageModel.createChatMessage({ sessionId: testSessionId, role: 'assistant', content: {} });
    
    const count = ChatMessageModel.getMessageCount(testSessionId);
    expect(count).toBe(2);
  });
});

// =============================================================================
// Database Migration Tests
// =============================================================================

describe('Database Tables Exist', () => {
  test('sandboxes table should exist', () => {
    const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='sandboxes'").get();
    expect(result).not.toBeNull();
  });

  test('chat_sessions table should exist', () => {
    const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'").get();
    expect(result).not.toBeNull();
  });

  test('chat_messages table should exist', () => {
    const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'").get();
    expect(result).not.toBeNull();
  });

  test('user_preferences table should exist', () => {
    const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'").get();
    expect(result).not.toBeNull();
  });

  test('activity_log table should exist', () => {
    const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_log'").get();
    expect(result).not.toBeNull();
  });

  test('activity_log_archive table should exist', () => {
    const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_log_archive'").get();
    expect(result).not.toBeNull();
  });
});
