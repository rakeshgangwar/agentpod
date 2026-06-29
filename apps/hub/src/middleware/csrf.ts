import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";
import { isAllowedOrigin } from "../config";
import { createLogger } from "../utils/logger";

const log = createLogger("csrf");

const STATE_CHANGING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Returns true when the given origin is permitted by the hub's unified
 * allowlist (config.ts → allowedOrigins + LAN-IP passthrough).
 * Note: unlike the CSWSH check, CSRF must reject a *missing* origin when
 * the request carries a session cookie (handled in the middleware body).
 */
function isValidOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  // Delegate to the single canonical helper (closes #89 — no second list).
  return isAllowedOrigin(origin);
}

export const csrfMiddleware = createMiddleware(async (c: Context, next: Next) => {
  if (!STATE_CHANGING_METHODS.includes(c.req.method)) {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const origin = c.req.header("Origin");
  const referer = c.req.header("Referer");

  if (origin) {
    if (!isValidOrigin(origin)) {
      log.warn("CSRF check failed: invalid origin", {
        origin,
        path: c.req.path,
      });
      
      return c.json(
        {
          error: "Forbidden",
          message: "Invalid request origin",
        },
        403
      );
    }
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      
      if (!isValidOrigin(refererOrigin)) {
        log.warn("CSRF check failed: invalid referer", {
          referer,
          path: c.req.path,
        });
        
        return c.json(
          {
            error: "Forbidden",
            message: "Invalid request origin",
          },
          403
        );
      }
    } catch {
      log.warn("CSRF check failed: malformed referer", { referer });
      return c.json(
        {
          error: "Forbidden",
          message: "Invalid request origin",
        },
        403
      );
    }
  } else {
    const hasCookie = c.req.header("Cookie")?.includes("better-auth");
    
    if (hasCookie) {
      log.warn("CSRF check failed: missing origin/referer with cookie", {
        path: c.req.path,
      });
      
      return c.json(
        {
          error: "Forbidden",
          message: "Request origin required",
        },
        403
      );
    }
  }

  return next();
});
