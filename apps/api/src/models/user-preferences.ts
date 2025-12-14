/**
 * User Preferences Model
 * Server-side storage for user app settings
 * Enables bidirectional sync across devices
 */

import { db } from '../db/drizzle';
import { userPreferences } from '../db/schema/settings';
import { eq, sql } from 'drizzle-orm';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('user-preferences-model');

// =============================================================================
// Types
// =============================================================================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface UserPreferences {
  id: string;
  userId: string;
  
  // Theme
  themeMode: ThemeMode;
  themePreset: string;
  
  // App behavior
  autoRefreshInterval: number;
  inAppNotifications: boolean;
  systemNotifications: boolean;
  
  // Default sandbox configuration
  defaultResourceTierId: string;
  defaultFlavorId: string;
  defaultAddonIds: string[];
  defaultAgentId: string;
  
  // Sync tracking
  settingsVersion: number;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserPreferencesInput {
  themeMode?: ThemeMode;
  themePreset?: string;
  autoRefreshInterval?: number;
  inAppNotifications?: boolean;
  systemNotifications?: boolean;
  defaultResourceTierId?: string;
  defaultFlavorId?: string;
  defaultAddonIds?: string[];
  defaultAgentId?: string;
}

// Database row type from Drizzle schema
type UserPreferencesRow = typeof userPreferences.$inferSelect;

// =============================================================================
// Helpers
// =============================================================================

function rowToUserPreferences(row: UserPreferencesRow): UserPreferences {
  return {
    id: row.id,
    userId: row.userId,
    themeMode: (row.themeMode ?? 'system') as ThemeMode,
    themePreset: row.themePreset ?? 'default-neutral',
    autoRefreshInterval: row.autoRefreshInterval ?? 30,
    inAppNotifications: row.inAppNotifications ?? true,
    systemNotifications: row.systemNotifications ?? true,
    defaultResourceTierId: row.defaultResourceTierId ?? 'starter',
    defaultFlavorId: row.defaultFlavorId ?? 'fullstack',
    defaultAddonIds: JSON.parse(row.defaultAddonIds || '["code-server"]'),
    defaultAgentId: row.defaultAgentId ?? 'opencode',
    settingsVersion: row.settingsVersion ?? 1,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get user preferences by user ID
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const [row] = await db.select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  
  return row ? rowToUserPreferences(row) : null;
}

/**
 * Create default preferences for a user
 */
export async function createUserPreferences(userId: string): Promise<UserPreferences> {
  const id = crypto.randomUUID();
  const now = new Date();
  
  await db.insert(userPreferences).values({
    id,
    userId,
    themeMode: 'system',
    themePreset: 'default-neutral',
    autoRefreshInterval: 30,
    inAppNotifications: true,
    systemNotifications: true,
    defaultResourceTierId: 'starter',
    defaultFlavorId: 'fullstack',
    defaultAddonIds: '["code-server"]',
    defaultAgentId: 'opencode',
    settingsVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  
  log.info('Created user preferences', { userId });
  return (await getUserPreferences(userId))!;
}

/**
 * Get or create user preferences
 */
export async function getOrCreateUserPreferences(userId: string): Promise<UserPreferences> {
  const existing = await getUserPreferences(userId);
  if (existing) return existing;
  return createUserPreferences(userId);
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  userId: string,
  input: UpdateUserPreferencesInput
): Promise<UserPreferences | null> {
  const existing = await getUserPreferences(userId);
  if (!existing) return null;
  
  const updates: Partial<typeof userPreferences.$inferInsert> = {
    updatedAt: new Date(),
  };
  
  if (input.themeMode !== undefined) {
    updates.themeMode = input.themeMode;
  }
  if (input.themePreset !== undefined) {
    updates.themePreset = input.themePreset;
  }
  if (input.autoRefreshInterval !== undefined) {
    updates.autoRefreshInterval = input.autoRefreshInterval;
  }
  if (input.inAppNotifications !== undefined) {
    updates.inAppNotifications = input.inAppNotifications;
  }
  if (input.systemNotifications !== undefined) {
    updates.systemNotifications = input.systemNotifications;
  }
  if (input.defaultResourceTierId !== undefined) {
    updates.defaultResourceTierId = input.defaultResourceTierId;
  }
  if (input.defaultFlavorId !== undefined) {
    updates.defaultFlavorId = input.defaultFlavorId;
  }
  if (input.defaultAddonIds !== undefined) {
    updates.defaultAddonIds = JSON.stringify(input.defaultAddonIds);
  }
  if (input.defaultAgentId !== undefined) {
    updates.defaultAgentId = input.defaultAgentId;
  }
  
  // Only proceed if there are actual updates beyond updatedAt
  if (Object.keys(updates).length === 1) return existing;
  
  // Increment version for sync tracking
  await db.update(userPreferences)
    .set({
      ...updates,
      settingsVersion: sql`${userPreferences.settingsVersion} + 1`,
    })
    .where(eq(userPreferences.userId, userId));
  
  log.info('Updated user preferences', { userId, updates: Object.keys(input) });
  return getUserPreferences(userId);
}

/**
 * Delete user preferences
 */
export async function deleteUserPreferences(userId: string): Promise<boolean> {
  const result = await db.delete(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .returning({ id: userPreferences.id });
  
  if (result.length > 0) {
    log.info('Deleted user preferences', { userId });
    return true;
  }
  return false;
}

// =============================================================================
// Sync Utilities
// =============================================================================

/**
 * Get current settings version
 */
export async function getSettingsVersion(userId: string): Promise<number> {
  const [result] = await db.select({ settingsVersion: userPreferences.settingsVersion })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  
  return result?.settingsVersion ?? 0;
}

/**
 * Check if local version is out of sync
 */
export async function isOutOfSync(userId: string, localVersion: number): Promise<boolean> {
  const serverVersion = await getSettingsVersion(userId);
  return serverVersion > localVersion;
}
