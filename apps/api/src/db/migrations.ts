import { db } from './index.ts';

/**
 * Migration system for database schema changes
 * For now, we use a simple approach - schema.sql is the source of truth
 * Future migrations can be added here as needed
 */

interface Migration {
  version: number;
  name: string;
  up: () => void;
  down: () => void;
}

// Ensure migrations table exists
function ensureMigrationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// Get current migration version
function getCurrentVersion(): number {
  ensureMigrationsTable();
  const result = db.query('SELECT MAX(version) as version FROM _migrations').get() as { version: number | null } | null;
  return result?.version ?? 0;
}

// Record a migration as applied
function recordMigration(version: number, name: string): void {
  db.query('INSERT INTO _migrations (version, name) VALUES ($version, $name)').run({ $version: version, $name: name });
}

// Remove a migration record
function removeMigration(version: number): void {
  db.query('DELETE FROM _migrations WHERE version = $version').run({ $version: version });
}

/**
 * Run all pending migrations
 */
export function runMigrations(migrations: Migration[]): void {
  const currentVersion = getCurrentVersion();
  
  const pending = migrations
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);
  
  if (pending.length === 0) {
    console.log('No pending migrations');
    return;
  }
  
  console.log(`Running ${pending.length} migration(s)...`);
  
  for (const migration of pending) {
    console.log(`  → Applying migration ${migration.version}: ${migration.name}`);
    
    try {
      db.exec('BEGIN TRANSACTION');
      migration.up();
      recordMigration(migration.version, migration.name);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      console.error(`  ✗ Migration ${migration.version} failed:`, error);
      throw error;
    }
  }
  
  console.log('All migrations applied successfully');
}

/**
 * Rollback the last migration
 */
export function rollbackMigration(migrations: Migration[]): void {
  const currentVersion = getCurrentVersion();
  
  if (currentVersion === 0) {
    console.log('No migrations to rollback');
    return;
  }
  
  const migration = migrations.find(m => m.version === currentVersion);
  
  if (!migration) {
    console.error(`Migration ${currentVersion} not found`);
    return;
  }
  
  console.log(`Rolling back migration ${migration.version}: ${migration.name}`);
  
  try {
    db.exec('BEGIN TRANSACTION');
    migration.down();
    removeMigration(migration.version);
    db.exec('COMMIT');
    console.log('Rollback successful');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Rollback failed:', error);
    throw error;
  }
}

