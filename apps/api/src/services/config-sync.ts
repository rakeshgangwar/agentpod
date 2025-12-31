/**
 * Config Sync Service
 * 
 * Syncs configuration changes to running containers without restart.
 * Uses docker exec to write files directly to the container filesystem
 * and the OpenCode SDK to set provider credentials.
 * 
 * This service handles two types of configuration:
 * 1. Provider credentials - Uses OpenCode SDK's auth.set() API to properly
 *    register providers as "connected" in OpenCode
 * 2. User OpenCode config (opencode.json, AGENTS.md, custom files) - Written
 *    directly to the container filesystem
 * 
 * All sync operations are fire-and-forget to avoid blocking API responses.
 */

import { getSandboxManager } from './sandbox-manager.ts';
import { getAllUserCredentials, type ProviderCredential } from '../models/provider-credentials.ts';
import { getUserOpencodeFullConfig } from '../models/user-opencode-config.ts';
import * as SandboxModel from '../models/sandbox.ts';
import { opencodeV2 } from './opencode-v2.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('config-sync');

// Container paths - /home is the HOME directory for OpenCode config
const CONFIG_DIR = '/home/.config/opencode';

// Exec options for running as developer user
const EXEC_OPTS = { user: 'developer' };

/**
 * Escape a string for safe use in single-quoted shell strings.
 * Replaces ' with '\'' (end quote, escaped quote, start quote)
 */
