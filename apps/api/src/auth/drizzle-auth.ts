/**
 * Better Auth Configuration with Drizzle PostgreSQL Adapter
 *
 * Replaces SQLite with PostgreSQL via Drizzle ORM.
 * Used when DATABASE_URL is set (PostgreSQL mode).
 * 
 * Features:
 * - GitHub OAuth (primary authentication method)
 * - Email/Password (optional)
 * - Admin plugin for user management
 * - First user becomes admin automatically
 * - Default resource limits created for new users
 */

import { betterAuth } from "better-auth";
import { bearer, admin, customSession } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/drizzle";
import { user as userTable, userResourceLimits, DEFAULT_RESOURCE_LIMITS } from "../db/schema";
import { config } from "../config";
import { createLogger } from "../utils/logger";
import { count, eq } from "drizzle-orm";
import { disableSignup } from "../models/system-settings";

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
    
    // Admin plugin - enables user management, banning, role management
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    
    // Custom session plugin - includes additional user fields in session response
    // This ensures the frontend can access role, banned etc. from getSession()
    customSession(async ({ user, session }) => {
      // Fetch the full user record from DB to get all custom fields
      const fullUser = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1)
        .then(rows => rows[0]);
      
      return {
        user: {
          ...user,
          role: fullUser?.role ?? "user",
          banned: fullUser?.banned ?? false,
          bannedReason: fullUser?.bannedReason ?? null,
          bannedAt: fullUser?.bannedAt ?? null,
        },
        session,
      };
    }),
  ],
  
  // ==========================================================================
  // User Additional Fields
  // ==========================================================================
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false, // Users can't set their own role
      },
      // Ban status
      banned: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      bannedReason: {
        type: "string",
        required: false,
        input: false,
      },
      bannedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  
  // ==========================================================================
  // Database Hooks
  // ==========================================================================
  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          // Check if this is the first user - make them admin
          const result = await db.select({ value: count() }).from(userTable);
          const userCount = result[0]?.value ?? 0;
          
          if (userCount === 0) {
            log.info("First user signup - assigning admin role", { email: userData.email });
            return {
              data: {
                ...userData,
                role: "admin",
              },
            };
          }
          
          log.info("New user signup", { email: userData.email });
          return { data: userData };
        },
        after: async (createdUser) => {
          // Create default resource limits for the new user
          try {
            await db.insert(userResourceLimits).values({
              id: crypto.randomUUID(),
              userId: createdUser.id,
              maxSandboxes: DEFAULT_RESOURCE_LIMITS.maxSandboxes,
              maxConcurrentRunning: DEFAULT_RESOURCE_LIMITS.maxConcurrentRunning,
              allowedTierIds: JSON.stringify(DEFAULT_RESOURCE_LIMITS.allowedTierIds),
              maxTierId: DEFAULT_RESOURCE_LIMITS.maxTierId,
              maxTotalStorageGb: DEFAULT_RESOURCE_LIMITS.maxTotalStorageGb,
              maxTotalCpuCores: DEFAULT_RESOURCE_LIMITS.maxTotalCpuCores,
              maxTotalMemoryGb: DEFAULT_RESOURCE_LIMITS.maxTotalMemoryGb,
              allowedAddonIds: DEFAULT_RESOURCE_LIMITS.allowedAddonIds 
                ? JSON.stringify(DEFAULT_RESOURCE_LIMITS.allowedAddonIds)
                : null,
            });
            log.info("Created default resource limits for user", { userId: createdUser.id });
          } catch (error) {
            log.error("Failed to create default resource limits", { 
              userId: createdUser.id, 
              error 
            });
            // Don't throw - user creation should still succeed
          }
          
          // If this is the first user (now admin), disable public signup
          if (createdUser.role === "admin") {
            try {
              await disableSignup(createdUser.id);
              log.info("Public signup disabled after first user creation", { 
                userId: createdUser.id 
              });
            } catch (error) {
              log.error("Failed to disable signup after first user", { 
                userId: createdUser.id, 
                error 
              });
              // Don't throw - user creation should still succeed
            }
          }
        },
      },
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
