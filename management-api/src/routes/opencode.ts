/**
 * OpenCode Proxy Routes
 * 
 * Proxies requests to OpenCode containers running on Coolify.
 * All routes are under /api/projects/:id/opencode/*
 */

import { Hono } from 'hono';
import { opencode, OpenCodeProxyError } from '../services/opencode.ts';
import { getProjectById } from '../models/project.ts';
import { coolify } from '../services/coolify.ts';
import { config } from '../config.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('opencode-routes');

export const opencodeRoutes = new Hono()

  // ===========================================================================
  // App Info / Health
  // ===========================================================================

  /**
   * GET /api/projects/:id/opencode/app
   * Get OpenCode app info (health check)
   */
  .get('/:id/opencode/app', async (c) => {
    const projectId = c.req.param('id');
    
    try {
      const info = await opencode.getAppInfo(projectId);
      return c.json(info);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to get OpenCode app info', { projectId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  // ===========================================================================
  // Sessions
  // ===========================================================================

  /**
   * GET /api/projects/:id/opencode/session
   * List all sessions
   */
  .get('/:id/opencode/session', async (c) => {
    const projectId = c.req.param('id');
    
    try {
      const sessions = await opencode.listSessions(projectId);
      return c.json(sessions);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to list sessions', { projectId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  /**
   * POST /api/projects/:id/opencode/session
   * Create a new session
   */
  .post('/:id/opencode/session', async (c) => {
    const projectId = c.req.param('id');
    
    try {
      const session = await opencode.createSession(projectId);
      return c.json(session, 201);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to create session', { projectId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  /**
   * GET /api/projects/:id/opencode/session/:sessionId
   * Get session details
   */
  .get('/:id/opencode/session/:sessionId', async (c) => {
    const projectId = c.req.param('id');
    const sessionId = c.req.param('sessionId');
    
    try {
      const session = await opencode.getSession(projectId, sessionId);
      return c.json(session);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to get session', { projectId, sessionId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  /**
   * DELETE /api/projects/:id/opencode/session/:sessionId
   * Delete a session
   */
  .delete('/:id/opencode/session/:sessionId', async (c) => {
    const projectId = c.req.param('id');
    const sessionId = c.req.param('sessionId');
    
    try {
      await opencode.deleteSession(projectId, sessionId);
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to delete session', { projectId, sessionId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  /**
   * POST /api/projects/:id/opencode/session/:sessionId/abort
   * Abort a running session
   */
  .post('/:id/opencode/session/:sessionId/abort', async (c) => {
    const projectId = c.req.param('id');
    const sessionId = c.req.param('sessionId');
    
    try {
      await opencode.abortSession(projectId, sessionId);
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to abort session', { projectId, sessionId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  // ===========================================================================
  // Messages
  // ===========================================================================

  /**
   * GET /api/projects/:id/opencode/session/:sessionId/message
   * List messages in a session
   */
  .get('/:id/opencode/session/:sessionId/message', async (c) => {
    const projectId = c.req.param('id');
    const sessionId = c.req.param('sessionId');
    
    try {
      const messages = await opencode.listMessages(projectId, sessionId);
      return c.json(messages);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to list messages', { projectId, sessionId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  /**
   * POST /api/projects/:id/opencode/session/:sessionId/message
   * Send a message to a session
   */
  .post('/:id/opencode/session/:sessionId/message', async (c) => {
    const projectId = c.req.param('id');
    const sessionId = c.req.param('sessionId');
    
    try {
      const body = await c.req.json();
      const message = await opencode.sendMessage(projectId, sessionId, body);
      return c.json(message, 201);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to send message', { projectId, sessionId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  /**
   * GET /api/projects/:id/opencode/session/:sessionId/message/:messageId
   * Get a specific message
   */
  .get('/:id/opencode/session/:sessionId/message/:messageId', async (c) => {
    const projectId = c.req.param('id');
    const sessionId = c.req.param('sessionId');
    const messageId = c.req.param('messageId');
    
    try {
      const message = await opencode.getMessage(projectId, sessionId, messageId);
      return c.json(message);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to get message', { projectId, sessionId, messageId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  // ===========================================================================
  // Files
  // ===========================================================================

  /**
   * GET /api/projects/:id/opencode/file
   * List files in the project
   * Query param: path (optional, defaults to "/")
   */
  .get('/:id/opencode/file', async (c) => {
    const projectId = c.req.param('id');
    const path = c.req.query('path') || '/';
    
    try {
      const files = await opencode.listFiles(projectId, path);
      return c.json(files);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to list files', { projectId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  /**
   * GET /api/projects/:id/opencode/file/content
   * Get file content
   * Query param: path (required)
   */
  .get('/:id/opencode/file/content', async (c) => {
    const projectId = c.req.param('id');
    const filePath = c.req.query('path');
    
    if (!filePath) {
      return c.json({ error: 'Missing required query parameter: path' }, 400);
    }
    
    try {
      const content = await opencode.getFileContent(projectId, filePath);
      return c.json(content);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to get file content', { projectId, filePath, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  /**
   * GET /api/projects/:id/opencode/find/file
   * Find files by query
   * Query param: query (required)
   */
  .get('/:id/opencode/find/file', async (c) => {
    const projectId = c.req.param('id');
    const query = c.req.query('query');
    
    if (!query) {
      return c.json({ error: 'Missing required query parameter: query' }, 400);
    }
    
    try {
      const files = await opencode.findFiles(projectId, query);
      return c.json(files);
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to find files', { projectId, query, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  // ===========================================================================
  // SSE Events (Streaming)
  // ===========================================================================

  /**
   * GET /api/projects/:id/opencode/event
   * Proxy SSE event stream from OpenCode container
   * 
   * This endpoint streams Server-Sent Events from the OpenCode container.
   * Events include: session.updated, message.part.updated, tool.execute, etc.
   * 
   * Uses the OpenCode SDK to subscribe to events and forwards them to the client.
   */
  .get('/:id/opencode/event', async (c) => {
    const projectId = c.req.param('id');
    
    try {
      log.info('Starting SSE proxy via SDK', { projectId });
      
      // Get the async iterator of events from the SDK
      const eventIterator = await opencode.subscribeToEvents(projectId);
      const encoder = new TextEncoder();
      
      // Create a ReadableStream that forwards SDK events as SSE
      const stream = new ReadableStream({
        start(controller) {
          // Send initial connection comment immediately
          controller.enqueue(encoder.encode(': connected\n\n'));
          
          // Spawn async loop to process events (don't await - this runs in background)
          (async () => {
            try {
              // Iterate over SDK events and forward them
              for await (const event of eventIterator) {
                const eventType = event.type || 'message';
                const eventData = JSON.stringify(event);
                const sseMessage = `event: ${eventType}\ndata: ${eventData}\n\n`;
                controller.enqueue(encoder.encode(sseMessage));
              }
            } catch (err) {
              log.error('SSE stream error', { projectId, error: err });
              // Send error event before closing
              const errorEvent = `event: error\ndata: ${JSON.stringify({ message: 'Stream error' })}\n\n`;
              controller.enqueue(encoder.encode(errorEvent));
            } finally {
              controller.close();
            }
          })();
        },
        cancel() {
          log.info('SSE client disconnected', { projectId });
          // The async iterator will be garbage collected
        }
      });
      
      log.info('SSE connection established via SDK', { projectId });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
      });
      
    } catch (error) {
      if (error instanceof OpenCodeProxyError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode as 400);
      }
      log.error('Failed to start SSE proxy', { projectId, error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })

  // ===========================================================================
  // Health Check
  // ===========================================================================

  /**
   * GET /api/projects/:id/opencode/health
   * Check if OpenCode container is reachable
   */
  .get('/:id/opencode/health', async (c) => {
    const projectId = c.req.param('id');
    
    try {
      const healthy = await opencode.healthCheck(projectId);
      return c.json({ healthy, projectId });
    } catch (error) {
      return c.json({ healthy: false, projectId, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
