/**
 * User OpenCode Config Model
 * Manages user's global OpenCode settings (opencode.json, agents, commands, tools, plugins)
 * 
 * These settings are loaded at container startup via:
 * - OPENCODE_CONFIG: Points to user's opencode.json settings
 * - OPENCODE_CONFIG_DIR: Points to user's config directory (agents, commands, etc.)
 */

import { db } from '../db/drizzle';
import { userOpencodeConfig, userOpencodeFiles } from '../db/schema/settings';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('user-opencode-config');

// =============================================================================
// Types
// =============================================================================

export interface OpencodeSettings {
  $schema?: string;
  theme?: string;
  model?: string;
  small_model?: string;
  autoupdate?: boolean;
  share?: string;
  keybinds?: Record<string, string>;
  permission?: {
    bash?: string | Record<string, string>;
    write?: string;
    edit?: string;
    webfetch?: string;
    mcp?: string;
    doom_loop?: string;
    external_directory?: string;
  };
  tools?: Record<string, boolean>;
  mcp?: Record<string, {
    type: 'local' | 'remote';
    command?: string[];
    url?: string;
    enabled?: boolean;
    environment?: Record<string, string>;
    headers?: Record<string, string>;
    timeout?: number;
  }>;
  agent?: Record<string, {
    description?: string;
    mode?: 'primary' | 'subagent' | 'all';
    model?: string;
    temperature?: number;
    maxSteps?: number;
    prompt?: string;
    tools?: Record<string, boolean>;
    permission?: Record<string, string | Record<string, string>>;
  }>;
  command?: Record<string, {
    template: string;
    description?: string;
    agent?: string;
    model?: string;
    subtask?: boolean;
  }>;
  instructions?: string[];
  disabled_providers?: string[];
  provider?: Record<string, {
    npm?: string;
    name?: string;
    options?: Record<string, unknown>;
    models?: Record<string, unknown>;
  }>;
}

