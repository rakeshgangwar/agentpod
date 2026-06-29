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

// Test user ID (matches what Better Auth creates)
const TEST_USER_ID = 'test-user-api-123';

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
    // Use the API token from test environment
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

// =============================================================================
// Setup
// =============================================================================

beforeAll(() => {
  // Ensure test user exists
  try {
    db.run(
      "INSERT OR IGNORE INTO user (id, email, name, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))",
      [TEST_USER_ID, 'test@api.test', 'API Test User']
    );
  } catch (e) {
    // Ignore if user already exists
  }
});

// =============================================================================
// Health Routes
// =============================================================================

describe('Health Routes', () => {
  test('GET /health should return ok', async () => {
    const { status, data } = await request('/health', { auth: false });
    
    expect(status).toBe(200);
    expect((data as any).status).toBe('ok');
    expect((data as any).timestamp).toBeDefined();
  });
});

// =============================================================================
// Resource Tiers Routes
// =============================================================================

describe('Resource Tiers Routes', () => {
  test('GET /api/resource-tiers should return list of tiers', async () => {
    const { status, data } = await request('/api/resource-tiers');
    
    expect(status).toBe(200);
    expect((data as any).tiers).toBeDefined();
    expect(Array.isArray((data as any).tiers)).toBe(true);
    
    // Should have at least the seeded tiers
    const tiers = (data as any).tiers;
    expect(tiers.length).toBeGreaterThan(0);
    
    // Check tier structure
    const tier = tiers[0];
    expect(tier.id).toBeDefined();
    expect(tier.name).toBeDefined();
    expect(tier.resources).toBeDefined();
    expect(tier.resources.cpuCores).toBeDefined();
    expect(tier.resources.memoryGb).toBeDefined();
  });

  test('GET /api/resource-tiers/default should return default tier', async () => {
    const { status, data } = await request('/api/resource-tiers/default');
    
    expect(status).toBe(200);
    expect((data as any).id).toBeDefined();
    expect((data as any).isDefault).toBe(true);
  });

  test('GET /api/resource-tiers/:id should return specific tier', async () => {
    const { status, data } = await request('/api/resource-tiers/starter');
    
    expect(status).toBe(200);
    expect((data as any).id).toBe('starter');
  });

  test('GET /api/resource-tiers/:id with invalid id should return 404', async () => {
    const { status } = await request('/api/resource-tiers/invalid-tier');
    
    expect(status).toBe(404);
  });
});

// =============================================================================
// Container Flavors Routes
// =============================================================================

describe('Container Flavors Routes', () => {
  test('GET /api/flavors should return list of flavors', async () => {
    const { status, data } = await request('/api/flavors');
    
    expect(status).toBe(200);
    expect((data as any).flavors).toBeDefined();
    expect(Array.isArray((data as any).flavors)).toBe(true);
    
    // Should have at least the seeded flavors
    const flavors = (data as any).flavors;
    expect(flavors.length).toBeGreaterThan(0);
    
    // Check flavor structure
    const flavor = flavors[0];
    expect(flavor.id).toBeDefined();
    expect(flavor.name).toBeDefined();
    expect(flavor.languages).toBeDefined();
  });

  test('GET /api/flavors/default should return default flavor', async () => {
    const { status, data } = await request('/api/flavors/default');
    
    expect(status).toBe(200);
    // API returns flat object, not wrapped in { flavor: ... }
    expect((data as any).id).toBeDefined();
    expect((data as any).isDefault).toBe(true);
  });

  test('GET /api/flavors/:id should return specific flavor', async () => {
    const { status, data } = await request('/api/flavors/fullstack');
    
    expect(status).toBe(200);
    // API returns flat object, not wrapped in { flavor: ... }
    expect((data as any).id).toBe('fullstack');
  });
});

// =============================================================================
// Container Addons Routes
// =============================================================================

// TODO: Skipped - requires addons to be seeded in database (not implemented yet)
describe.skip('Container Addons Routes', () => {
  test('GET /api/addons should return list of addons', async () => {
    const { status, data } = await request('/api/addons');
    
    expect(status).toBe(200);
    expect((data as any).addons).toBeDefined();
    expect(Array.isArray((data as any).addons)).toBe(true);
    
    // Should have at least the seeded addons
    const addons = (data as any).addons;
    expect(addons.length).toBeGreaterThan(0);
    
    // Check addon structure
    const addon = addons[0];
    expect(addon.id).toBeDefined();
    expect(addon.name).toBeDefined();
    expect(addon.category).toBeDefined();
  });

  test('GET /api/addons/:id should return specific addon', async () => {
    const { status, data } = await request('/api/addons/code-server');
    
    expect(status).toBe(200);
    // API returns flat object, not wrapped in { addon: ... }
    expect((data as any).id).toBe('code-server');
  });
});

// =============================================================================
// Authentication
// =============================================================================

describe('Authentication', () => {
  test('protected routes should require auth token', async () => {
    const { status } = await request('/api/resource-tiers', { auth: false });
    expect(status).toBe(401);
  });

  test('protected routes should reject invalid token', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/resource-tiers', {
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
