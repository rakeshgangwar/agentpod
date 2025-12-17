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
        db.exec("ALTER TABLE projects ADD COLUMN container_version TEXT DEFAULT '0.3.0'");
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
  
  // Migration 10: Add modular containers support
  // Replaces monolithic container-tier system with resource tiers, flavors, and addons
  {
    version: 10,
    name: 'add_modular_containers',
    up: () => {
      // Create resource_tiers table
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_tiers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          cpu_cores INTEGER NOT NULL,
          memory_gb INTEGER NOT NULL,
          storage_gb INTEGER NOT NULL,
          price_monthly REAL NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      
      // Create container_flavors table
      db.exec(`
        CREATE TABLE IF NOT EXISTS container_flavors (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          languages TEXT NOT NULL DEFAULT '[]',
          image_size_mb INTEGER,
          is_default INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      
      // Create container_addons table
      db.exec(`
        CREATE TABLE IF NOT EXISTS container_addons (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL,
          image_size_mb INTEGER,
          port INTEGER,
          requires_gpu INTEGER NOT NULL DEFAULT 0,
          requires_flavor TEXT,
          price_monthly REAL NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      
      // Seed resource tiers
      db.exec(`
        INSERT OR IGNORE INTO resource_tiers (id, name, description, cpu_cores, memory_gb, storage_gb, price_monthly, is_default, sort_order) VALUES
        ('micro', 'Micro', 'Minimal workspace for AI-assisted coding', 1, 1, 10, 0, 0, 0),
        ('starter', 'Starter', 'Perfect for learning and small projects', 1, 2, 20, 0, 1, 1),
        ('builder', 'Builder', 'For active development and medium projects', 2, 4, 30, 10, 0, 2),
        ('creator', 'Creator', 'For professional development and larger projects', 4, 8, 50, 25, 0, 3),
        ('power', 'Power', 'Maximum resources for demanding workloads', 8, 16, 100, 50, 0, 4)
      `);
      
      // Seed container flavors
      db.exec(`
        INSERT OR IGNORE INTO container_flavors (id, name, description, languages, image_size_mb, is_default, sort_order) VALUES
        ('bare', 'Bare', 'Minimal workspace with OpenCode only. No language runtimes.', '[]', 500, 0, 0),
        ('js', 'JavaScript', 'JavaScript and TypeScript development', '["javascript","typescript"]', 800, 0, 1),
        ('python', 'Python', 'Python development with data science tools', '["python"]', 1200, 0, 2),
        ('go', 'Go', 'Go development environment', '["go"]', 900, 0, 3),
        ('rust', 'Rust', 'Rust development environment', '["rust"]', 1100, 0, 4),
        ('fullstack', 'Fullstack', 'JavaScript + Python for full-stack development', '["javascript","typescript","python"]', 1800, 1, 5),
        ('polyglot', 'Polyglot', 'All languages for maximum flexibility', '["javascript","typescript","python","go","rust"]', 3000, 0, 6)
      `);
      
      // Seed container addons
      db.exec(`
        INSERT OR IGNORE INTO container_addons (id, name, description, category, image_size_mb, port, requires_gpu, price_monthly, sort_order) VALUES
        ('gui', 'Desktop GUI', 'Full desktop environment via KasmVNC', 'interface', 800, 6080, 0, 5, 1),
        ('code-server', 'VS Code', 'VS Code in browser via code-server', 'interface', 300, 8080, 0, 0, 2),
        ('databases', 'Databases', 'PostgreSQL, Redis, and DuckDB', 'storage', 400, NULL, 0, 5, 3),
        ('cloud', 'Cloud Tools', 'AWS CLI, gcloud, Terraform, kubectl', 'devops', 600, NULL, 0, 0, 4),
        ('gpu', 'GPU Support', 'NVIDIA CUDA toolkit for ML/AI workloads', 'compute', 500, NULL, 1, 20, 5)
      `);
      
      // Add new columns to projects table
      const tableInfo = db.query("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
      
      if (!tableInfo.some(col => col.name === 'resource_tier_id')) {
        db.exec("ALTER TABLE projects ADD COLUMN resource_tier_id TEXT DEFAULT 'starter'");
      }
      
      if (!tableInfo.some(col => col.name === 'flavor_id')) {
        db.exec("ALTER TABLE projects ADD COLUMN flavor_id TEXT DEFAULT 'fullstack'");
      }
      
      if (!tableInfo.some(col => col.name === 'addon_ids')) {
        db.exec("ALTER TABLE projects ADD COLUMN addon_ids TEXT DEFAULT '[]'");
      }
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_tiers_default ON resource_tiers(is_default);
        CREATE INDEX IF NOT EXISTS idx_container_flavors_default ON container_flavors(is_default);
        CREATE INDEX IF NOT EXISTS idx_container_addons_category ON container_addons(category);
      `);
      
      // Migrate existing projects from containerTierId to new fields
      // Map old tiers to new resource tiers + flavors
      db.exec(`
        UPDATE projects SET 
          resource_tier_id = CASE container_tier_id
            WHEN 'lite' THEN 'starter'
            WHEN 'standard' THEN 'builder'
            WHEN 'pro' THEN 'creator'
            WHEN 'desktop' THEN 'creator'
            ELSE 'starter'
          END,
          flavor_id = 'fullstack',
          addon_ids = CASE container_tier_id
            WHEN 'desktop' THEN '["gui","code-server"]'
            ELSE '["code-server"]'
          END
        WHERE resource_tier_id IS NULL OR resource_tier_id = 'starter'
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS resource_tiers');
      db.exec('DROP TABLE IF EXISTS container_flavors');
      db.exec('DROP TABLE IF EXISTS container_addons');
      // Note: SQLite doesn't support DROP COLUMN easily, columns will remain
      console.warn('Rollback: modular container tables dropped, but project columns will remain');
    },
  },
  
  // Migration 11: Add enabled column to container_flavors
  // Allows disabling flavors without removing them from the database
  {
    version: 11,
    name: 'add_enabled_to_container_flavors',
    up: () => {
      const tableInfo = db.query("PRAGMA table_info(container_flavors)").all() as Array<{ name: string }>;
      const columnExists = tableInfo.some(col => col.name === 'enabled');
      if (!columnExists) {
        db.exec('ALTER TABLE container_flavors ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
      }
      
      // Disable go and polyglot flavors for now
      db.exec(`
        UPDATE container_flavors SET enabled = 0 WHERE id IN ('go', 'polyglot')
      `);
    },
    down: () => {
      // SQLite doesn't support DROP COLUMN
      // Just re-enable all flavors
      db.exec('UPDATE container_flavors SET enabled = 1');
    },
  },
  
  // Migration 12: Add Better Auth tables
  // Creates user, session, account, and verification tables for Better Auth
  {
    version: 12,
    name: 'add_better_auth_tables',
    up: () => {
      // Create user table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          emailVerified INTEGER NOT NULL DEFAULT 0,
          image TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      
      // Create session table
      db.exec(`
        CREATE TABLE IF NOT EXISTS session (
          id TEXT PRIMARY KEY NOT NULL,
          expiresAt TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
          ipAddress TEXT,
          userAgent TEXT,
          userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
        )
      `);
      
      // Create account table (for OAuth providers)
      db.exec(`
        CREATE TABLE IF NOT EXISTS account (
          id TEXT PRIMARY KEY NOT NULL,
          accountId TEXT NOT NULL,
          providerId TEXT NOT NULL,
          userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          accessToken TEXT,
          refreshToken TEXT,
          idToken TEXT,
          accessTokenExpiresAt TEXT,
          refreshTokenExpiresAt TEXT,
          scope TEXT,
          password TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      
      // Create verification table (for email verification, password reset)
      db.exec(`
        CREATE TABLE IF NOT EXISTS verification (
          id TEXT PRIMARY KEY NOT NULL,
          identifier TEXT NOT NULL,
          value TEXT NOT NULL,
          expiresAt TEXT NOT NULL,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);
        CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);
        CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
        CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);
        CREATE INDEX IF NOT EXISTS idx_account_providerId ON account(providerId, accountId);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS verification');
      db.exec('DROP TABLE IF EXISTS account');
      db.exec('DROP TABLE IF EXISTS session');
      db.exec('DROP TABLE IF EXISTS user');
    },
  },
  
  // =============================================================================
  // DATA PERSISTENCE MIGRATIONS (v13-v18)
  // See docs/implementation/data-persistence-plan.md for full architecture
  // =============================================================================
  
  // Migration 13: Add sandboxes table
  // Replaces Docker labels as source of truth for sandbox metadata
  // Associates sandboxes with users for proper data ownership
  {
    version: 13,
    name: 'add_sandboxes_table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sandboxes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          description TEXT,
          
          -- Git/Repository info
          repo_name TEXT NOT NULL,
          github_url TEXT,
          
          -- Container configuration (modular system)
          resource_tier_id TEXT DEFAULT 'starter',
          flavor_id TEXT DEFAULT 'fullstack',
          addon_ids TEXT DEFAULT '[]',
          
          -- Container runtime info
          container_id TEXT,
          container_name TEXT,
          status TEXT DEFAULT 'created' CHECK(status IN ('created', 'starting', 'running', 'stopping', 'stopped', 'error')),
          error_message TEXT,
          
          -- URLs
          opencode_url TEXT,
          acp_gateway_url TEXT,
          vnc_url TEXT,
          code_server_url TEXT,
          
          -- Timestamps
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          last_accessed_at TEXT,
          
          UNIQUE(user_id, slug)
        )
      `);
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sandboxes_user_id ON sandboxes(user_id);
        CREATE INDEX IF NOT EXISTS idx_sandboxes_status ON sandboxes(status);
        CREATE INDEX IF NOT EXISTS idx_sandboxes_container_id ON sandboxes(container_id);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS sandboxes');
    },
  },
  
  // Migration 14: Add chat_sessions table
  // Unified session tracking for both OpenCode and ACP Gateway sessions
  // Enables cross-device chat history access
  {
    version: 14,
    name: 'add_chat_sessions_table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          
          -- Session source
          source TEXT NOT NULL CHECK(source IN ('opencode', 'acp_gateway')),
          
          -- External references
          opencode_session_id TEXT,
          acp_session_id TEXT,
          acp_agent_id TEXT,
          
          -- Session metadata
          title TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
          
          -- Statistics
          message_count INTEGER DEFAULT 0,
          user_message_count INTEGER DEFAULT 0,
          assistant_message_count INTEGER DEFAULT 0,
          total_input_tokens INTEGER DEFAULT 0,
          total_output_tokens INTEGER DEFAULT 0,
          
          -- Timestamps
          last_message_at TEXT,
          last_synced_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create indexes - unique constraint on external IDs per sandbox
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_opencode 
          ON chat_sessions(sandbox_id, opencode_session_id) 
          WHERE opencode_session_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_acp 
          ON chat_sessions(sandbox_id, acp_session_id) 
          WHERE acp_session_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_sandbox ON chat_sessions(sandbox_id);
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS chat_sessions');
    },
  },
  
  // Migration 15: Add chat_messages table
  // Stores message content in raw format from source (OpenCode or ACP)
  // Supports streaming status and token tracking
  {
    version: 15,
    name: 'add_chat_messages_table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
          
          -- External reference
          external_message_id TEXT,
          
          -- Message content (raw format from source)
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          tool_calls TEXT,
          tool_results TEXT,
          thinking TEXT,
          
          -- Model info
          model_provider TEXT,
          model_id TEXT,
          agent_id TEXT,
          
          -- Token usage
          input_tokens INTEGER,
          output_tokens INTEGER,
          
          -- Message status
          status TEXT DEFAULT 'complete' CHECK(status IN ('streaming', 'complete', 'error', 'cancelled')),
          error_message TEXT,
          
          -- Timestamps
          created_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT
        )
      `);
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_external ON chat_messages(session_id, external_message_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS chat_messages');
    },
  },
  
  // Migration 16: Add user_preferences table
  // Server-side storage for user app settings
  // Enables bidirectional sync across devices
  {
    version: 16,
    name: 'add_user_preferences_table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
          
          -- Theme
          theme_mode TEXT DEFAULT 'system' CHECK(theme_mode IN ('light', 'dark', 'system')),
          theme_preset TEXT DEFAULT 'default-neutral',
          
          -- App behavior
          auto_refresh_interval INTEGER DEFAULT 30,
          in_app_notifications INTEGER DEFAULT 1,
          system_notifications INTEGER DEFAULT 1,
          
          -- Default sandbox configuration
          default_resource_tier_id TEXT DEFAULT 'starter',
          default_flavor_id TEXT DEFAULT 'fullstack',
          default_addon_ids TEXT DEFAULT '["code-server"]',
          default_agent_id TEXT DEFAULT 'opencode',
          
          -- Sync tracking
          settings_version INTEGER DEFAULT 1,
          
          -- Timestamps
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create index
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS user_preferences');
    },
  },
  
  // Migration 17: Add activity_log and activity_log_archive tables
  // Activity logging with 90-day retention, then archived (anonymized)
  // Supports audit trail and analytics
  {
    version: 17,
    name: 'add_activity_log_tables',
    up: () => {
      // Create activity_log table (90-day retention)
      db.exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
          
          -- Action details
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          
          -- Context
          metadata TEXT,
          ip_address TEXT,
          user_agent TEXT,
          
          -- For anonymization
          anonymized INTEGER DEFAULT 0,
          
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create activity_log_archive table (permanent, anonymized)
      db.exec(`
        CREATE TABLE IF NOT EXISTS activity_log_archive (
          id TEXT PRIMARY KEY,
          
          -- Anonymized action details
          action TEXT NOT NULL,
          entity_type TEXT,
          
          -- Aggregated metadata (no PII)
          metadata TEXT,
          
          -- Timestamps
          original_created_at TEXT NOT NULL,
          archived_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
        CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_activity_archive_action ON activity_log_archive(action);
        CREATE INDEX IF NOT EXISTS idx_activity_archive_original ON activity_log_archive(original_created_at);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS activity_log_archive');
      db.exec('DROP TABLE IF EXISTS activity_log');
    },
  },
  
  // Migration 18: Migrate existing Docker sandboxes to database
  // This is a data migration that will be populated at runtime
  // The actual migration happens in sandbox-manager when Docker containers are detected
  {
    version: 18,
    name: 'prepare_docker_sandbox_migration',
    up: () => {
      // Add a flag to track migration status
      // The actual migration of Docker containers to the sandboxes table
      // happens at runtime in the sandbox-manager service
      db.exec(`
        INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES ('docker_sandbox_migration_pending', 'true', datetime('now'))
      `);
      
      // Ensure settings table exists (it might not if this is a fresh install)
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Re-insert the setting after ensuring table exists
      db.exec(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES ('docker_sandbox_migration_pending', 'true', datetime('now'))
      `);
    },
    down: () => {
      db.exec(`
        DELETE FROM settings WHERE key = 'docker_sandbox_migration_pending'
      `);
    },
  },
];
