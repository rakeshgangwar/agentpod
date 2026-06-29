/**
 * User Routes
 * Handles user-specific configuration including OpenCode settings
 * 
 * Endpoints:
 * - GET  /api/users/:userId/opencode/config     Get full config (for container startup)
 * - GET  /api/users/:userId/opencode/settings   Get settings only
 * - PUT  /api/users/:userId/opencode/settings   Update settings
 * - GET  /api/users/:userId/opencode/agents-md  Get AGENTS.md
 * - PUT  /api/users/:userId/opencode/agents-md  Update AGENTS.md
 * - GET  /api/users/:userId/opencode/files      List all files
 * - GET  /api/users/:userId/opencode/files/:type/:name  Get specific file
 * - PUT  /api/users/:userId/opencode/files/:type/:name  Create/update file
 * - DELETE /api/users/:userId/opencode/files/:type/:name  Delete file
 */

import { Hono } from 'hono';
import {
  getUserOpencodeConfig,
  getUserOpencodeFullConfig,
  updateUserOpencodeSettings,
  updateUserAgentsMd,
  listUserOpencodeFiles,
  getUserOpencodeFile,
  upsertUserOpencodeFile,
  deleteUserOpencodeFile,
  initializeUserOpencodeConfig,
  type OpencodeSettings,
} from '../models/user-opencode-config.ts';
import { syncUserConfigForUser, deleteFileForUser } from '../services/config-sync.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('users-routes');

