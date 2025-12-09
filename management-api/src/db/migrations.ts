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
  
  // Migration 9: Add ACP multi-agent tables
  // Supports multi-agent orchestration via ACP Gateway
  {
    version: 9,
    name: 'add_acp_multi_agent_tables',
    up: () => {
      // Add default_agent_id to projects
      const projectTableInfo = db.query("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
      if (!projectTableInfo.some(col => col.name === 'default_agent_id')) {
        db.exec("ALTER TABLE projects ADD COLUMN default_agent_id TEXT DEFAULT 'opencode'");
      }
      
      // Create agent_auth_tokens table for storing encrypted OAuth tokens
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_auth_tokens (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          user_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          access_token_encrypted TEXT,
          refresh_token_encrypted TEXT,
          token_type TEXT DEFAULT 'Bearer',
          expires_at TEXT,
          scopes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(user_id, agent_id)
        )
      `);
      
      // Create agent_sessions table for persisting ACP sessions
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          acp_session_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'idle', 'processing', 'ended', 'error')),
          working_directory TEXT NOT NULL DEFAULT '/workspace',
          message_count INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          ended_at TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      
      // Create agent_session_messages table for message history
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_session_messages (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
          content TEXT NOT NULL,
          tool_name TEXT,
          tool_input TEXT,
          tool_result TEXT,
          is_partial INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
        )
      `);
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_agent_auth_tokens_user_agent ON agent_auth_tokens(user_id, agent_id);
        CREATE INDEX IF NOT EXISTS idx_agent_sessions_project ON agent_sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_agent_session_messages_session ON agent_session_messages(session_id);
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS agent_session_messages');
      db.exec('DROP TABLE IF EXISTS agent_sessions');
      db.exec('DROP TABLE IF EXISTS agent_auth_tokens');
      // Note: default_agent_id column will remain on projects
      console.warn('Rollback: ACP tables dropped, but default_agent_id column will remain on projects');
    },
  },
  
  // Migration 10: Modular container architecture
  // Replaces the old container_tiers table with new resource_tiers, container_flavors, and container_addons tables
  // This enables a more flexible container configuration: Resource Tier × Flavor × Add-ons
  {
    version: 10,
    name: 'add_modular_container_architecture',
    up: () => {
      // Create resource_tiers table (replaces old container_tiers resource allocation concept)
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_tiers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          cpu_cores REAL NOT NULL,
          memory_gb REAL NOT NULL,
          storage_gb INTEGER NOT NULL,
          price_monthly REAL DEFAULT 0,
          is_default INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create container_flavors table (language/framework images)
      db.exec(`
        CREATE TABLE IF NOT EXISTS container_flavors (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          languages TEXT NOT NULL,
          image_size_mb INTEGER,
          is_default INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create container_addons table (optional features)
      db.exec(`
        CREATE TABLE IF NOT EXISTS container_addons (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL,
          image_size_mb INTEGER,
          port INTEGER,
          requires_gpu INTEGER DEFAULT 0,
          requires_flavor TEXT,
          price_monthly REAL DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      
      // Create indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_tiers_default ON resource_tiers(is_default);
        CREATE INDEX IF NOT EXISTS idx_container_flavors_default ON container_flavors(is_default);
        CREATE INDEX IF NOT EXISTS idx_container_addons_category ON container_addons(category);
      `);
      
      // Seed resource tiers
      db.exec(`
        INSERT OR IGNORE INTO resource_tiers (id, name, description, cpu_cores, memory_gb, storage_gb, price_monthly, is_default, sort_order) VALUES
          ('starter', 'Starter', 'For learning and small projects', 1, 2, 20, 0, 1, 1),
          ('builder', 'Builder', 'For typical web development', 2, 4, 30, 10, 0, 2),
          ('creator', 'Creator', 'For full-stack development and multiple services', 4, 8, 50, 25, 0, 3),
          ('power', 'Power', 'For demanding workloads and ML/AI', 8, 16, 100, 50, 0, 4);
      `);
      
      // Seed container flavors
      db.exec(`
        INSERT OR IGNORE INTO container_flavors (id, name, description, languages, image_size_mb, is_default, sort_order) VALUES
          ('js', 'JavaScript', 'JavaScript and TypeScript development', '["javascript","typescript"]', 500, 0, 1),
          ('python', 'Python', 'Python development with data science tools', '["python"]', 600, 0, 2),
          ('go', 'Go', 'Go development environment', '["go"]', 400, 0, 3),
          ('rust', 'Rust', 'Rust development environment', '["rust"]', 500, 0, 4),
          ('fullstack', 'Full-Stack', 'JavaScript, TypeScript, and Python', '["javascript","typescript","python"]', 900, 1, 5),
          ('polyglot', 'Polyglot', 'All languages: JS, TS, Python, Go, Rust', '["javascript","typescript","python","go","rust"]', 1500, 0, 6);
      `);
      
      // Seed container addons
      db.exec(`
        INSERT OR IGNORE INTO container_addons (id, name, description, category, image_size_mb, port, requires_gpu, requires_flavor, price_monthly, sort_order) VALUES
          ('gui', 'GUI Desktop', 'Web-based desktop with KasmVNC', 'interface', 800, 6080, 0, NULL, 5, 1),
          ('code-server', 'Code Server', 'VS Code in browser', 'interface', 300, 8080, 0, NULL, 0, 2),
          ('gpu', 'GPU Support', 'NVIDIA CUDA for ML/AI workloads', 'compute', 500, NULL, 1, 'python,fullstack,polyglot', 20, 3),
          ('databases', 'Databases', 'PostgreSQL, Redis, and SQLite tools', 'storage', 400, 5432, 0, NULL, 5, 4),
          ('cloud', 'Cloud Tools', 'AWS, GCP, Azure CLIs and Terraform', 'devops', 600, NULL, 0, NULL, 0, 5);
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
      
      // Migrate existing projects from old container_tier_id to new schema
      // Map: lite->starter, standard->builder, pro->creator, desktop->power+gui
      db.exec(`
        UPDATE projects SET 
          resource_tier_id = CASE container_tier_id
            WHEN 'lite' THEN 'starter'
            WHEN 'standard' THEN 'builder'
            WHEN 'pro' THEN 'creator'
            WHEN 'desktop' THEN 'power'
            ELSE 'starter'
          END,
          flavor_id = 'fullstack',
          addon_ids = CASE container_tier_id
            WHEN 'desktop' THEN '["gui","code-server"]'
            ELSE '["code-server"]'
          END
        WHERE resource_tier_id IS NULL OR resource_tier_id = 'starter';
      `);
    },
    down: () => {
      db.exec('DROP TABLE IF EXISTS container_addons');
      db.exec('DROP TABLE IF EXISTS container_flavors');
      db.exec('DROP TABLE IF EXISTS resource_tiers');
      // Note: new project columns will remain
      console.warn('Rollback: Modular container tables dropped, but project columns will remain');
    },
  },
];
