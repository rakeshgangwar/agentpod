/**
 * Agent Auth Model Tests
 * 
 * Tests for agent authentication token storage and management.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { 
  cleanupTestDatabase, 
  ensureDbInitialized,
  TEST_DB_PATH,
} from '../setup';

// Set up test env before any imports
import '../setup';

// Import models after setup
import {
  getAgentAuthToken,
  saveAgentAuthToken,
  deleteAgentAuthToken,
  isAgentAuthenticated,
  listAgentAuthTokens,
  getEnvVarsForAgent,
  type AgentId,
} from '../../src/models/agent-auth';

import { db } from '../../src/db/index';

describe('Agent Auth Model', () => {
  const TEST_USER_ID = 'test-user-123';

  beforeAll(() => {
    ensureDbInitialized();
  });

  beforeEach(() => {
    // Clean up tokens before each test
    db.query('DELETE FROM agent_auth_tokens WHERE user_id = $userId').run({
      $userId: TEST_USER_ID,
    });
  });

  afterAll(() => {
    cleanupTestDatabase();
  });

  // =========================================================================
  // Token Storage Tests
  // =========================================================================

  describe('saveAgentAuthToken', () => {
    test('creates new token record', async () => {
      const result = await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'claude-code',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: '2025-12-31T23:59:59.000Z',
        scopes: 'read,write',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(TEST_USER_ID);
      expect(result.agentId).toBe('claude-code');
      expect(result.accessToken).toBe('test-access-token');
      expect(result.refreshToken).toBe('test-refresh-token');
      expect(result.expiresAt).toBe('2025-12-31T23:59:59.000Z');
      expect(result.scopes).toBe('read,write');
    });

    test('updates existing token record', async () => {
      // Create initial token
      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'gemini-cli',
        accessToken: 'old-token',
      });

      // Update token
      const result = await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'gemini-cli',
        accessToken: 'new-token',
        expiresAt: '2026-01-01T00:00:00.000Z',
      });

      expect(result.accessToken).toBe('new-token');
      expect(result.expiresAt).toBe('2026-01-01T00:00:00.000Z');
    });

    test('tokens are encrypted in database', async () => {
      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'qwen-code',
        accessToken: 'plaintext-token',
      });

      // Query directly to check encryption
      const row = db.query(`
        SELECT access_token_encrypted FROM agent_auth_tokens
        WHERE user_id = $userId AND agent_id = $agentId
      `).get({
        $userId: TEST_USER_ID,
        $agentId: 'qwen-code',
      }) as { access_token_encrypted: string } | null;

      expect(row).toBeDefined();
      expect(row!.access_token_encrypted).not.toBe('plaintext-token');
      // Token is encrypted (base64 format, different from plaintext)
      expect(row!.access_token_encrypted.length).toBeGreaterThan(20);
    });
  });

  // =========================================================================
  // Token Retrieval Tests
  // =========================================================================

  describe('getAgentAuthToken', () => {
    test('returns null for non-existent token', async () => {
      const result = await getAgentAuthToken(TEST_USER_ID, 'codex');
      expect(result).toBeNull();
    });

    test('retrieves and decrypts token', async () => {
      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'claude-code',
        accessToken: 'my-secret-token',
        refreshToken: 'my-refresh-token',
      });

      const result = await getAgentAuthToken(TEST_USER_ID, 'claude-code');

      expect(result).toBeDefined();
      expect(result!.accessToken).toBe('my-secret-token');
      expect(result!.refreshToken).toBe('my-refresh-token');
    });
  });

  // =========================================================================
  // Token Deletion Tests
  // =========================================================================

  describe('deleteAgentAuthToken', () => {
    test('deletes existing token', async () => {
      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'gemini-cli',
        accessToken: 'token-to-delete',
      });

      const deleted = deleteAgentAuthToken(TEST_USER_ID, 'gemini-cli');
      expect(deleted).toBe(true);

      const result = await getAgentAuthToken(TEST_USER_ID, 'gemini-cli');
      expect(result).toBeNull();
    });

    test('returns false for non-existent token', () => {
      const deleted = deleteAgentAuthToken(TEST_USER_ID, 'codex');
      expect(deleted).toBe(false);
    });
  });

  // =========================================================================
  // Authentication Status Tests
  // =========================================================================

  describe('isAgentAuthenticated', () => {
    test('returns false when no token exists', async () => {
      const isAuth = await isAgentAuthenticated(TEST_USER_ID, 'codex');
      expect(isAuth).toBe(false);
    });

    test('returns true when valid token exists', async () => {
      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'claude-code',
        accessToken: 'valid-token',
        expiresAt: '2099-12-31T23:59:59.000Z', // Far future
      });

      const isAuth = await isAgentAuthenticated(TEST_USER_ID, 'claude-code');
      expect(isAuth).toBe(true);
    });

    test('returns false when token is expired', async () => {
      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'gemini-cli',
        accessToken: 'expired-token',
        expiresAt: '2020-01-01T00:00:00.000Z', // Past date
      });

      const isAuth = await isAgentAuthenticated(TEST_USER_ID, 'gemini-cli');
      expect(isAuth).toBe(false);
    });

    test('returns true when token has no expiry', async () => {
      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'qwen-code',
        accessToken: 'perpetual-token',
      });

      const isAuth = await isAgentAuthenticated(TEST_USER_ID, 'qwen-code');
      expect(isAuth).toBe(true);
    });
  });

  // =========================================================================
  // List Tokens Tests
  // =========================================================================

  describe('listAgentAuthTokens', () => {
    test('returns empty array when no tokens', () => {
      const tokens = listAgentAuthTokens(TEST_USER_ID);
      expect(tokens).toEqual([]);
    });

    test('lists all tokens for user without exposing secrets', async () => {
      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'claude-code',
        accessToken: 'secret-1',
        refreshToken: 'refresh-1',
        expiresAt: '2025-12-31T23:59:59.000Z',
      });

      await saveAgentAuthToken({
        userId: TEST_USER_ID,
        agentId: 'gemini-cli',
        accessToken: 'secret-2',
      });

      const tokens = listAgentAuthTokens(TEST_USER_ID);

      expect(tokens.length).toBe(2);
      
      const claudeToken = tokens.find(t => t.agentId === 'claude-code');
      expect(claudeToken).toBeDefined();
      expect(claudeToken!.hasAccessToken).toBe(true);
      expect(claudeToken!.hasRefreshToken).toBe(true);
      expect(claudeToken!.expiresAt).toBe('2025-12-31T23:59:59.000Z');
      
      // Should NOT contain actual token values
      expect((claudeToken as any).accessToken).toBeUndefined();
      expect((claudeToken as any).refreshToken).toBeUndefined();
    });
  });

  // =========================================================================
  // Environment Variables Tests
  // =========================================================================

  describe('getEnvVarsForAgent', () => {
    test('returns ANTHROPIC_API_KEY for claude-code', () => {
      const env = getEnvVarsForAgent('claude-code', 'my-api-key');
      expect(env).toEqual({ ANTHROPIC_API_KEY: 'my-api-key' });
    });

    test('returns GOOGLE_API_KEY for gemini-cli', () => {
      const env = getEnvVarsForAgent('gemini-cli', 'my-api-key');
      expect(env).toEqual({ GOOGLE_API_KEY: 'my-api-key' });
    });

    test('returns ALIBABA_API_KEY for qwen-code', () => {
      const env = getEnvVarsForAgent('qwen-code', 'my-api-key');
      expect(env).toEqual({ ALIBABA_API_KEY: 'my-api-key' });
    });

    test('returns OPENAI_API_KEY for codex', () => {
      const env = getEnvVarsForAgent('codex', 'my-api-key');
      expect(env).toEqual({ OPENAI_API_KEY: 'my-api-key' });
    });

    test('returns empty object for opencode', () => {
      const env = getEnvVarsForAgent('opencode', 'any-key');
      expect(env).toEqual({});
    });
  });
});
