/**
 * Drizzle ORM Database Connection
 *
 * PostgreSQL database connection using Drizzle ORM.
 * Replaces the SQLite connection for production use.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { createLogger } from "../utils/logger";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const log = createLogger("database");

// =============================================================================
// Configuration
// =============================================================================

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod";

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// =============================================================================
// PostgreSQL Client
// =============================================================================

/**
 * PostgreSQL client with connection pooling
 */
const client = postgres(connectionString, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  prepare: false, // Disable prepared statements for compatibility
});

// =============================================================================
// Drizzle Instance
// =============================================================================

/**
 * Drizzle ORM instance with full schema
 */
export const db = drizzle(client, { schema });

export type Database = typeof db;

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Check if database is healthy and accessible
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    log.error("Database health check failed", { error });
    return false;
  }
}

/**
 * Enable pgvector extension (must be run once on database setup)
 */
export async function enableVectorExtension(): Promise<void> {
  try {
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
    log.info("pgvector extension enabled");
  } catch (error) {
    log.error("Failed to enable pgvector extension", { error });
    throw error;
  }
}

/**
 * Run pending database migrations
 */
export async function runMigrations(): Promise<void> {
  log.info("Running database migrations...");
  
  try {
    // Get the migrations folder path relative to this file
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = join(currentDir, "drizzle-migrations");
    
    await migrate(db, { migrationsFolder });
    log.info("Database migrations completed successfully");
  } catch (error) {
    log.error("Failed to run migrations", { error });
    throw error;
  }
}

/**
 * Initialize database (run on startup)
 * - Runs pending migrations
 * - Enables pgvector extension
 * - Creates vector indexes
 * - Seeds reference data
 */
export async function initDatabase(): Promise<void> {
  log.info("Initializing PostgreSQL database...");

  // Check connection
  const healthy = await checkDatabaseHealth();
  if (!healthy) {
    throw new Error("Database connection failed");
  }

  // Run pending migrations automatically
  await runMigrations();

  log.info("Database initialized successfully");
}

/**
 * Close database connection gracefully
 */
export async function closeDatabase(): Promise<void> {
  await client.end();
  log.info("Database connection closed");
}

// =============================================================================
// Raw SQL Access
// =============================================================================

/**
 * Execute raw SQL query (for migrations, advanced queries, etc.)
 * Use the client directly for template literal queries:
 * const result = await rawSql`SELECT * FROM users WHERE id = ${userId}`;
 */
export const rawSql = client;

// =============================================================================
// Startup Log
// =============================================================================

log.info("Drizzle ORM initialized", {
  database: "postgresql",
  maxConnections: 10,
});
