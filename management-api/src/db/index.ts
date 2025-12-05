import { Database } from 'bun:sqlite';
import { config } from '../config.ts';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Ensure data directory exists
const dbDir = dirname(config.database.path);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Create database connection using Bun's native SQLite
export const db = new Database(config.database.path, { create: true });

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL');

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON');

/**
 * Initialize the database with schema
 */
export function initDatabase(): void {
  // Get the directory of the current file
  const currentDir = dirname(new URL(import.meta.url).pathname);
  const schemaPath = join(currentDir, 'schema.sql');
  
  // Read schema file
  const schema = readFileSync(schemaPath, 'utf-8');
  
  // Run schema
  db.exec(schema);
  
  console.log('Database initialized successfully');
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  db.close();
}

/**
 * Check if database is ready
 */
export function isDatabaseReady(): boolean {
  try {
    db.query('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

// Type helper for database rows
export type DbRow = Record<string, unknown>;
