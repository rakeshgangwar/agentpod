import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";
import { config } from "../config";
import { createLogger } from "../utils/logger";

const log = createLogger("csrf");

const STATE_CHANGING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function getAllowedOrigins(): string[] {
  const origins = [
    "http://localhost:1420",
    "http://localhost:5173",
    "tauri://localhost",
    config.publicUrl,
  ];

  if (config.domain.base !== "localhost") {
    origins.push(`${config.domain.protocol}://${config.domain.base}`);
    origins.push(`${config.domain.protocol}://api.${config.domain.base}`);
  }

  return origins.filter(Boolean);
}

function isValidOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  
  const allowed = getAllowedOrigins();
  return allowed.some(allowedOrigin => {
    if (origin === allowedOrigin) return true;
    if (origin.startsWith("tauri://")) return true;
    return false;
  });
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
        allowed: getAllowedOrigins(),
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
