/**
 * Test Setup
 * Common utilities and setup for all tests
 * 
 * IMPORTANT: This file must be imported before any src/ modules
 * to ensure environment variables are set correctly.
 */

import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Test database path
export const TEST_DB_PATH = './data/test-database.sqlite';

/**
 * Set up test environment variables
 * Must be called before importing any src/ modules
 */
export function setupTestEnv(overrides: Record<string, string> = {}): void {
  const defaults = {
    PORT: '3001',
    NODE_ENV: 'test',
    API_TOKEN: 'test-token',
    COOLIFY_URL: 'http://localhost:8000',
    COOLIFY_TOKEN: 'test-coolify-token',
    COOLIFY_PROJECT_UUID: 'test-project-uuid',
    COOLIFY_SERVER_UUID: 'test-server-uuid',
    FORGEJO_URL: 'http://localhost:3000',
    FORGEJO_TOKEN: 'test-forgejo-token',
    FORGEJO_OWNER: 'testuser',
    OPENCODE_IMAGE: 'opencode-server:latest',
    OPENCODE_BASE_PORT: '4001',
    DATABASE_PATH: TEST_DB_PATH,
  };
  
  Object.entries({ ...defaults, ...overrides }).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

/**
 * Ensure test database directory exists
 */
export function ensureTestDbDir(): void {
  const dir = dirname(TEST_DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Clean up test database file
 */
export function cleanupTestDatabase(): void {
  if (existsSync(TEST_DB_PATH)) {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
}

/**
 * Create a mock fetch function for testing external APIs
 */
export function createMockFetch(responses: Map<string, { status: number; body: unknown }>) {
  return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    
    for (const [pattern, response] of responses) {
      if (urlStr.includes(pattern)) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Default 404 for unmatched requests
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

// Set up environment immediately when this file is imported
setupTestEnv();
ensureTestDbDir();

// Initialize database schema for unit tests
// This is done lazily to avoid circular imports
let dbInitialized = false;
export function ensureDbInitialized(): void {
  if (dbInitialized) return;
  
  // Import dynamically to avoid circular imports
  const { initDatabase } = require('../src/db/index');
  const { runMigrations, migrations } = require('../src/db/migrations');
  
  try {
    initDatabase();
    runMigrations(migrations);
    dbInitialized = true;
  } catch (e) {
    // Ignore if already initialized
    if (!(e instanceof Error) || !e.message.includes('already exists')) {
      console.warn('Database init warning:', e);
    }
    dbInitialized = true;
  }
}

// Initialize database with migrations for tests
ensureDbInitialized();