export const userRoutes = new Hono()

  // =============================================================================
  // Full Config (for container startup)
  // =============================================================================
  
  /**
   * GET /:userId/opencode/config
   * Get full user config (settings + files) for container startup
   * This is what the entrypoint script fetches
   */
  .get('/:userId/opencode/config', async (c) => {
    const userId = c.req.param('userId');
    log.info('Fetching full OpenCode config', { userId });

    try {
      const config = await getUserOpencodeFullConfig(userId);
      return c.json(config);
    } catch (error) {
      log.error('Failed to get user config', { userId, error });
      return c.json({ error: 'Failed to get user config' }, 500);
    }
  })

  // =============================================================================
  // Settings
  // =============================================================================

  /**
   * GET /:userId/opencode/settings
   * Get user's opencode.json settings
   */
  .get('/:userId/opencode/settings', async (c) => {
    const userId = c.req.param('userId');
    log.info('Fetching OpenCode settings', { userId });

    try {
      const config = await getUserOpencodeConfig(userId);
      return c.json({ settings: config?.settings ?? {} });
    } catch (error) {
      log.error('Failed to get settings', { userId, error });
      return c.json({ error: 'Failed to get settings' }, 500);
    }
  })

  /**
   * PUT /:userId/opencode/settings
   * Update user's opencode.json settings
   */
  .put('/:userId/opencode/settings', async (c) => {
    const userId = c.req.param('userId');
    log.info('Updating OpenCode settings', { userId });

    try {
      const body = await c.req.json<{ settings: OpencodeSettings }>();
      
      if (!body.settings || typeof body.settings !== 'object') {
        return c.json({ error: 'Invalid settings object' }, 400);
      }

      const config = await updateUserOpencodeSettings(userId, body.settings);
      
      // Fire and forget: sync to running containers
      syncUserConfigForUser(userId).catch(err => {
        log.warn('Failed to sync settings to containers', { userId, error: err instanceof Error ? err.message : err });
      });

      return c.json({ 
        success: true, 
        settings: config.settings,
        message: 'Settings updated and synced to running containers.'
      });
    } catch (error) {
      log.error('Failed to update settings', { userId, error });
      return c.json({ error: 'Failed to update settings' }, 500);
    }
  })

  // =============================================================================
  // AGENTS.md
  // =============================================================================

  /**
   * GET /:userId/opencode/agents-md
   * Get user's global AGENTS.md content
   */
  .get('/:userId/opencode/agents-md', async (c) => {
    const userId = c.req.param('userId');
    log.info('Fetching AGENTS.md', { userId });

    try {
      const config = await getUserOpencodeConfig(userId);
      return c.json({ content: config?.agentsMd ?? '' });
    } catch (error) {
      log.error('Failed to get AGENTS.md', { userId, error });
      return c.json({ error: 'Failed to get AGENTS.md' }, 500);
    }
  })

  /**
   * PUT /:userId/opencode/agents-md
   * Update user's global AGENTS.md content
   */
  .put('/:userId/opencode/agents-md', async (c) => {
    const userId = c.req.param('userId');
    log.info('Updating AGENTS.md', { userId });

    try {
      const body = await c.req.json<{ content: string }>();
      
      if (typeof body.content !== 'string') {
        return c.json({ error: 'Invalid content' }, 400);
      }

      const config = await updateUserAgentsMd(userId, body.content);
      
      // Fire and forget: sync to running containers
      syncUserConfigForUser(userId).catch(err => {
        log.warn('Failed to sync AGENTS.md to containers', { userId, error: err instanceof Error ? err.message : err });
      });

      return c.json({ 
        success: true, 
        content: config.agentsMd,
        message: 'AGENTS.md updated and synced to running containers.'
      });
    } catch (error) {
      log.error('Failed to update AGENTS.md', { userId, error });
      return c.json({ error: 'Failed to update AGENTS.md' }, 500);
    }
  })

  // =============================================================================
  // Files (agents, commands, tools, plugins)
  // =============================================================================

  /**
   * GET /:userId/opencode/files
   * List all user's config files
   * Optional query param: ?type=agent|command|tool|plugin
   */
  .get('/:userId/opencode/files', async (c) => {
    const userId = c.req.param('userId');
    const type = c.req.query('type') as 'agent' | 'command' | 'tool' | 'plugin' | undefined;
    log.info('Listing OpenCode files', { userId, type });

    try {
      const files = await listUserOpencodeFiles(userId, type);
      return c.json({ 
        files: files.map(f => ({
          type: f.type,
          name: f.name,
          extension: f.extension,
          content: f.content,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        }))
      });
    } catch (error) {
      log.error('Failed to list files', { userId, error });
      return c.json({ error: 'Failed to list files' }, 500);
    }
  })

  /**
   * GET /:userId/opencode/files/:type/:name
   * Get a specific file
   */
  .get('/:userId/opencode/files/:type/:name', async (c) => {
    const userId = c.req.param('userId');
    const type = c.req.param('type');
    const name = c.req.param('name');
    log.info('Fetching OpenCode file', { userId, type, name });

    // Validate type
    if (!['agent', 'command', 'tool', 'plugin'].includes(type)) {
      return c.json({ error: 'Invalid file type' }, 400);
    }

    try {
      const file = await getUserOpencodeFile(userId, type, name);
      if (!file) {
        return c.json({ error: 'File not found' }, 404);
      }
      return c.json({
        type: file.type,
        name: file.name,
        extension: file.extension,
        content: file.content,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      });
    } catch (error) {
      log.error('Failed to get file', { userId, type, name, error });
      return c.json({ error: 'Failed to get file' }, 500);
    }
  })

  /**
   * PUT /:userId/opencode/files/:type/:name
   * Create or update a file
   */
  .put('/:userId/opencode/files/:type/:name', async (c) => {
    const userId = c.req.param('userId');
    const type = c.req.param('type') as 'agent' | 'command' | 'tool' | 'plugin';
    const name = c.req.param('name');
    log.info('Upserting OpenCode file', { userId, type, name });

    // Validate type
    if (!['agent', 'command', 'tool', 'plugin'].includes(type)) {
      return c.json({ error: 'Invalid file type' }, 400);
    }

    try {
      const body = await c.req.json<{ extension?: string; content: string }>();
      
      if (typeof body.content !== 'string') {
        return c.json({ error: 'Invalid content' }, 400);
      }

      // Determine extension
      let extension: 'md' | 'ts' | 'js';
      if (body.extension && ['md', 'ts', 'js'].includes(body.extension)) {
        extension = body.extension as 'md' | 'ts' | 'js';
      } else {
        // Default based on type
        extension = (type === 'agent' || type === 'command') ? 'md' : 'ts';
      }

      const file = await upsertUserOpencodeFile(userId, type, name, extension, body.content);
      
      // Fire and forget: sync to running containers
      syncUserConfigForUser(userId).catch(err => {
        log.warn('Failed to sync file to containers', { userId, type, name, error: err instanceof Error ? err.message : err });
      });

      return c.json({
        success: true,
        type: file.type,
        name: file.name,
        extension: file.extension,
        content: file.content,
        message: 'File updated and synced to running containers.'
      });
    } catch (error) {
      log.error('Failed to upsert file', { userId, type, name, error });
      return c.json({ error: 'Failed to update file' }, 500);
    }
  })

  /**
   * DELETE /:userId/opencode/files/:type/:name
   * Delete a file
   */
  .delete('/:userId/opencode/files/:type/:name', async (c) => {
    const userId = c.req.param('userId');
    const type = c.req.param('type');
    const name = c.req.param('name');
    log.info('Deleting OpenCode file', { userId, type, name });

    // Validate type
    if (!['agent', 'command', 'tool', 'plugin'].includes(type)) {
      return c.json({ error: 'Invalid file type' }, 400);
    }

    try {
      // Get file info before deleting (needed for container sync)
      const file = await getUserOpencodeFile(userId, type, name);
      if (!file) {
        return c.json({ error: 'File not found' }, 404);
      }

      const deleted = await deleteUserOpencodeFile(userId, type, name);
      if (!deleted) {
        return c.json({ error: 'Failed to delete file' }, 500);
      }

      // Fire and forget: delete from running containers
      deleteFileForUser(userId, type, name, file.extension).catch(err => {
        log.warn('Failed to delete file from containers', { userId, type, name, error: err instanceof Error ? err.message : err });
      });

      return c.json({ 
        success: true,
        message: 'File deleted and removed from running containers.'
      });
    } catch (error) {
      log.error('Failed to delete file', { userId, type, name, error });
      return c.json({ error: 'Failed to delete file' }, 500);
    }
  })

  // =============================================================================
  // Initialize (for new users)
  // =============================================================================

  /**
   * POST /:userId/opencode/init
   * Initialize config for a new user with defaults
   */
  .post('/:userId/opencode/init', async (c) => {
    const userId = c.req.param('userId');
    log.info('Initializing user OpenCode config', { userId });

    try {
      const config = await initializeUserOpencodeConfig(userId);
      return c.json({
        success: true,
        settings: config.settings,
        message: 'User config initialized'
      });
    } catch (error) {
      log.error('Failed to initialize config', { userId, error });
      return c.json({ error: 'Failed to initialize config' }, 500);
    }
  });
