/**
 * Authentication Middleware (DEPRECATED)
 *
 * This file is deprecated. Use the new auth middleware from ../auth/middleware.ts instead.
 * Kept for backward compatibility during migration.
 *
 * @deprecated Use ../auth/middleware.ts
 */

// Re-export from new location for backward compatibility
export {
  authMiddleware,
  optionalAuthMiddleware,
  sessionMiddleware,
  getCurrentUser,
  requireUser,
  type AuthUser,
} from "../auth/middleware";
