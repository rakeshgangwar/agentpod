/**
 * Sync Routes
 * Handle GitHub synchronization for projects
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getProjectById, updateProject } from '../models/project.ts';
import { forgejo } from '../services/forgejo.ts';
import { opencode } from '../services/opencode.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('sync');

// =============================================================================
// Validation Schemas
// =============================================================================

const syncConfigSchema = z.object({
  githubUrl: z.string().url().optional(),
  syncEnabled: z.boolean().optional(),
  syncDirection: z.enum(['push', 'pull', 'bidirectional']).optional(),
});

const commitConfigSchema = z.object({
  message: z.string().min(1).max(500).optional(),
  push: z.boolean().optional().default(true),
});

// =============================================================================
// Routes
// =============================================================================

export const syncRoutes = new Hono()
  /**
   * GET /api/projects/:id/sync/status
   * Get sync status for a project
   */
  .get('/:id/sync/status', (c) => {
    const id = c.req.param('id');
    const project = getProjectById(id);
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    return c.json({
      projectId: project.id,
      githubRepoUrl: project.githubRepoUrl,
      syncEnabled: project.githubSyncEnabled,
      syncDirection: project.githubSyncDirection,
      lastSyncAt: project.lastSyncAt,
    });
  })

  /**
   * POST /api/projects/:id/sync/config
   * Configure sync settings for a project
   */
  .post('/:id/sync/config', zValidator('json', syncConfigSchema), (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    
    const project = getProjectById(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    const updates: Record<string, unknown> = {};
    
    if (body.githubUrl !== undefined) {
      updates.githubRepoUrl = body.githubUrl;
    }
    if (body.syncEnabled !== undefined) {
      updates.githubSyncEnabled = body.syncEnabled;
    }
    if (body.syncDirection !== undefined) {
      updates.githubSyncDirection = body.syncDirection;
    }
    
    // Note: updateProject expects camelCase keys matching UpdateProjectInput
    // We need to map them correctly
    const updated = updateProject(id, {
      githubSyncEnabled: body.syncEnabled,
      githubSyncDirection: body.syncDirection,
    });
    
    return c.json({
      project: updated,
      message: 'Sync configuration updated',
    });
  })

  /**
   * POST /api/projects/:id/sync
   * Trigger a sync operation
   * 
   * Note: For MVP, this uses Forgejo's mirror-sync for mirrored repos.
   * Full bidirectional sync requires more complex git operations.
   */
  .post('/:id/sync', async (c) => {
    const id = c.req.param('id');
    const project = getProjectById(id);
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    if (!project.githubRepoUrl) {
      return c.json({ 
        error: 'No GitHub repository configured for this project' 
      }, 400);
    }
    
    if (!project.githubSyncEnabled) {
      return c.json({ 
        error: 'GitHub sync is not enabled for this project' 
      }, 400);
    }
    
    log.info('Starting sync', { projectId: id, direction: project.githubSyncDirection });
    
    try {
      // For now, we only support pull (from GitHub to Forgejo) via mirror-sync
      // This works if the repo was created as a mirror
      if (project.githubSyncDirection === 'pull' || project.githubSyncDirection === 'bidirectional') {
        await forgejo.syncMirror(project.forgejoOwner, project.slug);
      }
      
      // Update last sync timestamp
      updateProject(id, { lastSyncAt: new Date().toISOString() });
      
      log.info('Sync completed', { projectId: id });
      
      return c.json({
        success: true,
        message: 'Sync initiated',
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Sync failed', { projectId: id, error });
      
      return c.json({
        success: false,
        error: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }, 500);
    }
  })

  /**
   * POST /api/projects/:id/sync/commit-config
   * Commit project configuration changes (.opencode/ directory)
   * 
   * This endpoint triggers OpenCode to commit and optionally push any changes
   * made to the project's .opencode/ configuration directory.
   * 
   * Body:
   *   - message: Optional custom commit message (default: "Update OpenCode configuration")
   *   - push: Whether to push after committing (default: true)
   */
  .post('/:id/sync/commit-config', zValidator('json', commitConfigSchema.optional()), async (c) => {
    const id = c.req.param('id');
    const project = getProjectById(id);
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    if (project.status !== 'running') {
      return c.json({ 
        error: 'Project container must be running to commit configuration changes' 
      }, 400);
    }
    
    // Parse optional body
    let commitMessage = 'Update OpenCode configuration';
    let shouldPush = true;
    try {
      const body = await c.req.json();
      if (body?.message) {
        commitMessage = body.message;
      }
      if (typeof body?.push === 'boolean') {
        shouldPush = body.push;
      }
    } catch {
      // No body provided, use defaults
    }
    
    log.info('Committing project config', { projectId: id, message: commitMessage, push: shouldPush });
    
    try {
      // Create a temporary session for the commit operation
      const session = await opencode.createSession(id, 'Config Commit');
      
      // Construct the prompt for OpenCode
      // We ask it to check for changes in .opencode/ and commit them
      const pushInstruction = shouldPush 
        ? 'After committing, push the changes to the remote repository.'
        : 'Do not push after committing.';
      
      const prompt = `Please check if there are any uncommitted changes in the .opencode/ directory. If there are changes:

1. Stage all changes in .opencode/ using: git add .opencode/
2. Commit with the message: "${commitMessage}"
3. ${pushInstruction}

If there are no changes, just report that the configuration is already up to date.

Important: Only commit files in the .opencode/ directory, do not commit other project files.`;

      // Send the message and wait for response
      const result = await opencode.sendMessage(id, session.id, {
        parts: [{ type: 'text', text: prompt }],
      });
      
      // Extract the response text from the message parts
      let responseText = '';
      for (const part of result.parts) {
        if ('text' in part && part.text) {
          responseText += part.text;
        }
      }
      
      log.info('Config commit completed', { projectId: id, sessionId: session.id });
      
      // Clean up the temporary session
      try {
        await opencode.deleteSession(id, session.id);
      } catch (deleteError) {
        log.warn('Failed to delete temporary session', { sessionId: session.id, error: deleteError });
      }
      
      return c.json({
        success: true,
        message: 'Configuration commit initiated',
        details: responseText,
        sessionId: session.id,
      });
    } catch (error) {
      log.error('Config commit failed', { projectId: id, error });
      
      return c.json({
        success: false,
        error: `Config commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }, 500);
    }
  });
