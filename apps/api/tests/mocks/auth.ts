/**
 * Auth Middleware Mock
 *
 * Provides mock authentication middleware for testing protected routes.
 * Allows tests to simulate different authentication scenarios.
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';

// =============================================================================
// Types
// =============================================================================

export interface MockUser {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  authType: 'better_auth' | 'api_key';
}

export interface MockSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

// =============================================================================
// Mock State
// =============================================================================

let mockUser: MockUser | null = null;
let mockSession: MockSession | null = null;
let mockAuthEnabled = true;

// Track auth calls for assertions
export const mockAuthCalls = {
  authMiddleware: [] as Array<{ path: string; headers: Record<string, string> }>,
  sessionMiddleware: [] as Array<{ path: string }>,
};

// =============================================================================
// Reset Function
// =============================================================================

/**
 * Reset all mock state - call this in beforeEach
 */
export function resetAuthMock(): void {
  mockUser = null;
  mockSession = null;
  mockAuthEnabled = true;

  // Reset call tracking
  Object.keys(mockAuthCalls).forEach((key) => {
    (mockAuthCalls as Record<string, unknown[]>)[key] = [];
  });
}

// =============================================================================
// Mock Configuration Functions
// =============================================================================

/**
 * Set the mock user for authentication
 */
export function setMockUser(user: MockUser | null): void {
  mockUser = user;
  if (user) {
    mockSession = {
      id: `session-${user.id}`,
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  } else {
    mockSession = null;
  }
}

/**
 * Set a default authenticated test user
 */
export function setDefaultTestUser(): MockUser {
  const user: MockUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    authType: 'better_auth',
  };
  setMockUser(user);
  return user;
}

/**
 * Set an API key authenticated user
 */
export function setApiKeyUser(userId = 'api-user-123'): MockUser {
  const user: MockUser = {
    id: userId,
    authType: 'api_key',
  };
  setMockUser(user);
  return user;
}

/**
 * Clear the mock user (simulate unauthenticated request)
 */
export function clearMockUser(): void {
  mockUser = null;
  mockSession = null;
}

/**
 * Enable or disable auth middleware
 */
export function setAuthEnabled(enabled: boolean): void {
  mockAuthEnabled = enabled;
}

/**
 * Get current mock user
 */
export function getMockUser(): MockUser | null {
  return mockUser;
}

/**
 * Get current mock session
 */
export function getMockSession(): MockSession | null {
  return mockSession;
}

// =============================================================================
// Mock Middleware
// =============================================================================

/**
 * Mock auth middleware - requires authentication
 * Simulates the real authMiddleware behavior
 */
export const mockAuthMiddleware = createMiddleware(async (c: Context, next: Next) => {
  mockAuthCalls.authMiddleware.push({
    path: c.req.path,
    headers: Object.fromEntries(c.req.raw.headers.entries()),
  });

  if (!mockAuthEnabled) {
    return next();
  }

  if (mockUser) {
    c.set('user', mockUser);
    c.set('session', mockSession);
    c.set('betterAuthUser', mockUser.authType === 'better_auth' ? mockUser : null);
    return next();
  }

  // No user - return 401
  return c.json(
    {
      error: 'Unauthorized',
      message: 'Valid session or API key required',
    },
    401
  );
});

/**
 * Mock session middleware - loads session if present but doesn't require it
 */
export const mockSessionMiddleware = createMiddleware(async (c: Context, next: Next) => {
  mockAuthCalls.sessionMiddleware.push({
    path: c.req.path,
  });

  if (mockUser) {
    c.set('user', mockUser);
    c.set('session', mockSession);
    c.set('betterAuthUser', mockUser.authType === 'better_auth' ? mockUser : null);
  } else {
    c.set('user', { id: 'anonymous', authType: 'api_key' });
    c.set('session', null);
    c.set('betterAuthUser', null);
  }

  return next();
});

/**
 * Mock optional auth middleware - sets user if present but doesn't require it
 */
export const mockOptionalAuthMiddleware = createMiddleware(async (c: Context, next: Next) => {
  if (mockUser) {
    c.set('user', mockUser);
    c.set('session', mockSession);
    c.set('betterAuthUser', mockUser.authType === 'better_auth' ? mockUser : null);
  } else {
    c.set('user', { id: 'anonymous', authType: 'api_key' });
    c.set('session', null);
    c.set('betterAuthUser', null);
  }

  return next();
});

// =============================================================================
// Helper Functions for Tests
// =============================================================================

/**
 * Create headers with mock authorization
 */
export function createAuthHeaders(token = 'test-token'): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Create headers with mock API key
 */
export function createApiKeyHeaders(apiKey = 'test-api-key'): Record<string, string> {
  return {
    'X-API-Key': apiKey,
  };
}

/**
 * Helper to test authenticated requests
 */
export function withAuth<T>(
  testFn: (user: MockUser) => Promise<T>,
  userOverrides?: Partial<MockUser>
): Promise<T> {
  const user = setDefaultTestUser();
  if (userOverrides) {
    Object.assign(user, userOverrides);
    setMockUser(user);
  }
  return testFn(user);
}

/**
 * Helper to test unauthenticated requests
 */
export function withoutAuth<T>(testFn: () => Promise<T>): Promise<T> {
  clearMockUser();
  return testFn();
}

// =============================================================================
// Test User Fixtures
// =============================================================================

export const testUsers = {
  default: {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    authType: 'better_auth' as const,
  },
  admin: {
    id: 'admin-user-456',
    email: 'admin@example.com',
    name: 'Admin User',
    authType: 'better_auth' as const,
  },
  apiUser: {
    id: 'api-user-789',
    authType: 'api_key' as const,
  },
};
