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
      db.exec('ALTER TABLE projects ADD COLUMN fqdn_url TEXT');
    },
    down: () => {
      // SQLite doesn't support DROP COLUMN in older versions
      // For rollback, we'd need to recreate the table without the column
      // This is a one-way migration for simplicity
      console.warn('Rollback not supported for this migration');
    },
  },
];
