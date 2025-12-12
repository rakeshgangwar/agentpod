/**
 * Activity Logger Middleware
 * 
 * Automatically logs user actions for audit trail.
 * 
 * Usage:
 * 1. Import and apply to specific routes: app.use('/api/sandboxes/*', activityLoggerMiddleware)
 * 2. Or manually call logActivity() in route handlers for specific actions
 * 
 * Automatic logging for:
 * - POST requests (create actions)
 * - PUT/PATCH requests (update actions)
 * - DELETE requests (delete actions)
 */

import { createMiddleware } from "hono/factory";
import { createActivityLog, type CreateActivityLogInput, type ActivityAction, type EntityType } from "../models/activity-log.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("activity-logger");

// =============================================================================
// Types
// =============================================================================

interface ActivityLoggerOptions {
  /** Skip logging for these paths (regex) */
  skipPaths?: RegExp[];
  /** Skip logging for GET requests */
  skipGet?: boolean;
  /** Custom action mapper */
  actionMapper?: (method: string, path: string) => ActivityAction | null;
  /** Custom entity extractor */
  entityExtractor?: (path: string) => { type?: EntityType; id?: string } | null;
}

// =============================================================================
// Route to Action Mapping
// =============================================================================

const DEFAULT_ACTION_MAP: Record<string, Record<string, ActivityAction>> = {
  // Sandbox routes
  "/api/v2/sandboxes": {
    POST: "sandbox.create",
  },
  "/api/v2/sandboxes/:id": {
    DELETE: "sandbox.delete",
    PATCH: "sandbox.update",
    PUT: "sandbox.update",
  },
  "/api/v2/sandboxes/:id/start": {
    POST: "sandbox.start",
  },
  "/api/v2/sandboxes/:id/stop": {
    POST: "sandbox.stop",
  },
  // Provider routes
  "/api/providers/:id/configure": {
    POST: "provider.configure",
  },
  "/api/providers/:id/oauth/init": {
    POST: "provider.oauth_complete",
  },
  // Preferences routes
  "/api/users/me/preferences": {
    PUT: "preferences.update",
    PATCH: "preferences.update",
  },
  // Chat routes
  "/api/v2/sandboxes/:id/chat/sessions": {
    POST: "chat.session_create",
  },
  "/api/v2/sandboxes/:id/chat/sessions/:sessionId": {
    DELETE: "chat.session_archive",
  },
};

/**
 * Match a path pattern against the actual path
 */
function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = path.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]!;
    const pathPart = pathParts[i]!;

    if (patternPart.startsWith(":")) {
      // This is a parameter
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

/**
 * Find matching action for a request
 */
function findAction(method: string, path: string): { action: ActivityAction; params: Record<string, string> } | null {
  for (const [pattern, methods] of Object.entries(DEFAULT_ACTION_MAP)) {
    const params = matchPath(pattern, path);
    if (params && methods[method]) {
      return { action: methods[method], params };
    }
  }
  return null;
}

/**
 * Extract entity info from path and params
 */
function extractEntity(path: string, params: Record<string, string>): { type?: EntityType; id?: string } {
  // Sandbox entity
  if (path.includes("/sandboxes/") && params.id) {
    return { type: "sandbox", id: params.id };
  }
  
  // Chat session entity
  if (path.includes("/chat/sessions/") && params.sessionId) {
    return { type: "chat_session", id: params.sessionId };
  }
  
  // Provider entity
  if (path.includes("/providers/") && params.id) {
    return { type: "provider", id: params.id };
  }
  
  // User entity (preferences)
  if (path.includes("/users/me/")) {
    return { type: "user" };
  }
  
  return {};
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Create activity logger middleware
 */
export function createActivityLoggerMiddleware(options: ActivityLoggerOptions = {}) {
  const {
    skipPaths = [/\/health/, /\/docs/, /\/swagger/],
    skipGet = true,
  } = options;

  return createMiddleware(async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    // Skip if path matches skip patterns
    if (skipPaths.some((pattern) => pattern.test(path))) {
      return next();
    }

    // Skip GET requests if configured
    if (skipGet && method === "GET") {
      return next();
    }

    // Process the request
    await next();

    // Only log successful responses (2xx)
    const status = c.res.status;
    if (status < 200 || status >= 300) {
      return;
    }

    // Find action for this request
    const match = findAction(method, path);
    if (!match) {
      return; // No action defined for this route
    }

    const { action, params } = match;
    const entity = extractEntity(path, params);

    // Get user info from context (auth middleware sets 'user' directly)
    const user = c.get("user") as { id?: string } | undefined;
    const userId = user?.id && user.id !== "anonymous" ? user.id : undefined;

    // Get request context
    const ipAddress = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip");
    const userAgent = c.req.header("user-agent");

    // Build metadata
    const metadata: Record<string, unknown> = {};
    if (Object.keys(params).length > 0) {
      metadata.params = params;
    }

    // Create activity log
    try {
      const input: CreateActivityLogInput = {
        userId,
        action,
        entityType: entity.type,
        entityId: entity.id,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        ipAddress,
        userAgent,
      };

      createActivityLog(input);
      log.debug("Logged activity", { action, entityType: entity.type, entityId: entity.id, userId });
    } catch (error) {
      log.error("Failed to log activity", { action, error });
      // Don't fail the request if logging fails
    }
  });
}

/**
 * Default activity logger middleware instance
 */
export const activityLoggerMiddleware = createActivityLoggerMiddleware();

// =============================================================================
// Manual Logging Helper
// =============================================================================

/**
 * Manually log an activity
 * Use this in route handlers for complex actions
 */
export function logActivity(
  c: { get: (key: string) => unknown; req: { header: (name: string) => string | undefined } },
  action: ActivityAction,
  entityType?: EntityType,
  entityId?: string,
  metadata?: Record<string, unknown>
): void {
  // Get user info from context (auth middleware sets 'user' directly)
  const user = c.get("user") as { id?: string } | undefined;
  const userId = user?.id && user.id !== "anonymous" ? user.id : undefined;
  const ipAddress = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip");
  const userAgent = c.req.header("user-agent");

  try {
    createActivityLog({
      userId,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress,
      userAgent,
    });
    log.debug("Manually logged activity", { action, entityType, entityId, userId });
  } catch (error) {
    log.error("Failed to manually log activity", { action, error });
  }
}
