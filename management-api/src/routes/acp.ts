/**
 * ACP Routes
 * 
 * API routes for multi-agent ACP Gateway integration.
 * Proxies requests to ACP Gateway and manages session persistence.
 */

import { Hono } from 'hono';
import { getProjectById } from '../models/project.ts';
import { 
  type AgentId,
  saveAgentAuthToken,
  deleteAgentAuthToken,
  isAgentAuthenticated,
  listAgentAuthTokens,
} from '../models/agent-auth.ts';
import {
  createAgentSession,
  getAgentSession,
  getProjectSessions,
  updateAgentSession,
  endAgentSession,
  addSessionMessage,
  getSessionMessages,
} from '../models/agent-session.ts';
import * as gateway from '../services/acp-gateway.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('acp-routes');

// For now, use a default user ID (single-user system)
// This will be replaced with proper auth later
const DEFAULT_USER_ID = 'default-user';

export const acpRoutes = new Hono()

  // ==========================================================================
  // Agent Routes
  // ==========================================================================

  /**
   * GET /:projectId/acp/agents
   * List all agents with their status
   */
  .get('/:projectId/acp/agents', async (c) => {
    const projectId = c.req.param('projectId');
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    // Get agents from gateway
    const result = await gateway.listAgents(projectId);
    
    if (!result.success) {
      return c.json(result, 500);
    }
    
    // Enhance with local auth status
    const agents = await Promise.all(
      (result.data?.agents || []).map(async (agent) => ({
        ...agent,
        authenticated: agent.requiresAuth 
          ? await isAgentAuthenticated(DEFAULT_USER_ID, agent.id as AgentId)
          : true,
      }))
    );
    
    return c.json({
      success: true,
      data: { 
        agents,
        defaultAgentId: project.llmProvider || 'opencode', // Use llmProvider as default for now
      },
    });
  })

  /**
   * POST /:projectId/acp/agents/:agentId/spawn
   * Spawn an agent in the container
   */
  .post('/:projectId/acp/agents/:agentId/spawn', async (c) => {
    const projectId = c.req.param('projectId');
    const agentId = c.req.param('agentId') as AgentId;
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    const result = await gateway.spawnAgent(projectId, agentId, DEFAULT_USER_ID);
    
    return c.json(result, result.success ? 200 : 500);
  })

  /**
   * POST /:projectId/acp/agents/:agentId/stop
   * Stop a running agent
   */
  .post('/:projectId/acp/agents/:agentId/stop', async (c) => {
    const projectId = c.req.param('projectId');
    const agentId = c.req.param('agentId') as AgentId;
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    const result = await gateway.stopAgent(projectId, agentId);
    
    return c.json(result, result.success ? 200 : 500);
  })

  /**
   * GET /:projectId/acp/agents/:agentId/status
   * Get agent status
   */
  .get('/:projectId/acp/agents/:agentId/status', async (c) => {
    const projectId = c.req.param('projectId');
    const agentId = c.req.param('agentId') as AgentId;
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    const result = await gateway.getAgentStatus(projectId, agentId);
    
    return c.json(result, result.success ? 200 : 500);
  })

  // ==========================================================================
  // Auth Routes
  // ==========================================================================

  /**
   * POST /:projectId/acp/agents/:agentId/auth/start
   * Start OAuth flow for an agent
   */
  .post('/:projectId/acp/agents/:agentId/auth/start', async (c) => {
    const projectId = c.req.param('projectId');
    const agentId = c.req.param('agentId') as AgentId;
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    // Check if already authenticated
    const isAuth = await isAgentAuthenticated(DEFAULT_USER_ID, agentId);
    if (isAuth) {
      return c.json({
        success: true,
        data: { authenticated: true, message: 'Already authenticated' },
      });
    }
    
    // Initialize auth in gateway
    const result = await gateway.initAgentAuth(projectId, agentId);
    
    return c.json(result, result.success ? 200 : 500);
  })

  /**
   * GET /:projectId/acp/agents/:agentId/auth/status
   * Get auth status for an agent
   */
  .get('/:projectId/acp/agents/:agentId/auth/status', async (c) => {
    const projectId = c.req.param('projectId');
    const agentId = c.req.param('agentId') as AgentId;
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    // Check local auth status first
    const localAuth = await isAgentAuthenticated(DEFAULT_USER_ID, agentId);
    
    // Also check gateway status
    const gatewayAuth = await gateway.getAgentAuthStatus(projectId, agentId);
    
    return c.json({
      success: true,
      data: {
        authenticated: localAuth || gatewayAuth.data?.authenticated || false,
        hasStoredToken: localAuth,
        expiresAt: gatewayAuth.data?.expiresAt,
      },
    });
  })

  /**
   * POST /:projectId/acp/agents/:agentId/auth/callback
   * Handle OAuth callback - store token
   */
  .post('/:projectId/acp/agents/:agentId/auth/callback', async (c) => {
    const projectId = c.req.param('projectId');
    const agentId = c.req.param('agentId') as AgentId;
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    try {
      const body = await c.req.json();
      const { accessToken, refreshToken, expiresIn, scopes } = body;
      
      if (!accessToken) {
        return c.json({ success: false, error: 'Access token is required' }, 400);
      }
      
      // Calculate expiration
      const expiresAt = expiresIn 
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : undefined;
      
      // Save token locally (encrypted)
      await saveAgentAuthToken({
        userId: DEFAULT_USER_ID,
        agentId,
        accessToken,
        refreshToken,
        expiresAt,
        scopes,
      });
      
      // Also set in gateway
      await gateway.setAgentAuthToken(projectId, agentId, accessToken, expiresIn);
      
      log.info('Agent auth token saved', { agentId, userId: DEFAULT_USER_ID });
      
      return c.json({
        success: true,
        data: { authenticated: true },
      });
    } catch (error) {
      log.error('Failed to save auth token', { error });
      return c.json({ success: false, error: 'Failed to save auth token' }, 500);
    }
  })

  /**
   * DELETE /:projectId/acp/agents/:agentId/auth
   * Revoke/clear auth for an agent
   */
  .delete('/:projectId/acp/agents/:agentId/auth', async (c) => {
    const projectId = c.req.param('projectId');
    const agentId = c.req.param('agentId') as AgentId;
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    // Delete local token
    deleteAgentAuthToken(DEFAULT_USER_ID, agentId);
    
    return c.json({
      success: true,
      data: { authenticated: false },
    });
  })

  /**
   * GET /:projectId/acp/auth/tokens
   * List all auth tokens for the user (metadata only, not actual tokens)
   */
  .get('/:projectId/acp/auth/tokens', (c) => {
    const tokens = listAgentAuthTokens(DEFAULT_USER_ID);
    
    return c.json({
      success: true,
      data: { tokens },
    });
  })

  // ==========================================================================
  // Session Routes
  // ==========================================================================

  /**
   * POST /:projectId/acp/session
   * Create a new session
   */
  .post('/:projectId/acp/session', async (c) => {
    const projectId = c.req.param('projectId');
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    try {
      const body = await c.req.json();
      const { agentId = 'opencode', workingDirectory } = body;
      
      // Check auth for agents that require it
      if (agentId !== 'opencode') {
        const isAuth = await isAgentAuthenticated(DEFAULT_USER_ID, agentId);
        if (!isAuth) {
          return c.json({
            success: false,
            error: `Agent ${agentId} requires authentication`,
            code: 'AUTH_REQUIRED',
          }, 401);
        }
      }
      
      // Create session in gateway
      const gatewayResult = await gateway.createGatewaySession(
        projectId,
        agentId,
        workingDirectory,
        DEFAULT_USER_ID
      );
      
      if (!gatewayResult.success || !gatewayResult.data) {
        return c.json(gatewayResult, 500);
      }
      
      // Persist session locally
      const session = createAgentSession({
        projectId,
        agentId,
        acpSessionId: gatewayResult.data.id,
        workingDirectory: workingDirectory || '/workspace',
      });
      
      log.info('Session created', { sessionId: session.id, agentId, projectId });
      
      return c.json({
        success: true,
        data: {
          id: session.id,
          agentId: session.agentId,
          status: session.status,
          createdAt: session.createdAt,
          acpSessionId: session.acpSessionId,
        },
      });
    } catch (error) {
      log.error('Failed to create session', { error });
      return c.json({ success: false, error: 'Failed to create session' }, 500);
    }
  })

  /**
   * GET /:projectId/acp/session
   * List all sessions for a project
   */
  .get('/:projectId/acp/session', (c) => {
    const projectId = c.req.param('projectId');
    const includeEnded = c.req.query('includeEnded') === 'true';
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    const sessions = getProjectSessions(projectId, includeEnded);
    
    return c.json({
      success: true,
      data: {
        sessions: sessions.map(s => ({
          id: s.id,
          agentId: s.agentId,
          status: s.status,
          messageCount: s.messageCount,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      },
    });
  })

  /**
   * GET /:projectId/acp/session/:sessionId
   * Get a specific session
   */
  .get('/:projectId/acp/session/:sessionId', async (c) => {
    const projectId = c.req.param('projectId');
    const sessionId = c.req.param('sessionId');
    
    const session = getAgentSession(sessionId);
    if (!session || session.projectId !== projectId) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }
    
    // Get messages
    const messages = getSessionMessages(sessionId);
    
    return c.json({
      success: true,
      data: {
        id: session.id,
        agentId: session.agentId,
        status: session.status,
        messageCount: session.messageCount,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolName: m.toolName,
          createdAt: m.createdAt,
        })),
      },
    });
  })

  /**
   * DELETE /:projectId/acp/session/:sessionId
   * End a session
   */
  .delete('/:projectId/acp/session/:sessionId', async (c) => {
    const projectId = c.req.param('projectId');
    const sessionId = c.req.param('sessionId');
    
    const session = getAgentSession(sessionId);
    if (!session || session.projectId !== projectId) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }
    
    // End in gateway
    await gateway.endGatewaySession(projectId, session.acpSessionId);
    
    // End locally
    endAgentSession(sessionId);
    
    return c.json({
      success: true,
      data: { id: sessionId, status: 'ended' },
    });
  })

  /**
   * POST /:projectId/acp/session/:sessionId/prompt
   * Send a prompt to a session
   */
  .post('/:projectId/acp/session/:sessionId/prompt', async (c) => {
    const projectId = c.req.param('projectId');
    const sessionId = c.req.param('sessionId');
    
    const session = getAgentSession(sessionId);
    if (!session || session.projectId !== projectId) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }
    
    if (session.status === 'ended') {
      return c.json({ success: false, error: 'Session has ended' }, 400);
    }
    
    try {
      const body = await c.req.json();
      const { prompt } = body;
      
      if (!prompt) {
        return c.json({ success: false, error: 'Prompt is required' }, 400);
      }
      
      // Store user message
      addSessionMessage({
        sessionId,
        role: 'user',
        content: prompt,
      });
      
      // Update session status
      updateAgentSession(sessionId, { status: 'processing' });
      
      // Send to gateway
      const result = await gateway.sendPrompt(projectId, session.acpSessionId, prompt);
      
      if (!result.success) {
        updateAgentSession(sessionId, { status: 'error' });
        return c.json(result, 500);
      }
      
      return c.json({
        success: true,
        data: { id: sessionId, status: 'processing' },
      });
    } catch (error) {
      log.error('Failed to send prompt', { error });
      updateAgentSession(sessionId, { status: 'error' });
      return c.json({ success: false, error: 'Failed to send prompt' }, 500);
    }
  })

  /**
   * POST /:projectId/acp/session/:sessionId/cancel
   * Cancel an active operation
   */
  .post('/:projectId/acp/session/:sessionId/cancel', async (c) => {
    const projectId = c.req.param('projectId');
    const sessionId = c.req.param('sessionId');
    
    const session = getAgentSession(sessionId);
    if (!session || session.projectId !== projectId) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }
    
    // Cancel in gateway
    const result = await gateway.cancelSession(projectId, session.acpSessionId);
    
    // Update local status
    updateAgentSession(sessionId, { status: 'idle' });
    
    return c.json(result);
  })

  // ==========================================================================
  // Event Routes (SSE)
  // ==========================================================================

  /**
   * GET /:projectId/acp/events
   * Global SSE event stream for a project
   */
  .get('/:projectId/acp/events', async (c) => {
    const projectId = c.req.param('projectId');
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    const eventStream = await gateway.createEventStream(projectId);
    
    if (!eventStream) {
      return c.json({ success: false, error: 'Could not create event stream' }, 500);
    }
    
    // Proxy the SSE stream
    return new Response(eventStream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  })

  /**
   * GET /:projectId/acp/events/:sessionId
   * Session-specific SSE event stream
   */
  .get('/:projectId/acp/events/:sessionId', async (c) => {
    const projectId = c.req.param('projectId');
    const sessionId = c.req.param('sessionId');
    
    const session = getAgentSession(sessionId);
    if (!session || session.projectId !== projectId) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }
    
    const eventStream = await gateway.createEventStream(projectId, session.acpSessionId);
    
    if (!eventStream) {
      return c.json({ success: false, error: 'Could not create event stream' }, 500);
    }
    
    // Proxy the SSE stream
    return new Response(eventStream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  })

  // ==========================================================================
  // Permission Routes
  // ==========================================================================

  /**
   * POST /:projectId/acp/permission/:permissionId
   * Respond to a permission request
   */
  .post('/:projectId/acp/permission/:permissionId', async (c) => {
    const projectId = c.req.param('projectId');
    const permissionId = c.req.param('permissionId');
    
    const project = getProjectById(projectId);
    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }
    
    try {
      const body = await c.req.json();
      const { granted } = body;
      
      if (typeof granted !== 'boolean') {
        return c.json({ success: false, error: 'granted (boolean) is required' }, 400);
      }
      
      const result = await gateway.respondToPermission(projectId, permissionId, granted);
      
      return c.json(result);
    } catch (error) {
      return c.json({ success: false, error: 'Failed to respond to permission' }, 500);
    }
  })

  // ==========================================================================
  // Gateway Info Routes
  // ==========================================================================

  /**
   * GET /:projectId/acp/health
   * Check ACP Gateway health
   */
  .get('/:projectId/acp/health', async (c) => {
    const projectId = c.req.param('projectId');
    
    const healthy = await gateway.checkGatewayHealth(projectId);
    
    return c.json({
      success: true,
      data: { healthy },
    });
  })

  /**
   * GET /:projectId/acp/info
   * Get ACP Gateway info
   */
  .get('/:projectId/acp/info', async (c) => {
    const projectId = c.req.param('projectId');
    
    const result = await gateway.getGatewayInfo(projectId);
    
    return c.json(result);
  });
