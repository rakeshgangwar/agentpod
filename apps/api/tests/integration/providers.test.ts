/**
 * Integration Tests for Provider Routes
 * 
 * Tests the /api/providers endpoints which manage:
 * - LLM provider configuration (Anthropic, OpenAI, etc.)
 * - API key management (encrypted storage)
 * - OAuth device flow (GitHub Copilot)
 * - Default provider selection
 * - Provider caching from Models.dev
 */

// IMPORTANT: Import setup first to set environment variables
import '../setup.ts';

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../../src/db/index.ts';
import * as ProviderCredentials from '../../src/models/provider-credentials.ts';
import * as ProviderModel from '../../src/models/provider.ts';
import { modelsDev } from '../../src/services/models-dev.ts';

// Import the full app after environment is set up
import { app } from '../../src/index.ts';

// =============================================================================
// Test App Setup
// =============================================================================

const AUTH_HEADER = { 'Authorization': 'Bearer test-token' };

// =============================================================================
// Mock Data
// =============================================================================

const mockProviders = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        context: 200000,
        maxOutput: 8192,
        pricing: { input: 3, output: 15 },
        image: true,
        video: false,
        tools: true,
        streaming: true,
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        context: 128000,
        maxOutput: 16384,
        pricing: { input: 2.5, output: 10 },
        image: true,
        video: false,
        tools: true,
        streaming: true,
      },
    ],
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    apiKeyEnvVar: undefined,
    models: [],
  },
  {
    id: 'groq',
    name: 'Groq',
    apiKeyEnvVar: 'GROQ_API_KEY',
    models: [],
  },
];

// =============================================================================
// Test Helpers
// =============================================================================

function cleanupTestCredentials() {
  // Clean up test credentials
  db.run('DELETE FROM provider_credentials');
  db.run('DELETE FROM oauth_state');
  db.run("DELETE FROM settings WHERE key = 'default_provider'");
}

// Store original methods for restoration
let originalFetchProviders: typeof modelsDev.fetchProviders;
let originalGetProvider: typeof modelsDev.getProvider;

// =============================================================================
// Tests
// =============================================================================

