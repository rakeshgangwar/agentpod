import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";
import { config } from "../config";

export const securityHeadersMiddleware = createMiddleware(async (c: Context, next: Next) => {
  await next();

  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
  );

  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
  );

  if (config.nodeEnv === "production" && config.traefik.tls) {
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  if (c.req.path.startsWith("/api/auth")) {
    c.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    c.header("Pragma", "no-cache");
  }
});
