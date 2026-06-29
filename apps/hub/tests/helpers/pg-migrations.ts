/**
 * Helper: ensure Drizzle Postgres migrations are applied to the test DB.
 *
 * Call `await ensurePgMigrations()` in the `beforeAll` of any integration
 * test suite that requires a Postgres-backed schema. The call is idempotent —
 * Drizzle's migrate() is a no-op when all migrations are already applied.
 *
 * Requires DATABASE_URL to be set before this module is first imported
 * (the drizzle.ts module reads it at load time).
 */

import { enableVectorExtension, runMigrations } from "../../src/db/drizzle";

let done = false;

export async function ensurePgMigrations(): Promise<void> {
  if (done) return;
  // pgvector must exist before migrations that use the vector column type.
  await enableVectorExtension();
  await runMigrations();
  done = true;
}