describe('Provider Routes Integration Tests', () => {
  beforeAll(() => {
    // Store original methods
    originalFetchProviders = modelsDev.fetchProviders.bind(modelsDev);
    originalGetProvider = modelsDev.getProvider.bind(modelsDev);
    
    // Mock Models.dev API calls
    modelsDev.fetchProviders = async () => mockProviders;
    modelsDev.getProvider = async (id: string) => mockProviders.find(p => p.id === id) || null;
    
    // Clear any existing cache
    modelsDev.clearCache();
  });

  afterAll(() => {
    // Restore original methods
    modelsDev.fetchProviders = originalFetchProviders;
    modelsDev.getProvider = originalGetProvider;
    
    // Cleanup
    cleanupTestCredentials();
  });

  beforeEach(() => {
    // Clean up before each test
    cleanupTestCredentials();
    modelsDev.clearCache();
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe('Authentication', () => {
    test('should return 401 without auth header', async () => {
      const res = await app.request('/api/providers');
      expect(res.status).toBe(401);
    });

    test('should return 401 with invalid token', async () => {
      const res = await app.request('/api/providers', {
        headers: { 'Authorization': 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    test('should succeed with valid auth token', async () => {
      const res = await app.request('/api/providers', {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // GET /api/providers - List Providers
  // ===========================================================================

  describe('GET /api/providers', () => {
    test('should list popular providers by default', async () => {
      const res = await app.request('/api/providers', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data).toHaveProperty('providers');
      expect(Array.isArray(data.providers)).toBe(true);
      expect(data.providers.length).toBeGreaterThan(0);
      expect(data).toHaveProperty('popularCount');
    });

    test('should return providers with expected structure', async () => {
      const res = await app.request('/api/providers', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      const provider = data.providers[0];
      
      expect(provider).toHaveProperty('id');
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('authType');
      expect(provider).toHaveProperty('isConfigured');
      expect(provider).toHaveProperty('isDefault');
      expect(provider).toHaveProperty('logoUrl');
      expect(provider).toHaveProperty('models');
    });

    test('should return all providers when popularOnly=false', async () => {
      const res = await app.request('/api/providers?popularOnly=false', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data).toHaveProperty('providers');
      expect(data).toHaveProperty('totalCount');
    });

    test('should mark configured providers correctly', async () => {
      // Configure a provider first
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-api-key-123',
      });
      
      const res = await app.request('/api/providers', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      const anthropic = data.providers.find((p: { id: string }) => p.id === 'anthropic');
      
      expect(anthropic).toBeDefined();
      expect(anthropic.isConfigured).toBe(true);
    });

    test('should mark default provider correctly', async () => {
      // Configure and set default provider
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-api-key-123',
      });
      ProviderModel.setSetting('default_provider', 'anthropic');
      
      const res = await app.request('/api/providers', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      const anthropic = data.providers.find((p: { id: string }) => p.id === 'anthropic');
      
      expect(anthropic).toBeDefined();
      expect(anthropic.isDefault).toBe(true);
    });

    test('should return auth type for each provider', async () => {
      const res = await app.request('/api/providers', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      
      // Check API key providers
      const anthropic = data.providers.find((p: { id: string }) => p.id === 'anthropic');
      expect(anthropic?.authType).toBe('api_key');
      
      // Check device flow providers
      const copilot = data.providers.find((p: { id: string }) => p.id === 'github-copilot');
      if (copilot) {
        expect(copilot.authType).toBe('device_flow');
      }
    });
  });

  // ===========================================================================
  // GET /api/providers/configured - List Configured Providers
  // ===========================================================================

  describe('GET /api/providers/configured', () => {
    test('should return empty list when no providers configured', async () => {
      const res = await app.request('/api/providers/configured', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.providers).toEqual([]);
    });

    test('should return only configured providers', async () => {
      // Configure some providers
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-anthropic-key',
      });
      await ProviderCredentials.saveApiKey({
        providerId: 'openai',
        apiKey: 'test-openai-key',
      });
      
      const res = await app.request('/api/providers/configured', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.providers.length).toBe(2);
      expect(data.providers.every((p: { isConfigured: boolean }) => p.isConfigured)).toBe(true);
    });

    test('should include provider models in response', async () => {
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-api-key',
      });
      
      const res = await app.request('/api/providers/configured', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      const anthropic = data.providers.find((p: { id: string }) => p.id === 'anthropic');
      
      expect(anthropic).toBeDefined();
      expect(anthropic.models).toBeDefined();
      expect(Array.isArray(anthropic.models)).toBe(true);
    });
  });

  // ===========================================================================
  // GET /api/providers/default - Get Default Provider
  // ===========================================================================

  describe('GET /api/providers/default', () => {
    test('should return null when no default set', async () => {
      const res = await app.request('/api/providers/default', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.provider).toBeNull();
      expect(data.message).toBe('No default provider set');
    });

    test('should return null if default provider not configured', async () => {
      // Set default without configuring
      ProviderModel.setSetting('default_provider', 'anthropic');
      
      const res = await app.request('/api/providers/default', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      
      expect(data.provider).toBeNull();
      expect(data.message).toBe('Default provider is not configured');
    });

    test('should return default provider when configured', async () => {
      // Configure and set default
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-api-key',
      });
      ProviderModel.setSetting('default_provider', 'anthropic');
      
      const res = await app.request('/api/providers/default', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.provider).toBeDefined();
      expect(data.provider.id).toBe('anthropic');
      expect(data.provider.isConfigured).toBe(true);
      expect(data.provider.isDefault).toBe(true);
    });
  });

  // ===========================================================================
  // GET /api/providers/:id - Get Specific Provider
  // ===========================================================================

  describe('GET /api/providers/:id', () => {
    test('should return 404 for non-existent provider', async () => {
      const res = await app.request('/api/providers/non-existent-provider', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('not found');
    });

    test('should return provider details', async () => {
      const res = await app.request('/api/providers/anthropic', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.provider).toBeDefined();
      expect(data.provider.id).toBe('anthropic');
      expect(data.provider.name).toBe('Anthropic');
      expect(data.provider.authType).toBe('api_key');
    });

    test('should include models with capabilities', async () => {
      const res = await app.request('/api/providers/anthropic', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      
      expect(data.provider.models).toBeDefined();
      expect(Array.isArray(data.provider.models)).toBe(true);
      
      if (data.provider.models.length > 0) {
        const model = data.provider.models[0];
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('context');
        expect(model).toHaveProperty('maxOutput');
        expect(model).toHaveProperty('pricing');
        expect(model).toHaveProperty('capabilities');
        expect(model.capabilities).toHaveProperty('image');
        expect(model.capabilities).toHaveProperty('tools');
        expect(model.capabilities).toHaveProperty('streaming');
      }
    });

    test('should show configured status correctly', async () => {
      // First request - not configured
      let res = await app.request('/api/providers/anthropic', {
        headers: AUTH_HEADER,
      });
      let data = await res.json();
      expect(data.provider.isConfigured).toBe(false);
      
      // Configure provider
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-key',
      });
      
      // Second request - should be configured
      res = await app.request('/api/providers/anthropic', {
        headers: AUTH_HEADER,
      });
      data = await res.json();
      expect(data.provider.isConfigured).toBe(true);
    });
  });

  // ===========================================================================
  // POST /api/providers/:id/configure - Configure Provider
  // ===========================================================================

  describe('POST /api/providers/:id/configure', () => {
    test('should return 400 without API key', async () => {
      const res = await app.request('/api/providers/anthropic/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      expect(res.status).toBe(400);
    });

    test('should return 400 with empty API key', async () => {
      const res = await app.request('/api/providers/anthropic/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: '' }),
      });
      
      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent provider', async () => {
      const res = await app.request('/api/providers/non-existent/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: 'test-key' }),
      });
      
      expect(res.status).toBe(404);
    });

    test('should return 400 for OAuth providers', async () => {
      const res = await app.request('/api/providers/github-copilot/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: 'test-key' }),
      });
      
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('device_flow');
    });

    test('should configure provider with valid API key', async () => {
      const res = await app.request('/api/providers/anthropic/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: 'sk-ant-test-key-12345' }),
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.success).toBe(true);
      expect(data.provider.id).toBe('anthropic');
      expect(data.provider.isConfigured).toBe(true);
    });

    test('should encrypt API key in database', async () => {
      await app.request('/api/providers/anthropic/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: 'sk-ant-test-secret-key' }),
      });
      
      // Check database - key should be encrypted (not plaintext)
      const row = db.query(`
        SELECT api_key_encrypted FROM provider_credentials WHERE provider_id = 'anthropic'
      `).get() as { api_key_encrypted: string } | null;
      
      expect(row).toBeDefined();
      expect(row!.api_key_encrypted).toBeDefined();
      expect(row!.api_key_encrypted).not.toBe('sk-ant-test-secret-key');
      expect(row!.api_key_encrypted.length).toBeGreaterThan(0);
    });

    test('should update existing configuration', async () => {
      // First configuration
      await app.request('/api/providers/anthropic/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: 'first-key' }),
      });
      
      // Update with new key
      const res = await app.request('/api/providers/anthropic/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: 'second-key' }),
      });
      
      expect(res.status).toBe(200);
      
      // Verify only one credential exists
      const count = db.query(`
        SELECT COUNT(*) as count FROM provider_credentials WHERE provider_id = 'anthropic'
      `).get() as { count: number };
      
      expect(count.count).toBe(1);
      
      // Verify new key is stored (by decrypting)
      const credential = await ProviderCredentials.getCredential('anthropic');
      expect(credential?.apiKey).toBe('second-key');
    });
  });

  // ===========================================================================
  // POST /api/providers/:id/set-default - Set Default Provider
  // ===========================================================================

  describe('POST /api/providers/:id/set-default', () => {
    test('should return 400 if provider not configured', async () => {
      const res = await app.request('/api/providers/anthropic/set-default', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('must be configured');
    });

    test('should set default provider successfully', async () => {
      // Configure provider first
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-key',
      });
      
      const res = await app.request('/api/providers/anthropic/set-default', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('anthropic');
    });

    test('should update default setting in database', async () => {
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-key',
      });
      
      await app.request('/api/providers/anthropic/set-default', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      const defaultProvider = ProviderModel.getSetting('default_provider');
      expect(defaultProvider).toBe('anthropic');
    });

    test('should change default when setting new default', async () => {
      // Configure two providers
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-key-1',
      });
      await ProviderCredentials.saveApiKey({
        providerId: 'openai',
        apiKey: 'test-key-2',
      });
      
      // Set first as default
      await app.request('/api/providers/anthropic/set-default', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      // Set second as default
      await app.request('/api/providers/openai/set-default', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      const defaultProvider = ProviderModel.getSetting('default_provider');
      expect(defaultProvider).toBe('openai');
    });
  });

  // ===========================================================================
  // DELETE /api/providers/:id - Remove Provider Credentials
  // ===========================================================================

  describe('DELETE /api/providers/:id', () => {
    test('should return 404 for non-configured provider', async () => {
      const res = await app.request('/api/providers/anthropic', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('not configured');
    });

    test('should delete provider credentials successfully', async () => {
      // Configure provider first
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-key',
      });
      
      const res = await app.request('/api/providers/anthropic', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.success).toBe(true);
    });

    test('should remove credential from database', async () => {
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-key',
      });
      
      await app.request('/api/providers/anthropic', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      const exists = ProviderCredentials.isProviderConfigured('anthropic');
      expect(exists).toBe(false);
    });

    test('should clear default if deleting default provider', async () => {
      // Configure and set as default
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-key',
      });
      ProviderModel.setSetting('default_provider', 'anthropic');
      
      // Delete the provider
      await app.request('/api/providers/anthropic', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      // Default should be cleared (null or empty string both mean no default)
      const defaultProvider = ProviderModel.getSetting('default_provider');
      expect(defaultProvider === null || defaultProvider === '').toBe(true);
    });

    test('should not clear default if deleting non-default provider', async () => {
      // Configure two providers
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'test-key-1',
      });
      await ProviderCredentials.saveApiKey({
        providerId: 'openai',
        apiKey: 'test-key-2',
      });
      
      // Set anthropic as default
      ProviderModel.setSetting('default_provider', 'anthropic');
      
      // Delete openai (not the default)
      await app.request('/api/providers/openai', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      // Default should remain unchanged
      const defaultProvider = ProviderModel.getSetting('default_provider');
      expect(defaultProvider).toBe('anthropic');
    });
  });

  // ===========================================================================
  // OAuth Endpoints - Init
  // ===========================================================================

  describe('POST /api/providers/:id/oauth/init', () => {
    test('should return 400 for non-OAuth provider', async () => {
      const res = await app.request('/api/providers/anthropic/oauth/init', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('OAuth not supported');
    });

    // Note: Testing actual GitHub OAuth init would require mocking the GitHub API
    // We test the validation and error handling instead
    test('should only support github-copilot for OAuth', async () => {
      const res = await app.request('/api/providers/openai/oauth/init', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('OAuth not supported');
    });
  });

  // ===========================================================================
  // OAuth Endpoints - Poll
  // ===========================================================================

  describe('POST /api/providers/:id/oauth/poll', () => {
    test('should return 400 for non-OAuth provider', async () => {
      const res = await app.request('/api/providers/anthropic/oauth/poll', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stateId: 'test-state-id' }),
      });
      
      expect(res.status).toBe(400);
    });

    test('should return 400 without stateId', async () => {
      const res = await app.request('/api/providers/github-copilot/oauth/poll', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // OAuth Endpoints - Status
  // ===========================================================================

  describe('GET /api/providers/:id/oauth/status/:stateId', () => {
    test('should return 400 for non-OAuth provider', async () => {
      const res = await app.request('/api/providers/anthropic/oauth/status/test-state', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent state', async () => {
      const res = await app.request('/api/providers/github-copilot/oauth/status/non-existent-state', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('not found');
    });

    test('should return status for existing OAuth flow', async () => {
      // Create a test OAuth state in the database
      const stateId = 'test-oauth-state-id';
      const expiresAt = new Date(Date.now() + 900000).toISOString(); // 15 min from now
      
      db.run(`
        INSERT INTO oauth_state (id, provider_id, device_code, user_code, verification_uri, interval_seconds, expires_at, status)
        VALUES (?, 'github-copilot', 'test-device-code', 'TEST-1234', 'https://github.com/login/device', 5, ?, 'pending')
      `, [stateId, expiresAt]);
      
      const res = await app.request(`/api/providers/github-copilot/oauth/status/${stateId}`, {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.status).toBe('pending');
    });
  });

  // ===========================================================================
  // OAuth Endpoints - Cancel
  // ===========================================================================

  describe('DELETE /api/providers/:id/oauth/:stateId', () => {
    test('should return 400 for non-OAuth provider', async () => {
      const res = await app.request('/api/providers/anthropic/oauth/test-state', {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(400);
    });

    test('should cancel OAuth flow successfully', async () => {
      // Create a test OAuth state
      const stateId = 'test-cancel-state';
      db.run(`
        INSERT INTO oauth_state (id, provider_id, device_code, user_code, verification_uri, interval_seconds, expires_at, status)
        VALUES (?, 'github-copilot', 'test-device-code', 'TEST-1234', 'https://github.com/login/device', 5, datetime('now', '+15 minutes'), 'pending')
      `, [stateId]);
      
      const res = await app.request(`/api/providers/github-copilot/oauth/${stateId}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('cancelled');
    });

    test('should remove OAuth state from database', async () => {
      const stateId = 'test-remove-state';
      db.run(`
        INSERT INTO oauth_state (id, provider_id, device_code, user_code, verification_uri, interval_seconds, expires_at, status)
        VALUES (?, 'github-copilot', 'test-device-code', 'TEST-1234', 'https://github.com/login/device', 5, datetime('now', '+15 minutes'), 'pending')
      `, [stateId]);
      
      await app.request(`/api/providers/github-copilot/oauth/${stateId}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      
      // Verify state is deleted
      const row = db.query('SELECT * FROM oauth_state WHERE id = ?').get(stateId);
      expect(row).toBeNull();
    });
  });

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  describe('POST /api/providers/refresh-cache', () => {
    test('should refresh provider cache successfully', async () => {
      const res = await app.request('/api/providers/refresh-cache', {
        method: 'POST',
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('refreshed');
      expect(data.providerCount).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Edge Cases and Error Handling
  // ===========================================================================

  describe('Edge Cases', () => {
    test('should handle provider IDs with special characters', async () => {
      // Provider ID with dashes
      const res = await app.request('/api/providers/github-copilot', {
        headers: AUTH_HEADER,
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.provider.id).toBe('github-copilot');
    });

    test('should handle multiple providers configuration', async () => {
      // Configure multiple providers
      await ProviderCredentials.saveApiKey({
        providerId: 'anthropic',
        apiKey: 'key-1',
      });
      await ProviderCredentials.saveApiKey({
        providerId: 'openai',
        apiKey: 'key-2',
      });
      await ProviderCredentials.saveApiKey({
        providerId: 'groq',
        apiKey: 'key-3',
      });
      
      const res = await app.request('/api/providers/configured', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      expect(data.providers.length).toBe(3);
    });

    test('should preserve model data across provider operations', async () => {
      // Configure provider
      await app.request('/api/providers/anthropic/configure', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: 'test-key' }),
      });
      
      // Get provider details
      const res = await app.request('/api/providers/anthropic', {
        headers: AUTH_HEADER,
      });
      
      const data = await res.json();
      expect(data.provider.models).toBeDefined();
      expect(data.provider.models.length).toBeGreaterThan(0);
    });

    test('should handle concurrent provider operations', async () => {
      // Simulate concurrent configurations
      const promises = [
        app.request('/api/providers/anthropic/configure', {
          method: 'POST',
          headers: {
            ...AUTH_HEADER,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apiKey: 'key-anthropic' }),
        }),
        app.request('/api/providers/openai/configure', {
          method: 'POST',
          headers: {
            ...AUTH_HEADER,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apiKey: 'key-openai' }),
        }),
      ];
      
      const results = await Promise.all(promises);
      
      expect(results[0].status).toBe(200);
      expect(results[1].status).toBe(200);
      
      // Verify both are configured
      const configured = await app.request('/api/providers/configured', {
        headers: AUTH_HEADER,
      });
      const data = await configured.json();
      expect(data.providers.length).toBe(2);
    });
  });
});
