/**
 * Better Auth Configuration with Drizzle PostgreSQL Adapter
 *
 * Replaces SQLite with PostgreSQL via Drizzle ORM.
 * Used when DATABASE_URL is set (PostgreSQL mode).
 */

import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/drizzle";
import { config } from "../config";
import { createLogger } from "../utils/logger";

const log = createLogger("auth");

// =============================================================================
// Better Auth Instance with Drizzle PostgreSQL
// =============================================================================

/**
 * Better Auth instance configured for AgentPod with PostgreSQL
 *
 * Authentication methods:
 * - GitHub OAuth (recommended)
 * - Email/Password (optional)
 *
 * Session:
 * - Cookie-based sessions
 * - 7 day expiry
 * - Auto-refresh on activity
 */
export const auth = betterAuth({
  // Database - Drizzle with PostgreSQL
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

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
  // Trusted Origins (for CORS)
  // ==========================================================================
  trustedOrigins: [
    "http://localhost:1420", // Tauri dev
    "http://localhost:5173", // Vite dev
    "tauri://localhost", // Tauri production
    config.publicUrl, // API URL itself
  ],

  // ==========================================================================
  // Plugins
  // ==========================================================================
  plugins: [
    // Bearer token plugin - allows using session tokens as Bearer tokens
    // This is needed for Tauri/native apps that can't use cookies
    bearer(),
  ],

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
    config.betterAuth.github.clientId && config.betterAuth.github.clientSecret
  );
}

/**
 * Get the auth handler for mounting to Hono
 */
export function getAuthHandler() {
  return auth.handler;
}

log.info("Better Auth initialized with PostgreSQL", {
  baseURL: config.publicUrl,
  githubConfigured: !!config.betterAuth.github.clientId,
  environment: config.nodeEnv,
  database: "postgresql",
});
