import { Hono } from "hono";
import { mintEnrollmentToken } from "../services/enrollment";

/**
 * POST /api/enrollment-tokens
 * Authenticated route — mints a one-time enrollment token for the current user.
 * Returns { token, expiresAt } where `token` is the plaintext token (shown once).
 */
export const enrollmentTokenRoutes = new Hono().post("/", async (c) => {
  const user = c.get("user");
  const { token, expiresAt } = await mintEnrollmentToken(user.id);
  return c.json({ token, expiresAt: expiresAt.toISOString() });
});
