/**
 * Authentication Middleware
 * 
 * Validates JWT tokens from Keycloak or falls back to API key authentication.
 * Supports both:
 * - Keycloak OAuth tokens (for mobile/desktop app)
 * - Static API keys (for legacy/development)
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import { config } from '../config.ts';
import { keycloak } from '../services/keycloak.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('auth');

// =============================================================================
// Types
// =============================================================================

export interface AuthUser {
  id: string;
  email?: string;
  username?: string;
  authType: 'keycloak' | 'api_key';
}

// Extend Hono context with user info
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Authentication middleware that supports both Keycloak tokens and API keys
 */
export const authMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    log.warn('No Authorization header');
    return c.json({ error: 'Unauthorized', message: 'Missing Authorization header' }, 401);
  }

  // Check if it's a Bearer token
  if (!authHeader.startsWith('Bearer ')) {
    log.warn('Invalid Authorization header format');
    return c.json({ error: 'Unauthorized', message: 'Invalid Authorization header format' }, 401);
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  if (!token) {
    log.warn('Empty token');
    return c.json({ error: 'Unauthorized', message: 'Empty token' }, 401);
  }

  // Try API key authentication first (simple string comparison)
  if (token === config.auth.token) {
    log.debug('Authenticated via API key');
    c.set('user', {
      id: config.defaultUserId,
      authType: 'api_key' as const,
    });
    return next();
  }

  // Try Keycloak token validation
  if (keycloak.isConfigured()) {
    log.info('Attempting Keycloak token validation', { tokenLength: token.length, tokenPrefix: token.substring(0, 20) + '...' });
    try {
      const validation = await keycloak.validateToken(token);
      log.info('Keycloak validation result', { active: validation.active, email: validation.email, username: validation.username });
      
      if (validation.active) {
        log.info('Authenticated via Keycloak', { email: validation.email, username: validation.username });
        c.set('user', {
          id: validation.username || validation.email || 'unknown',
          email: validation.email,
          username: validation.username,
          authType: 'keycloak' as const,
        });
        return next();
      } else {
        log.warn('Keycloak token validation failed - token not active');
      }
    } catch (error) {
      log.error('Keycloak token validation error', { error });
    }
  } else {
    log.warn('Keycloak not configured, skipping token validation');
  }

  // Authentication failed
  log.warn('Authentication failed - invalid token');
  return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
});

/**
 * Optional auth middleware - sets user if authenticated but doesn't require it
 */
export const optionalAuthMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No auth, continue without user
    return next();
  }

  const token = authHeader.slice(7);

  if (!token) {
    return next();
  }

  // Try API key
  if (token === config.auth.token) {
    c.set('user', {
      id: config.defaultUserId,
      authType: 'api_key' as const,
    });
    return next();
  }

  // Try Keycloak
  if (keycloak.isConfigured()) {
    try {
      const validation = await keycloak.validateToken(token);
      
      if (validation.active) {
        c.set('user', {
          id: validation.username || validation.email || 'unknown',
          email: validation.email,
          username: validation.username,
          authType: 'keycloak' as const,
        });
      }
    } catch (error) {
      log.debug('Optional auth - token validation failed', { error });
    }
  }

  return next();
});

/**
 * Helper to get current user from context
 */
export function getCurrentUser(c: Context): AuthUser | undefined {
  return c.get('user');
}

/**
 * Helper to require authenticated user (throws if not authenticated)
 */
export function requireUser(c: Context): AuthUser {
  const user = c.get('user');
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user;
}