function escapeForShell(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Execute a shell command in a container to write content to a file.
 * Creates parent directories if needed.
 */
async function writeFileToContainer(
  sandboxId: string,
  filePath: string,
  content: string
): Promise<void> {
  const manager = getSandboxManager();
  const escapedContent = escapeForShell(content);
  const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
  
  const command = [
    'sh', '-c',
    `mkdir -p '${dirPath}' && echo '${escapedContent}' > '${filePath}'`
  ];
  
  await manager.exec(sandboxId, command, EXEC_OPTS);
}

/**
 * Delete a file from a container (if it exists).
 */
async function deleteFileFromContainer(
  sandboxId: string,
  filePath: string
): Promise<void> {
  const manager = getSandboxManager();
  
  const command = [
    'sh', '-c',
    `rm -f '${filePath}'`
  ];
  
  await manager.exec(sandboxId, command, EXEC_OPTS);
}

// =============================================================================
// Single Container Sync Methods
// =============================================================================

/**
 * Convert a ProviderCredential to OpenCode auth format.
 */
function credentialToAuthFormat(
  credential: ProviderCredential
): { type: "api"; key: string } | { type: "oauth"; refresh: string; access: string; expires: number } | null {
  if (credential.authType === 'api_key' && credential.apiKey) {
    return {
      type: 'api',
      key: credential.apiKey,
    };
  }
  
  if ((credential.authType === 'oauth' || credential.authType === 'device_flow') && credential.accessToken) {
    // For device flow (like GitHub Copilot), the access token is also used as refresh token
    return {
      type: 'oauth',
      refresh: credential.accessToken,
      access: credential.accessToken,
      expires: credential.tokenExpiresAt 
        ? new Date(credential.tokenExpiresAt).getTime() 
        : 0,
    };
  }
  
  return null;
}

/**
 * Sync provider credentials to a specific container using OpenCode SDK.
 * 
 * This uses the auth.set() API to properly register providers as "connected"
 * in OpenCode, which is required for the provider to show up in the model selector.
 * 
 * IMPORTANT: After setting credentials, OpenCode must be restarted because it
 * caches provider state at startup. The restart is handled automatically.
 * 
 * @param sandboxId - The sandbox/container ID
 * @param userId - The user whose credentials to sync
 * @param options - Optional settings
 * @param options.restartOpenCode - Whether to restart OpenCode after sync (default: true)
 */
export async function syncAuthJson(
  sandboxId: string, 
  userId: string,
  options: { restartOpenCode?: boolean } = {}
): Promise<void> {
  const { restartOpenCode: shouldRestart = true } = options;
  
  const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
  if (!dbSandbox || dbSandbox.status !== 'running') {
    log.debug('Skipping auth sync - sandbox not running', { sandboxId, status: dbSandbox?.status });
    return;
  }

  try {
    // Get all credentials for this user
    const credentials = await getAllUserCredentials(userId);
    
    if (credentials.length === 0) {
      log.debug('No credentials to sync', { sandboxId, userId });
      return;
    }

    // Convert credentials to OpenCode auth format
    const authMap: Record<string, { type: "api"; key: string } | { type: "oauth"; refresh: string; access: string; expires: number }> = {};
    
    for (const credential of credentials) {
      const authEntry = credentialToAuthFormat(credential);
      if (authEntry) {
        authMap[credential.providerId] = authEntry;
      }
    }

    if (Object.keys(authMap).length === 0) {
      log.debug('No valid auth entries to sync', { sandboxId, userId });
      return;
    }

    // Use the SDK to set auth credentials
    const results = await opencodeV2.setMultipleAuth(sandboxId, authMap);
    
    log.info('Synced auth credentials to container via SDK', { 
      sandboxId, 
      userId, 
      successCount: results.success.length,
      failedCount: results.failed.length,
      successProviders: results.success,
      failedProviders: results.failed,
    });

    if (results.failed.length > 0) {
      log.warn('Some providers failed to sync', { 
        sandboxId, 
        userId, 
        failedProviders: results.failed 
      });
    }

    // Restart OpenCode to refresh the provider cache
    // This is necessary because OpenCode caches provider state at startup
    if (shouldRestart && results.success.length > 0) {
      log.info('Restarting OpenCode to refresh provider cache', { sandboxId });
      try {
        const restarted = await opencodeV2.restartOpenCode(sandboxId);
        if (restarted) {
          log.info('OpenCode restarted successfully after auth sync', { sandboxId });
        } else {
          log.warn('OpenCode restart timed out after auth sync', { sandboxId });
        }
      } catch (restartError) {
        log.error('Failed to restart OpenCode after auth sync', { 
          sandboxId, 
          error: restartError instanceof Error ? restartError.message : restartError 
        });
        // Don't throw - the credentials are set, just the restart failed
      }
    }
  } catch (error) {
    log.error('Failed to sync auth credentials', { sandboxId, userId, error: error instanceof Error ? error.message : error });
    throw error;
  }
}

/**
 * Sync user OpenCode config (settings, AGENTS.md, files) to a specific container.
 * 
 * @param sandboxId - The sandbox/container ID
 * @param userId - The user whose config to sync
 */
export async function syncUserConfig(sandboxId: string, userId: string): Promise<void> {
  const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
  if (!dbSandbox || dbSandbox.status !== 'running') {
    log.debug('Skipping config sync - sandbox not running', { sandboxId, status: dbSandbox?.status });
    return;
  }

  const config = await getUserOpencodeFullConfig(userId);
  if (!config) {
    log.debug('No user config found', { userId });
    return;
  }

  try {
    // 1. Sync opencode.json settings
    if (config.settings && Object.keys(config.settings).length > 0) {
      const settingsJson = JSON.stringify(config.settings, null, 2);
      await writeFileToContainer(sandboxId, `${CONFIG_DIR}/opencode.json`, settingsJson);
      log.debug('Synced opencode.json', { sandboxId });
    }

    // 2. Sync AGENTS.md (global instructions)
    if (config.agents_md) {
      await writeFileToContainer(sandboxId, `${CONFIG_DIR}/AGENTS.md`, config.agents_md);
      log.debug('Synced AGENTS.md', { sandboxId });
    }

    // 3. Sync custom files (agents, commands, tools, plugins)
    if (config.files && config.files.length > 0) {
      for (const file of config.files) {
        const filePath = `${CONFIG_DIR}/${file.type}/${file.name}.${file.extension}`;
        await writeFileToContainer(sandboxId, filePath, file.content);
      }
      log.debug('Synced custom files', { sandboxId, count: config.files.length });
    }

    log.info('Synced user config to container', { sandboxId, userId });
  } catch (error) {
    log.error('Failed to sync user config', { sandboxId, userId, error: error instanceof Error ? error.message : error });
    throw error;
  }
}

/**
 * Sync all config (auth + user config) to a specific container.
 * 
 * @param sandboxId - The sandbox/container ID
 * @param userId - The user whose config to sync
 */
export async function syncAllConfig(sandboxId: string, userId: string): Promise<void> {
  // Run both syncs in parallel
  await Promise.all([
    syncAuthJson(sandboxId, userId),
    syncUserConfig(sandboxId, userId),
  ]);
}

// =============================================================================
// User-Wide Sync Methods (All Running Containers)
// =============================================================================

/**
 * Sync provider credentials to all running containers for a user.
 * Fire and forget - errors are logged but don't propagate.
 * 
 * @param userId - The user whose credentials to sync
 */
export async function syncAuthJsonForUser(userId: string): Promise<void> {
  const sandboxes = await SandboxModel.listSandboxesByUserId(userId);
  const runningSandboxes = sandboxes.filter(s => s.status === 'running');

  if (runningSandboxes.length === 0) {
    log.debug('No running sandboxes for user', { userId });
    return;
  }

  log.info('Syncing auth.json to containers', { userId, count: runningSandboxes.length });

  // Sync to all containers in parallel
  await Promise.all(
    runningSandboxes.map(sandbox =>
      syncAuthJson(sandbox.id, userId).catch(err => {
        log.warn('Failed to sync auth.json to sandbox', { 
          sandboxId: sandbox.id, 
          error: err instanceof Error ? err.message : err 
        });
      })
    )
  );
}

/**
 * Sync user config to all running containers for a user.
 * Fire and forget - errors are logged but don't propagate.
 * 
 * @param userId - The user whose config to sync
 */
export async function syncUserConfigForUser(userId: string): Promise<void> {
  const sandboxes = await SandboxModel.listSandboxesByUserId(userId);
  const runningSandboxes = sandboxes.filter(s => s.status === 'running');

  if (runningSandboxes.length === 0) {
    log.debug('No running sandboxes for user', { userId });
    return;
  }

  log.info('Syncing user config to containers', { userId, count: runningSandboxes.length });

  // Sync to all containers in parallel
  await Promise.all(
    runningSandboxes.map(sandbox =>
      syncUserConfig(sandbox.id, userId).catch(err => {
        log.warn('Failed to sync user config to sandbox', { 
          sandboxId: sandbox.id, 
          error: err instanceof Error ? err.message : err 
        });
      })
    )
  );
}

/**
 * Sync all config (auth + user config) to all running containers for a user.
 * Fire and forget - errors are logged but don't propagate.
 * 
 * @param userId - The user whose config to sync
 */
export async function syncAllConfigForUser(userId: string): Promise<void> {
  const sandboxes = await SandboxModel.listSandboxesByUserId(userId);
  const runningSandboxes = sandboxes.filter(s => s.status === 'running');

  if (runningSandboxes.length === 0) {
    log.debug('No running sandboxes for user', { userId });
    return;
  }

  log.info('Syncing all config to containers', { userId, count: runningSandboxes.length });

  // Sync to all containers in parallel
  await Promise.all(
    runningSandboxes.map(sandbox =>
      syncAllConfig(sandbox.id, userId).catch(err => {
        log.warn('Failed to sync all config to sandbox', { 
          sandboxId: sandbox.id, 
          error: err instanceof Error ? err.message : err 
        });
      })
    )
  );
}

// =============================================================================
// Specific File Sync (for deletions)
// =============================================================================

/**
 * Delete a specific custom file from all running containers for a user.
 * Used when a user deletes an agent, command, tool, or plugin file.
 * 
 * @param userId - The user who deleted the file
 * @param fileType - Type of file (agent, command, tool, plugin)
 * @param fileName - Name of the file (without extension)
 * @param extension - File extension (md, ts, js)
 */
export async function deleteFileForUser(
  userId: string,
  fileType: string,
  fileName: string,
  extension: string
): Promise<void> {
  const sandboxes = await SandboxModel.listSandboxesByUserId(userId);
  const runningSandboxes = sandboxes.filter(s => s.status === 'running');

  if (runningSandboxes.length === 0) {
    log.debug('No running sandboxes for file deletion', { userId });
    return;
  }

  const filePath = `${CONFIG_DIR}/${fileType}/${fileName}.${extension}`;
  log.info('Deleting file from containers', { userId, filePath, count: runningSandboxes.length });

  await Promise.all(
    runningSandboxes.map(sandbox =>
      deleteFileFromContainer(sandbox.id, filePath).catch(err => {
        log.warn('Failed to delete file from sandbox', { 
          sandboxId: sandbox.id, 
          filePath,
          error: err instanceof Error ? err.message : err 
        });
      })
    )
  );
}
