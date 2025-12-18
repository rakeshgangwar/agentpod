/**
 * Admin Middleware
 * 
 * Middleware for protecting admin routes and checking user status.
 */

import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { isUserAdmin, isUserBanned, getUserRole } from "../models/admin-users";
import { isSignupEnabled } from "../models/system-settings";
import { createLogger } from "../utils/logger";

const log = createLogger("admin-middleware");

// =============================================================================
// Types
// =============================================================================

/**
 * Extended context variables for admin routes
 */
export interface AdminContext {
  adminUser: {
    id: string;
    email?: string;
    role: string;
  };
}

// =============================================================================
// Admin Middleware
// =============================================================================

/**
 * Middleware that requires admin role
 * Must be used after authMiddleware
 */
export const adminMiddleware = createMiddleware(async (c, next) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Check if user is admin
  const isAdmin = await isUserAdmin(user.id);

  if (!isAdmin) {
    log.warn("Non-admin user attempted to access admin route", {
      userId: user.id,
      email: user.email,
      path: c.req.path,
    });
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  // Store admin context
  c.set("adminUser", {
    id: user.id,
    email: user.email,
    role: "admin",
  });

  return next();
});

// =============================================================================
// Ban Check Middleware
// =============================================================================

/**
 * Middleware that blocks banned users
 * Should be used on all authenticated routes
 */
export const banCheckMiddleware = createMiddleware(async (c, next) => {
  const user = c.get("user");

  // Skip if no user (public route or not authenticated)
  if (!user) {
    return next();
  }

  // Check if user is banned
  const banned = await isUserBanned(user.id);

  if (banned) {
    log.warn("Banned user attempted to access API", {
      userId: user.id,
      email: user.email,
      path: c.req.path,
    });
    return c.json(
      { 
        error: "Account suspended",
        message: "Your account has been suspended. Contact support for more information.",
      },
      403
    );
  }

  return next();
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the admin user from context
 * Throws if not an admin request
 */
export function requireAdmin(c: Context): AdminContext["adminUser"] {
  const adminUser = c.get("adminUser");
  if (!adminUser) {
    throw new Error("Admin context not available. Ensure adminMiddleware is applied.");
  }
  return adminUser;
}

/**
 * Get request metadata for audit logging
 */
export function getRequestContext(c: Context): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || undefined,
    userAgent: c.req.header("user-agent") || undefined,
  };
}

/**
 * Check if the current user is an admin (for conditional logic)
 */
export async function checkIsAdmin(c: Context): Promise<boolean> {
  const user = c.get("user");
  if (!user) return false;
  return isUserAdmin(user.id);
}

/**
 * Get user role from database (not cached in context)
 */
export async function checkUserRole(c: Context): Promise<string | null> {
  const user = c.get("user");
  if (!user) return null;
  return getUserRole(user.id);
}

// =============================================================================
// Signup Check Middleware
// =============================================================================

/**
 * Routes that should be blocked when signup is disabled
 * - POST /api/auth/sign-up/email - Email/password signup
 * - OAuth callbacks that create new users are handled by the database hook
 */
const SIGNUP_ROUTES = [
  "/api/auth/sign-up/email",
];

/**
 * Middleware that blocks public signup when disabled
 * Should be applied before the auth handler
 */
export const signupCheckMiddleware = createMiddleware(async (c, next) => {
  const path = c.req.path;
  const method = c.req.method;

  // Only check POST requests to signup routes
  if (method !== "POST") {
    return next();
  }

  // Check if this is a signup route
  const isSignupRoute = SIGNUP_ROUTES.some(route => path === route);
  
  if (!isSignupRoute) {
    return next();
  }

  // Check if signup is enabled
  const signupEnabled = await isSignupEnabled();

  if (!signupEnabled) {
    log.warn("Signup attempt blocked - signup disabled", { path });
    return c.json(
      {
        error: "Signup disabled",
        message: "Public registration is disabled. Please contact an administrator to create an account.",
      },
      403
    );
  }

  return next();
});