// Migrations list - add new migrations at the end
export const migrations: Migration[] = [
  // Migration 1: Add fqdn_url column for public OpenCode container URLs
  {
    version: 1,
    name: 'add_fqdn_url_to_projects',
    up: () => {
      // Check if column already exists (for idempotency)
      const tableInfo = db.query("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
      const columnExists = tableInfo.some(col => col.name === 'fqdn_url');
      if (!columnExists) {
        db.exec('ALTER TABLE projects ADD COLUMN fqdn_url TEXT');
      }
    },
    down: () => {
      // SQLite doesn't support DROP COLUMN in older versions
      // For rollback, we'd need to recreate the table without the column
      // This is a one-way migration for simplicity
      console.warn('Rollback not supported for this migration');
    },
  },
  
  // Migration 2: Add provider_credentials and oauth_state tables
  {
    version: 2,
    name: 'add_provider_credentials_tables',
    up: () => {
      // Create provider_credentials table
      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_credentials (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          provider_id TEXT NOT NULL UNIQUE,
          auth_type TEXT NOT NULL CHECK(auth_type IN ('api_key', 'oauth', 'device_flow')),
          api_key_encrypted TEXT,
          access_token_encrypted TEXT,
          refresh_token_encrypted TEXT,
          token_expires_at TEXT,
          oauth_provider TEXT,
          oauth_scopes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create oauth_state table
      db.exec(`
        CREATE TABLE IF NOT EXISTS oauth_state (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          device_code TEXT NOT NULL,
          user_code TEXT NOT NULL,
          verification_uri TEXT NOT NULL,
          interval_seconds INTEGER DEFAULT 5,
          expires_at TEXT NOT NULL,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'expired', 'error')),
          error_message TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider_id ON provider_credentials(provider_id);
        CREATE INDEX IF NOT EXISTS idx_oauth_state_provider_id ON oauth_state(provider_id);
        CREATE INDEX IF NOT EXISTS idx_oauth_state_status ON oauth_state(status);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS oauth_state');
      db.exec('DROP TABLE IF EXISTS provider_credentials');
    },
  },
  
  // Migration 3: Add llm_model column to projects table
  // Previously only llm_provider was stored, but we need to track both provider and model separately
  // This fixes the bug where model ID was incorrectly stored in llm_provider field
  {
    version: 3,
    name: 'add_llm_model_to_projects',
    up: () => {
      // Check if column already exists (for idempotency)
      const tableInfo = db.query("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
      const columnExists = tableInfo.some(col => col.name === 'llm_model');
      if (!columnExists) {
        db.exec('ALTER TABLE projects ADD COLUMN llm_model TEXT');
      }
    },
    down: () => {
      // SQLite doesn't support DROP COLUMN in older versions
      // For rollback, we'd need to recreate the table without the column
      console.warn('Rollback not supported for this migration - llm_model column will remain');
    },
  },
  
  // Migration 4: Add user OpenCode config tables
  // Stores user's global OpenCode settings (opencode.json, agents, commands, tools, plugins)
  // Applied via OPENCODE_CONFIG and OPENCODE_CONFIG_DIR environment variables
  {
    version: 4,
    name: 'add_user_opencode_config_tables',
    up: () => {
      // Create user_opencode_config table for settings and AGENTS.md
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_opencode_config (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          user_id TEXT NOT NULL UNIQUE,
          settings TEXT NOT NULL DEFAULT '{}',
          agents_md TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create user_opencode_files table for agents, commands, tools, plugins
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_opencode_files (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          user_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('agent', 'command', 'tool', 'plugin')),
          name TEXT NOT NULL,
          extension TEXT NOT NULL CHECK(extension IN ('md', 'ts', 'js')),
          content TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(user_id, type, name)
        )
      `);
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_opencode_config_user_id ON user_opencode_config(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_opencode_files_user_id ON user_opencode_files(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_opencode_files_type ON user_opencode_files(user_id, type);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS user_opencode_files');
      db.exec('DROP TABLE IF EXISTS user_opencode_config');
    },
  },
  
  // Migration 5: Add container tiers table and container columns to projects
  // Supports tiered container deployments with different resource allocations
  {
    version: 5,
    name: 'add_container_tiers',
    up: () => {
      // Create container_tiers table
      db.exec(`
        CREATE TABLE IF NOT EXISTS container_tiers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          image_type TEXT NOT NULL,
          cpu_limit TEXT NOT NULL,
          memory_limit TEXT NOT NULL,
          memory_reservation TEXT,
          storage_gb INTEGER NOT NULL,
          has_desktop_access INTEGER DEFAULT 0,
          is_default INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create index
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_container_tiers_default ON container_tiers(is_default);
      `);
      
      // Seed container tiers
      db.exec(`
        INSERT OR IGNORE INTO container_tiers (id, name, description, image_type, cpu_limit, memory_limit, memory_reservation, storage_gb, has_desktop_access, is_default, sort_order) VALUES
          ('lite', 'Lite', 'Basic tier for simple projects and learning. CLI access only.', 'cli', '1', '2g', '1g', 20, 0, 1, 1),
          ('standard', 'Standard', 'Balanced tier for web development and typical projects. CLI access only.', 'cli', '2', '4g', '2g', 30, 0, 0, 2),
          ('pro', 'Pro', 'High-performance tier for full-stack development with multiple services. CLI access only.', 'cli', '4', '8g', '4g', 50, 0, 0, 3),
          ('desktop', 'Desktop', 'Full desktop environment with GUI access via browser. Includes all Pro tier resources plus VNC.', 'desktop', '8', '16g', '8g', 75, 1, 0, 4);
      `);
      
      // Add container columns to projects table
      const tableInfo = db.query("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
      
      if (!tableInfo.some(col => col.name === 'container_tier_id')) {
        db.exec("ALTER TABLE projects ADD COLUMN container_tier_id TEXT DEFAULT 'lite'");
      }
      
      if (!tableInfo.some(col => col.name === 'container_version')) {
        db.exec("ALTER TABLE projects ADD COLUMN container_version TEXT DEFAULT '0.0.1'");
      }
      
      if (!tableInfo.some(col => col.name === 'container_update_available')) {
        db.exec("ALTER TABLE projects ADD COLUMN container_update_available INTEGER DEFAULT 0");
      }
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS container_tiers');
      // Note: SQLite doesn't support DROP COLUMN easily, columns will remain
      console.warn('Rollback: container_tiers table dropped, but project columns will remain');
    },
  },
  
  // Migration 6: Fix container tier memory units (Gi -> g)
  // Docker Compose expects lowercase 'g' not 'Gi'
  {
    version: 6,
    name: 'fix_container_tier_memory_units',
    up: () => {
      db.exec(`
        UPDATE container_tiers SET 
          memory_limit = REPLACE(memory_limit, 'Gi', 'g'),
          memory_reservation = REPLACE(memory_reservation, 'Gi', 'g')
        WHERE memory_limit LIKE '%Gi' OR memory_reservation LIKE '%Gi';
      `);
    },
    down: () => {
      db.exec(`
        UPDATE container_tiers SET 
          memory_limit = REPLACE(memory_limit, 'g', 'Gi'),
          memory_reservation = REPLACE(memory_reservation, 'g', 'Gi')
        WHERE memory_limit LIKE '%g' OR memory_reservation LIKE '%g';
      `);
    },
  },
  
  // Migration 7: Add vnc_url column to projects for desktop tier containers
  // Desktop containers have two domains: one for OpenCode API, one for VNC/noVNC
  {
    version: 7,
    name: 'add_vnc_url_to_projects',
    up: () => {
      const tableInfo = db.query("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
      const columnExists = tableInfo.some(col => col.name === 'vnc_url');
      if (!columnExists) {
        db.exec('ALTER TABLE projects ADD COLUMN vnc_url TEXT');
      }
    },
    down: () => {
      // SQLite doesn't support DROP COLUMN in older versions
      console.warn('Rollback not supported - vnc_url column will remain');
    },
  },
  
  // Migration 8: Add code_server_url column to projects
  // All containers now have code-server (VS Code in browser) on port 8080
  {
    version: 8,
    name: 'add_code_server_url_to_projects',
    up: () => {
      const tableInfo = db.query("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
      const columnExists = tableInfo.some(col => col.name === 'code_server_url');
      if (!columnExists) {
        db.exec('ALTER TABLE projects ADD COLUMN code_server_url TEXT');
      }
    },
    down: () => {
      // SQLite doesn't support DROP COLUMN in older versions
      console.warn('Rollback not supported - code_server_url column will remain');
    },
  },
];
