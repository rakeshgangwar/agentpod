/**
 * Integration Tests for API Routes
 * Tests the full HTTP request/response cycle
 */

// IMPORTANT: Import setup first to set environment variables
import '../setup';

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { cleanupTestDatabase } from '../setup';
import { db, initDatabase } from '../../src/db/index';

// Import app after environment is set up
import app from '../../src/index';

// Helper to make requests to the app
async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
  } = {}
) {
  const { method = 'GET', body, auth = true } = options;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (auth) {
    headers['Authorization'] = 'Bearer test-token';
  }
  
  const response = await app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  );
  
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  
  return { status: response.status, data };
}

describe('Health Routes', () => {
  test('GET /health should return ok', async () => {
    const { status, data } = await request('/health', { auth: false });
    
    expect(status).toBe(200);
    expect((data as any).status).toBe('ok');
    expect((data as any).timestamp).toBeDefined();
  });

  test('GET /api/info should return api info with auth', async () => {
    const { status, data } = await request('/api/info');
    
    expect(status).toBe(200);
    expect((data as any).name).toBe('Management API');
    expect((data as any).version).toBe('0.1.0');
  });

  // Note: /api/info is currently in healthRoutes (public), 
  // but auth is applied to /api/* so it requires auth
});

describe('Provider Routes', () => {
  beforeEach(() => {
    // Reset providers to initial state
    db.exec("UPDATE providers SET api_key = NULL, is_configured = 0, is_default = 0");
  });

  test('GET /api/providers should return providers list', async () => {
    const { status, data } = await request('/api/providers');
    
    expect(status).toBe(200);
    expect((data as any).providers).toBeDefined();
    expect(Array.isArray((data as any).providers)).toBe(true);
    expect((data as any).providers.length).toBeGreaterThan(0);
    
    // Check that providers have expected structure
    const provider = (data as any).providers[0];
    expect(provider.id).toBeDefined();
    expect(provider.name).toBeDefined();
    expect(provider.type).toBeDefined();
    expect(provider.isConfigured).toBeDefined();
  });

  test('GET /api/providers/default should return null when no default', async () => {
    const { status, data } = await request('/api/providers/default');
    
    expect(status).toBe(200);
    expect((data as any).provider).toBeNull();
  });

  test('GET /api/providers/:id should return provider', async () => {
    const { status, data } = await request('/api/providers/anthropic');
    
    expect(status).toBe(200);
    expect((data as any).provider.id).toBe('anthropic');
    expect((data as any).provider.name).toBe('Anthropic Claude');
  });

  test('GET /api/providers/:id with invalid id should return 404', async () => {
    const { status, data } = await request('/api/providers/invalid-provider');
    
    expect(status).toBe(404);
    expect((data as any).error).toBeDefined();
  });

  test('POST /api/providers/:id/configure should configure provider', async () => {
    const { status, data } = await request('/api/providers/openai/configure', {
      method: 'POST',
      body: { apiKey: 'sk-test-key-12345' },
    });
    
    expect(status).toBe(200);
    expect((data as any).provider.id).toBe('openai');
    expect((data as any).provider.isConfigured).toBe(true);
    expect((data as any).message).toBe('Provider configured successfully');
  });

  test('POST /api/providers/:id/set-default should set default provider', async () => {
    // First configure the provider
    await request('/api/providers/anthropic/configure', {
      method: 'POST',
      body: { apiKey: 'sk-ant-test-key' },
    });

    // Then set as default
    const { status, data } = await request('/api/providers/anthropic/set-default', {
      method: 'POST',
    });
    
    expect(status).toBe(200);
    expect((data as any).provider.isDefault).toBe(true);
  });

  test('POST /api/providers/:id/set-default on unconfigured provider should fail', async () => {
    const { status, data } = await request('/api/providers/google/set-default', {
      method: 'POST',
    });
    
    expect(status).toBe(400);
    expect((data as any).error).toContain('unconfigured');
  });

  test('DELETE /api/providers/:id should remove configuration', async () => {
    // First configure
    await request('/api/providers/openrouter/configure', {
      method: 'POST',
      body: { apiKey: 'test-key' },
    });

    // Then delete
    const { status, data } = await request('/api/providers/openrouter', {
      method: 'DELETE',
    });
    
    expect(status).toBe(200);
    expect((data as any).provider.isConfigured).toBe(false);
  });
});

describe('Project Routes', () => {
  beforeEach(() => {
    // Clean projects table
    db.exec('DELETE FROM projects');
  });

  test('GET /api/projects should return empty list initially', async () => {
    const { status, data } = await request('/api/projects');
    
    expect(status).toBe(200);
    expect((data as any).projects).toEqual([]);
  });

  test('GET /api/projects/:id with non-existent id should return 404', async () => {
    const { status, data } = await request('/api/projects/non-existent');
    
    expect(status).toBe(404);
    expect((data as any).error).toBeDefined();
  });

  // Note: POST /api/projects requires actual Coolify/Forgejo connection
  // We'll test that with mocks in the unit tests or manual testing

  test('POST /api/projects with invalid body should return validation error', async () => {
    const { status } = await request('/api/projects', {
      method: 'POST',
      body: { description: 'Missing name' }, // name is required
    });
    
    expect(status).toBe(400);
  });
});

describe('Authentication', () => {
  test('protected routes should require auth token', async () => {
    const { status } = await request('/api/projects', { auth: false });
    expect(status).toBe(401);
  });

  test('protected routes should reject invalid token', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/projects', {
        headers: {
          'Authorization': 'Bearer wrong-token',
        },
      })
    );
    
    expect(response.status).toBe(401);
  });

  test('public routes should work without auth', async () => {
    const { status } = await request('/health', { auth: false });
    expect(status).toBe(200);
  });
});
