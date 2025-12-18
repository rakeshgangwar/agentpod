/**
 * ACP Gateway Server
 * 
 * HTTP server for orchestrating multiple AI coding agents via the Agent Client Protocol.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';

import type { AgentId, ApiResponse, GatewayEvent } from './types.ts';
import { agentRegistry } from './agent-registry.ts';
import { agentManager } from './agent-manager.ts';
import { sessionManager } from './session-manager.ts';
import { eventEmitter } from './event-emitter.ts';
import { authHandler } from './auth-handler.ts';

// Configuration
const PORT = parseInt(process.env.ACP_GATEWAY_PORT || '4097');
const WORKING_DIRECTORY = process.env.WORKSPACE_DIR || '/home/workspace';

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*', // Container-local access
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// =============================================================================
// Health Routes
// =============================================================================

app.get('/health', (c) => {
  return c.json<ApiResponse>({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

app.get('/info', (c) => {
  return c.json<ApiResponse>({
    success: true,
    data: {
      name: 'ACP Gateway',
      version: '0.1.0',
      workingDirectory: WORKING_DIRECTORY,
      runningAgents: agentManager.getRunningAgentCount(),
      activeSessions: sessionManager.getActiveSessionCount(),
      connectedClients: eventEmitter.getClientCount(),
    },
  });
});

// =============================================================================
// Agent Routes
// =============================================================================

app.get('/agents', (c) => {
  const agents = agentRegistry.getAgents().map(config => {
    const status = agentManager.getAgentStatus(config.id);
    return {
      id: config.id,
      name: config.name,
      description: config.description,
      requiresAuth: config.requiresAuth,
      status: status?.status || 'stopped',
      authenticated: authHandler.isAuthenticated(config.id),
    };
  });

  return c.json<ApiResponse>({
    success: true,
    data: { agents },
  });
});

app.post('/agents/:id/spawn', async (c) => {
  const agentId = c.req.param('id') as AgentId;
  
  if (!agentRegistry.hasAgent(agentId)) {
    return c.json<ApiResponse>({
      success: false,
      error: `Unknown agent: ${agentId}`,
    }, 404);
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const connection = await agentManager.spawnAgent(
      agentId,
      body.env,
      body.workingDirectory || WORKING_DIRECTORY
    );

    return c.json<ApiResponse>({
      success: true,
      data: {
        id: connection.id,
        status: connection.status,
        startedAt: connection.startedAt?.toISOString(),
      },
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

app.post('/agents/:id/stop', async (c) => {
  const agentId = c.req.param('id') as AgentId;

  try {
    await agentManager.stopAgent(agentId);
    
    return c.json<ApiResponse>({
      success: true,
      data: { id: agentId, status: 'stopped' },
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

app.get('/agents/:id/status', (c) => {
  const agentId = c.req.param('id') as AgentId;
  const connection = agentManager.getAgentStatus(agentId);

  if (!connection) {
    return c.json<ApiResponse>({
      success: true,
      data: {
        id: agentId,
        status: 'stopped',
        startedAt: null,
        lastActivity: null,
        sessionCount: 0,
        error: null,
      },
    });
  }

  return c.json<ApiResponse>({
    success: true,
    data: {
      id: connection.id,
      status: connection.status,
      startedAt: connection.startedAt?.toISOString() || null,
      lastActivity: connection.lastActivity?.toISOString() || null,
      sessionCount: connection.sessionCount,
      error: connection.error,
    },
  });
});

// =============================================================================
// Auth Routes
// =============================================================================

app.post('/agents/:id/auth/init', async (c) => {
  const agentId = c.req.param('id') as AgentId;

  if (!agentRegistry.hasAgent(agentId)) {
    return c.json<ApiResponse>({
      success: false,
      error: `Unknown agent: ${agentId}`,
    }, 404);
  }

  const result = await authHandler.initializeAuth(agentId);

  return c.json<ApiResponse>({
    success: true,
    data: result,
  });
});

app.get('/agents/:id/auth/status', (c) => {
  const agentId = c.req.param('id') as AgentId;

  const status = authHandler.getAuthStatus(agentId);

  return c.json<ApiResponse>({
    success: true,
    data: status,
  });
});

app.post('/agents/:id/auth/token', async (c) => {
  const agentId = c.req.param('id') as AgentId;

  try {
    const body = await c.req.json();
    const { token, expiresIn } = body;

    if (!token) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Token is required',
      }, 400);
    }

    authHandler.setToken(agentId, token, expiresIn);
    authHandler.handleAuthComplete(agentId, token);

    return c.json<ApiResponse>({
      success: true,
      data: { authenticated: true },
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

// =============================================================================
// Session Routes
// =============================================================================

app.post('/session', async (c) => {
  try {
    const body = await c.req.json();
    const { agentId, workingDirectory } = body;

    if (!agentId || !agentRegistry.hasAgent(agentId)) {
      return c.json<ApiResponse>({
        success: false,
        error: `Unknown agent: ${agentId}`,
      }, 400);
    }

    // Ensure agent is running
    if (!agentManager.isAgentRunning(agentId)) {
      await agentManager.spawnAgent(agentId, undefined, workingDirectory || WORKING_DIRECTORY);
    }

    const client = agentManager.getClient(agentId);
    if (!client) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Agent client not available',
      }, 500);
    }

    // Create ACP session
    const acpResult = await client.newSession(workingDirectory || WORKING_DIRECTORY);

    // Create local session record
    const session = sessionManager.createSession(
      { agentId, workingDirectory: workingDirectory || WORKING_DIRECTORY },
      acpResult.sessionId
    );

    // Update agent session count
    agentManager.updateSessionCount(agentId);

    return c.json<ApiResponse>({
      success: true,
      data: {
        id: session.id,
        agentId: session.agentId,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

app.get('/session/:id', (c) => {
  const sessionId = c.req.param('id');
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  return c.json<ApiResponse>({
    success: true,
    data: {
      id: session.id,
      agentId: session.agentId,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      messageCount: session.messageCount,
    },
  });
});

app.delete('/session/:id', async (c) => {
  const sessionId = c.req.param('id');
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  sessionManager.endSession(sessionId, 'complete');
  agentManager.updateSessionCount(session.agentId);

  return c.json<ApiResponse>({
    success: true,
    data: { id: sessionId, status: 'ended' },
  });
});

app.post('/session/:id/prompt', async (c) => {
  const sessionId = c.req.param('id');
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  try {
    const body = await c.req.json();
    const { prompt } = body;

    if (!prompt) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Prompt is required',
      }, 400);
    }

    const client = agentManager.getClient(session.agentId);
    if (!client) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Agent client not available',
      }, 500);
    }

    // Update session status
    sessionManager.setStatus(sessionId, 'processing');
    sessionManager.incrementMessageCount(sessionId);

    // Send prompt to agent
    await client.promptText(session.acpSessionId, prompt);

    return c.json<ApiResponse>({
      success: true,
      data: { id: sessionId, status: 'processing' },
    });
  } catch (error) {
    sessionManager.setStatus(sessionId, 'idle');
    return c.json<ApiResponse>({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

app.post('/session/:id/cancel', async (c) => {
  const sessionId = c.req.param('id');
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  try {
    const client = agentManager.getClient(session.agentId);
    if (client) {
      await client.cancel(session.acpSessionId);
    }

    sessionManager.setStatus(sessionId, 'idle');

    return c.json<ApiResponse>({
      success: true,
      data: { id: sessionId, status: 'idle' },
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

// =============================================================================
// Event Routes (SSE)
// =============================================================================

app.get('/events', async (c) => {
  return streamSSE(c, async (stream) => {
    const clientId = eventEmitter.addClient((event: GatewayEvent) => {
      stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: 'ping' });
    }, 30000);

    // Handle disconnect
    stream.onAbort(() => {
      clearInterval(keepAlive);
      eventEmitter.removeClient(clientId);
    });

    // Wait indefinitely
    await new Promise(() => {});
  });
});

app.get('/events/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  return streamSSE(c, async (stream) => {
    const clientId = eventEmitter.addClient((event: GatewayEvent) => {
      stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    }, sessionId);

    const keepAlive = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: 'ping' });
    }, 30000);

    stream.onAbort(() => {
      clearInterval(keepAlive);
      eventEmitter.removeClient(clientId);
    });

    await new Promise(() => {});
  });
});

// =============================================================================
// Permission Routes
// =============================================================================

app.post('/permission/:id', async (c) => {
  const permissionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { granted } = body;

    // TODO: Implement permission response handling
    // This would need to be connected to pending permission requests
    console.log(`[ACP Gateway] Permission ${permissionId} ${granted ? 'granted' : 'denied'}`);

    return c.json<ApiResponse>({
      success: true,
      data: { id: permissionId, granted },
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

// =============================================================================
// Sessions List Route
// =============================================================================

app.get('/sessions', (c) => {
  const sessions = sessionManager.getAllSessions().map(session => ({
    id: session.id,
    agentId: session.agentId,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    lastActivity: session.lastActivity.toISOString(),
    messageCount: session.messageCount,
  }));

  return c.json<ApiResponse>({
    success: true,
    data: { sessions },
  });
});

// =============================================================================
// Startup
// =============================================================================

// Cleanup on shutdown
process.on('SIGINT', async () => {
  console.log('\n[ACP Gateway] Shutting down...');
  await agentManager.shutdownAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[ACP Gateway] Shutting down...');
  await agentManager.shutdownAll();
  process.exit(0);
});

// Start session cleanup interval
setInterval(() => {
  sessionManager.cleanupStaleSessions();
}, 300000); // Every 5 minutes

// Start server
console.log(`[ACP Gateway] Starting on port ${PORT}`);
console.log(`[ACP Gateway] Working directory: ${WORKING_DIRECTORY}`);
console.log(`[ACP Gateway] Available agents: ${agentRegistry.getAgents().map(a => a.id).join(', ')}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
