/**
 * Drizzle ORM Database Connection
 *
 * PostgreSQL database connection using Drizzle ORM.
 * Replaces the SQLite connection for production use.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { createLogger } from "../utils/logger";

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
 * Create HNSW index for vector similarity search
 * Should be run after migration creates the knowledge_documents table
 */
export async function createVectorIndex(): Promise<void> {
  try {
    await client`
      CREATE INDEX IF NOT EXISTS knowledge_embedding_hnsw_idx 
      ON knowledge_documents 
      USING hnsw (embedding vector_cosine_ops)
    `;
    log.info("HNSW vector index created");
  } catch (error) {
    log.error("Failed to create vector index", { error });
    // Don't throw - index creation can fail if table doesn't exist yet
  }
}

/**
 * Initialize database (run on startup)
 * - Enables pgvector extension
 * - Creates vector indexes
 */
export async function initDatabase(): Promise<void> {
  log.info("Initializing PostgreSQL database...");

  // Check connection
  const healthy = await checkDatabaseHealth();
  if (!healthy) {
    throw new Error("Database connection failed");
  }

  // Enable pgvector
  await enableVectorExtension();

  // Create vector index (will fail silently if table doesn't exist)
  await createVectorIndex();

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
