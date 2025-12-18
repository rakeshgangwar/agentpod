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
 * Seed reference data (resource tiers, flavors, addons)
 * This is idempotent - safe to run multiple times
 */
export async function seedReferenceData(): Promise<void> {
  log.info("Seeding reference data...");

  // Resource Tiers
  const resourceTierData = [
    { id: "micro", name: "Micro", description: "Minimal workspace for AI-assisted coding", cpuCores: 1, memoryGb: 1, storageGb: 10, priceMonthly: 0, isDefault: false, sortOrder: 0 },
    { id: "starter", name: "Starter", description: "Perfect for learning and small projects", cpuCores: 1, memoryGb: 2, storageGb: 20, priceMonthly: 0, isDefault: true, sortOrder: 1 },
    { id: "builder", name: "Builder", description: "For active development and medium projects", cpuCores: 2, memoryGb: 4, storageGb: 30, priceMonthly: 10, isDefault: false, sortOrder: 2 },
    { id: "creator", name: "Creator", description: "For professional development and larger projects", cpuCores: 4, memoryGb: 8, storageGb: 50, priceMonthly: 25, isDefault: false, sortOrder: 3 },
    { id: "power", name: "Power", description: "Maximum resources for demanding workloads", cpuCores: 8, memoryGb: 16, storageGb: 100, priceMonthly: 50, isDefault: false, sortOrder: 4 },
  ];

  for (const tier of resourceTierData) {
    await db.insert(schema.resourceTiers)
      .values(tier)
      .onConflictDoUpdate({
        target: schema.resourceTiers.id,
        set: { ...tier, updatedAt: new Date() },
      });
  }
  log.info(`Seeded ${resourceTierData.length} resource tiers`);

  // Container Flavors
  const flavorData = [
    { id: "bare", name: "Bare", description: "Minimal workspace with OpenCode only. No language runtimes.", languages: '[]', imageSizeMb: 500, isDefault: false, enabled: true, sortOrder: 0 },
    { id: "js", name: "JavaScript", description: "JavaScript and TypeScript development", languages: '["javascript","typescript"]', imageSizeMb: 800, isDefault: true, enabled: true, sortOrder: 1 },
    { id: "python", name: "Python", description: "Python development with data science tools", languages: '["python"]', imageSizeMb: 1200, isDefault: false, enabled: true, sortOrder: 2 },
    { id: "go", name: "Go", description: "Go development environment", languages: '["go"]', imageSizeMb: 900, isDefault: false, enabled: true, sortOrder: 3 },
    { id: "rust", name: "Rust", description: "Rust development environment", languages: '["rust"]', imageSizeMb: 1100, isDefault: false, enabled: true, sortOrder: 4 },
    { id: "fullstack", name: "Fullstack", description: "JavaScript + Python for full-stack development", languages: '["javascript","typescript","python"]', imageSizeMb: 1800, isDefault: false, enabled: true, sortOrder: 5 },
    { id: "polyglot", name: "Polyglot", description: "All languages for maximum flexibility", languages: '["javascript","typescript","python","go","rust"]', imageSizeMb: 3000, isDefault: false, enabled: false, sortOrder: 6 },
  ];

  for (const flavor of flavorData) {
    await db.insert(schema.containerFlavors)
      .values(flavor)
      .onConflictDoUpdate({
        target: schema.containerFlavors.id,
        set: { ...flavor, updatedAt: new Date() },
      });
  }
  log.info(`Seeded ${flavorData.length} container flavors`);

  log.info("Reference data seeding completed");
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

  // Enable pgvector (needed before migrations that use vector type)
  await enableVectorExtension();

  // Run pending migrations automatically
  await runMigrations();

  // Create vector index (after migrations have created the tables)
  await createVectorIndex();

  // Seed reference data (idempotent)
  await seedReferenceData();

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
