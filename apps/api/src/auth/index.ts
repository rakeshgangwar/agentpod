/**
 * Better Auth Configuration
 *
 * Replaces Keycloak with Better Auth - a simpler, embedded authentication solution.
 * Uses SQLite for development and PostgreSQL for production.
 *
 * Features:
 * - GitHub OAuth (primary authentication method)
 * - Session management with secure cookies
 * - API key fallback for backward compatibility
 */

import { betterAuth } from "better-auth";
import { Database } from "bun:sqlite";
import { config } from "../config";
import { createLogger } from "../utils/logger";

const log = createLogger("auth");

// =============================================================================
// Database Setup
// =============================================================================

/**
 * Get the database connection for Better Auth
 * Uses Bun's built-in SQLite for development
 */
function getDatabase() {
  // Ensure the data directory exists
  const dbPath = config.database.path;
  log.info("Initializing auth database", { path: dbPath });

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.exec("PRAGMA journal_mode = WAL;");

  return db;
}

// =============================================================================
// Better Auth Instance
// =============================================================================

/**
 * Better Auth instance configured for AgentPod
 *
 * Authentication methods:
 * - GitHub OAuth (recommended)
 * - Email/Password (optional, disabled by default)
 *
 * Session:
 * - Cookie-based sessions
 * - 7 day expiry
 * - Auto-refresh on activity
 */
export const auth = betterAuth({
  // Database
  database: getDatabase(),

  // Base URL for callbacks
  baseURL: config.publicUrl,

  // App name for emails/display
  appName: "AgentPod",

  // ==========================================================================
  // Session Configuration
  // ==========================================================================
  session: {
    // Session cookie name
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes cache
    },
    // Session expiry
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    // Update session on activity
    updateAge: 60 * 60 * 24, // Update every 24 hours
  },

  // ==========================================================================
  // Email/Password Authentication
  // ==========================================================================
  emailAndPassword: {
    enabled: true,
    // Allow sign up with email/password
    disableSignUp: false,
    // Require email verification (disabled for development simplicity)
    requireEmailVerification: false,
    // Automatically sign in after sign up
    autoSignIn: true,
    // Password requirements
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  // ==========================================================================
  // Social Providers
  // ==========================================================================
  socialProviders: {
    // GitHub OAuth - Primary authentication method
    github: {
      clientId: config.betterAuth.github.clientId,
      clientSecret: config.betterAuth.github.clientSecret,
      // Request additional scopes for GitHub integration
      scope: ["read:user", "user:email"],
    },
  },

  // ==========================================================================
  // Advanced Options
  // ==========================================================================
  advanced: {
    // Use secure cookies in production
    useSecureCookies: config.nodeEnv === "production",
    // Cookie prefix
    cookiePrefix: "agentpod",
    // Generate unique session IDs
    generateId: () => crypto.randomUUID(),
  },

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  // Log events for debugging
  logger: {
    disabled: config.nodeEnv === "production",
    level: "debug",
  },
});

// =============================================================================
// Type Exports
// =============================================================================

/**
 * Inferred types from Better Auth
 */
export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if Better Auth is properly configured
 */
export function isAuthConfigured(): boolean {
  return !!(
    config.betterAuth.github.clientId &&
    config.betterAuth.github.clientSecret
  );
}

/**
 * Get the auth handler for mounting to Hono
 */
export function getAuthHandler() {
  return auth.handler;
}

log.info("Better Auth initialized", {
  baseURL: config.publicUrl,
  githubConfigured: !!config.betterAuth.github.clientId,
  environment: config.nodeEnv,
});