export interface UserOpencodeConfig {
  id: string;
  userId: string;
  settings: OpencodeSettings;
  agentsMd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserOpencodeFile {
  id: string;
  userId: string;
  type: 'agent' | 'command' | 'tool' | 'plugin';
  name: string;
  extension: 'md' | 'ts' | 'js';
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserOpencodeFullConfig {
  settings: OpencodeSettings;
  agents_md?: string;
  files: Array<{
    type: string;
    name: string;
    extension: string;
    content: string;
  }>;
}

// =============================================================================
// User Config CRUD
// =============================================================================

/**
 * Get user's OpenCode config (settings + AGENTS.md)
 */
export async function getUserOpencodeConfig(userId: string): Promise<UserOpencodeConfig | null> {
  const [row] = await db.select()
    .from(userOpencodeConfig)
    .where(eq(userOpencodeConfig.userId, userId));

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    settings: JSON.parse(row.settings || '{}'),
    agentsMd: row.agentsMd ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Create or update user's OpenCode config
 */
export async function upsertUserOpencodeConfig(
  userId: string,
  settings: OpencodeSettings,
  agentsMd?: string
): Promise<UserOpencodeConfig> {
  const existing = await getUserOpencodeConfig(userId);
  const now = new Date();

  if (existing) {
    await db.update(userOpencodeConfig)
      .set({
        settings: JSON.stringify(settings),
        agentsMd: agentsMd ?? null,
        updatedAt: now,
      })
      .where(eq(userOpencodeConfig.userId, userId));
    log.info('Updated user OpenCode config', { userId });
  } else {
    const id = crypto.randomUUID();
    await db.insert(userOpencodeConfig)
      .values({
        id,
        userId,
        settings: JSON.stringify(settings),
        agentsMd: agentsMd ?? null,
        createdAt: now,
        updatedAt: now,
      });
    log.info('Created user OpenCode config', { userId });
  }

  return (await getUserOpencodeConfig(userId))!;
}

/**
 * Update only the settings portion
 */
export async function updateUserOpencodeSettings(
  userId: string,
  settings: OpencodeSettings
): Promise<UserOpencodeConfig> {
  const existing = await getUserOpencodeConfig(userId);
  return upsertUserOpencodeConfig(userId, settings, existing?.agentsMd);
}

/**
 * Update only the AGENTS.md portion
 */
export async function updateUserAgentsMd(
  userId: string,
  agentsMd: string
): Promise<UserOpencodeConfig> {
  const existing = await getUserOpencodeConfig(userId);
  return upsertUserOpencodeConfig(userId, existing?.settings ?? {}, agentsMd);
}

/**
 * Delete user's OpenCode config
 */
export async function deleteUserOpencodeConfig(userId: string): Promise<boolean> {
  const result = await db.delete(userOpencodeConfig)
    .where(eq(userOpencodeConfig.userId, userId))
    .returning({ id: userOpencodeConfig.id });
  
  if (result.length > 0) {
    log.info('Deleted user OpenCode config', { userId });
    return true;
  }
  return false;
}

// =============================================================================
// User Files CRUD
// =============================================================================

/**
 * List all files for a user
 */
export async function listUserOpencodeFiles(
  userId: string,
  type?: 'agent' | 'command' | 'tool' | 'plugin'
): Promise<UserOpencodeFile[]> {
  let query = db.select()
    .from(userOpencodeFiles)
    .where(eq(userOpencodeFiles.userId, userId))
    .orderBy(userOpencodeFiles.type, userOpencodeFiles.name);

  const rows = type
    ? await db.select()
        .from(userOpencodeFiles)
        .where(and(
          eq(userOpencodeFiles.userId, userId),
          eq(userOpencodeFiles.type, type)
        ))
        .orderBy(userOpencodeFiles.type, userOpencodeFiles.name)
    : await query;

  return rows.map(row => ({
    id: row.id,
    userId: row.userId,
    type: row.type as 'agent' | 'command' | 'tool' | 'plugin',
    name: row.name,
    extension: row.extension as 'md' | 'ts' | 'js',
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Get a specific file
 */
export async function getUserOpencodeFile(
  userId: string,
  type: string,
  name: string
): Promise<UserOpencodeFile | null> {
  const [row] = await db.select()
    .from(userOpencodeFiles)
    .where(and(
      eq(userOpencodeFiles.userId, userId),
      eq(userOpencodeFiles.type, type as 'agent' | 'command' | 'tool' | 'plugin'),
      eq(userOpencodeFiles.name, name)
    ));

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    type: row.type as 'agent' | 'command' | 'tool' | 'plugin',
    name: row.name,
    extension: row.extension as 'md' | 'ts' | 'js',
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Create or update a file
 */
export async function upsertUserOpencodeFile(
  userId: string,
  type: 'agent' | 'command' | 'tool' | 'plugin',
  name: string,
  extension: 'md' | 'ts' | 'js',
  content: string
): Promise<UserOpencodeFile> {
  const existing = await getUserOpencodeFile(userId, type, name);
  const now = new Date();

  if (existing) {
    await db.update(userOpencodeFiles)
      .set({
        extension,
        content,
        updatedAt: now,
      })
      .where(and(
        eq(userOpencodeFiles.userId, userId),
        eq(userOpencodeFiles.type, type),
        eq(userOpencodeFiles.name, name)
      ));
    log.info('Updated user OpenCode file', { userId, type, name });
  } else {
    const id = crypto.randomUUID();
    await db.insert(userOpencodeFiles)
      .values({
        id,
        userId,
        type,
        name,
        extension,
        content,
        createdAt: now,
        updatedAt: now,
      });
    log.info('Created user OpenCode file', { userId, type, name });
  }

  return (await getUserOpencodeFile(userId, type, name))!;
}

/**
 * Delete a file
 */
export async function deleteUserOpencodeFile(
  userId: string,
  type: string,
  name: string
): Promise<boolean> {
  const result = await db.delete(userOpencodeFiles)
    .where(and(
      eq(userOpencodeFiles.userId, userId),
      eq(userOpencodeFiles.type, type as 'agent' | 'command' | 'tool' | 'plugin'),
      eq(userOpencodeFiles.name, name)
    ))
    .returning({ id: userOpencodeFiles.id });
  
  if (result.length > 0) {
    log.info('Deleted user OpenCode file', { userId, type, name });
    return true;
  }
  return false;
}

/**
 * Delete all files of a type
 */
export async function deleteUserOpencodeFilesByType(
  userId: string,
  type: string
): Promise<number> {
  const result = await db.delete(userOpencodeFiles)
    .where(and(
      eq(userOpencodeFiles.userId, userId),
      eq(userOpencodeFiles.type, type as 'agent' | 'command' | 'tool' | 'plugin')
    ))
    .returning({ id: userOpencodeFiles.id });
  
  if (result.length > 0) {
    log.info('Deleted user OpenCode files', { userId, type, count: result.length });
  }
  return result.length;
}

/**
 * Delete all files for a user
 */
export async function deleteAllUserOpencodeFiles(userId: string): Promise<number> {
  const result = await db.delete(userOpencodeFiles)
    .where(eq(userOpencodeFiles.userId, userId))
    .returning({ id: userOpencodeFiles.id });
  
  if (result.length > 0) {
    log.info('Deleted all user OpenCode files', { userId, count: result.length });
  }
  return result.length;
}

// =============================================================================
// Full Config (for container fetch)
// =============================================================================

/**
 * Get full user config (settings + files) for container startup
 * This is what the entrypoint script fetches
 */
export async function getUserOpencodeFullConfig(userId: string): Promise<UserOpencodeFullConfig> {
  const config = await getUserOpencodeConfig(userId);
  const files = await listUserOpencodeFiles(userId);

  return {
    settings: config?.settings ?? {},
    agents_md: config?.agentsMd,
    files: files.map(f => ({
      type: f.type,
      name: f.name,
      extension: f.extension,
      content: f.content,
    })),
  };
}

// =============================================================================
// Default Config
// =============================================================================

/**
 * Get default settings for new users
 */
export function getDefaultOpencodeSettings(): OpencodeSettings {
  return {
    $schema: 'https://opencode.ai/config.json',
    // Theme and model left unset (use platform defaults)
    // Permissions left unset (use platform defaults)
  };
}

/**
 * Initialize config for a new user with defaults
 */
export async function initializeUserOpencodeConfig(userId: string): Promise<UserOpencodeConfig> {
  const existing = await getUserOpencodeConfig(userId);
  if (existing) return existing;

  return upsertUserOpencodeConfig(userId, getDefaultOpencodeSettings());
}
