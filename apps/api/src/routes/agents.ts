/**
 * Agent Routes
 * 
 * Manage AI Assistants (agent harnesses) and Agent Modes.
 * Proxies requests to the ACP Gateway running in sandbox containers.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createLogger } from '../utils/logger.ts';
import { isProviderConfigured } from '../models/provider-credentials.ts';
import type {
  AgentId,
  AgentConfig,
  AgentInstance,
  AgentMode,
  AgentListResponse,
  AgentModesResponse,
  AgentAuthInitResponse,
  AgentSpawnResponse,
} from '@agentpod/types';

const log = createLogger('agent-routes');

// =============================================================================
// Types (for internal use)
// =============================================================================

// ACP Gateway URL (within container network)
const ACP_GATEWAY_PORT = 4097;

// Helper to get ACP Gateway URL for a sandbox
function getAcpGatewayUrl(_sandboxId: string): string {
  // In production, this would resolve to the container's internal IP
  // For now, we'll use localhost for local development
  return `http://localhost:${ACP_GATEWAY_PORT}`;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const customAgentSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  requiresAuth: z.boolean().optional(),
  authType: z.enum(['none', 'oauth', 'device_flow', 'api_key', 'pkce_oauth']).optional(),
  authFlowType: z.enum(['code_first', 'url_first', 'pkce_oauth']).optional(),
  authProvider: z.string().optional(),
  authUrl: z.string().url().optional(),
  envVars: z.record(z.string()).optional(),
});

const authCompleteSchema = z.object({
  code: z.string().optional(),
  token: z.string().optional(),
}).refine(data => data.code || data.token, {
  message: 'Either code or token must be provided',
});

const spawnAgentSchema = z.object({
  env: z.record(z.string()).optional(),
  workingDirectory: z.string().optional(),
});

const setDefaultSchema = z.object({
  agentId: z.string().min(1),
});

// =============================================================================
// Built-in Agents (same as ACP Gateway - for when gateway is not available)
// =============================================================================

const BUILTIN_AGENTS: AgentConfig[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open-source AI coding assistant by SST. Default agent with no authentication required.',
    command: 'opencode',
    args: ['acp'],
    requiresAuth: false,
    authType: 'none',
    isBuiltIn: true,
    isDefault: true,
    icon: '🤖',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic\'s Claude AI coding assistant. Requires Claude Pro/Max subscription or API key.',
    command: 'claude-code-acp',
    args: [],
    requiresAuth: true,
    authType: 'pkce_oauth',
    authFlowType: 'pkce_oauth',
    authProvider: 'anthropic',
    // authUrl is dynamically set based on mode (max or console)
    isBuiltIn: true,
    isDefault: false,
    icon: '🧠',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Google\'s Gemini AI coding assistant. Requires Google account authentication.',
    command: 'gemini',
    args: ['--experimental-acp'],
    requiresAuth: true,
    authType: 'device_flow',
    authFlowType: 'code_first',
    authProvider: 'google',
    isBuiltIn: true,
    isDefault: false,
    icon: '💎',
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI\'s Codex coding assistant.',
    command: 'codex-acp',
    args: [],
    requiresAuth: true,
    authType: 'api_key',
    authProvider: 'openai',
    authUrl: 'https://platform.openai.com/api-keys',
    isBuiltIn: true,
    isDefault: false,
    icon: '🔮',
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Proxy a request to the ACP Gateway
 * Note: Currently unused - will be enabled when integrating with sandbox containers
 */
async function _proxyToGateway<T>(
  sandboxId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${getAcpGatewayUrl(sandboxId)}${path}`;
  
  log.debug('Proxying to ACP Gateway', { sandboxId, method, path });
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ACP Gateway error: ${response.status} - ${error}`);
  }
  
  return response.json() as Promise<T>;
}

/**
 * Check if an agent's auth provider has credentials configured
 */
function isAgentAuthenticated(config: AgentConfig): boolean {
  if (!config.requiresAuth) {
    return true;
  }
  if (config.authProvider) {
    return isProviderConfigured(config.authProvider);
  }
  return false;
}

/**
 * Convert config to instance (for when gateway is not running)
 */
function configToInstance(config: AgentConfig, authenticated?: boolean): AgentInstance {
  return {
    id: config.id,
    config,
    status: 'stopped',
    authenticated: authenticated ?? isAgentAuthenticated(config),
    startedAt: null,
    lastActivity: null,
    error: null,
    sessionCount: 0,
  };
}

// =============================================================================
// Routes
// =============================================================================

export const agentRoutes = new Hono()
  /**
   * GET /api/agents
   * List all available AI Assistants
   */
  .get('/', async (c) => {
    try {
      // Try to get agents from ACP Gateway
      // If gateway is not running, return built-in list
      const assistants = BUILTIN_AGENTS.map(config => configToInstance(config));
      const defaultAssistantId = 'opencode';
      
      const response: AgentListResponse = {
        assistants,
        defaultAssistantId,
      };
      
      return c.json(response);
    } catch (error) {
      log.error('Failed to list agents', { error });
      return c.json({ error: 'Failed to list agents' }, 500);
    }
  })

  /**
   * GET /api/agents/:id
   * Get a specific AI Assistant
   */
  .get('/:id', async (c) => {
    const id = c.req.param('id') as AgentId;
    
    try {
      const config = BUILTIN_AGENTS.find(a => a.id === id);
      
      if (!config) {
        return c.json({ error: `Agent not found: ${id}` }, 404);
      }
      
      return c.json(configToInstance(config));
    } catch (error) {
      log.error('Failed to get agent', { id, error });
      return c.json({ error: 'Failed to get agent' }, 500);
    }
  })

  /**
   * GET /api/agents/:id/modes
   * Get available Agent Modes for an AI Assistant
   */
  .get('/:id/modes', async (c) => {
    const id = c.req.param('id') as AgentId;
    
    try {
      // Default modes for all agents
      const defaultModes: AgentMode[] = [
        {
          id: 'default',
          name: 'Default',
          description: 'Standard coding assistant mode.',
          source: 'builtin',
          assistantId: 'all',
        },
      ];
      
      // OpenCode-specific modes
      if (id === 'opencode') {
        defaultModes.push(
          {
            id: 'opencode-coder',
            name: 'Coder',
            description: 'General coding assistant focused on implementation.',
            source: 'builtin',
            assistantId: 'opencode',
            opencodeAgentId: 'coder',
            icon: '💻',
          },
          {
            id: 'opencode-build',
            name: 'Build',
            description: 'Build and deployment focused assistant.',
            source: 'builtin',
            assistantId: 'opencode',
            opencodeAgentId: 'build',
            icon: '🔨',
          }
        );
      }
      
      const response: AgentModesResponse = {
        modes: defaultModes,
        defaultModeId: 'default',
      };
      
      return c.json(response);
    } catch (error) {
      log.error('Failed to get agent modes', { id, error });
      return c.json({ error: 'Failed to get agent modes' }, 500);
    }
  })

  /**
   * POST /api/agents/:id/spawn
   * Start an AI Assistant process (per-sandbox)
   */
  .post('/:id/spawn', zValidator('json', spawnAgentSchema.optional()), async (c) => {
    const id = c.req.param('id') as AgentId;
    const _body = c.req.valid('json') || {};
    
    try {
      const config = BUILTIN_AGENTS.find(a => a.id === id);
      
      if (!config) {
        return c.json({ error: `Agent not found: ${id}` }, 404);
      }
      
      // TODO: Proxy to ACP Gateway when running in sandbox context
      // For now, return a placeholder response
      const response: AgentSpawnResponse = {
        id,
        status: 'starting',
        startedAt: new Date().toISOString(),
      };
      
      log.info('Agent spawn requested', { agentId: id });
      
      return c.json(response);
    } catch (error) {
      log.error('Failed to spawn agent', { id, error });
      return c.json({ error: 'Failed to spawn agent' }, 500);
    }
  })

  /**
   * POST /api/agents/:id/stop
   * Stop an AI Assistant process
   */
  .post('/:id/stop', async (c) => {
    const id = c.req.param('id') as AgentId;
    
    try {
      // TODO: Proxy to ACP Gateway when running in sandbox context
      log.info('Agent stop requested', { agentId: id });
      
      return c.json({
        success: true,
        id,
        status: 'stopped',
      });
    } catch (error) {
      log.error('Failed to stop agent', { id, error });
      return c.json({ error: 'Failed to stop agent' }, 500);
    }
  })

  /**
   * GET /api/agents/:id/status
   * Get AI Assistant process status
   */
  .get('/:id/status', async (c) => {
    const id = c.req.param('id') as AgentId;
    
    try {
      const config = BUILTIN_AGENTS.find(a => a.id === id);
      
      if (!config) {
        return c.json({ error: `Agent not found: ${id}` }, 404);
      }
      
      // TODO: Proxy to ACP Gateway when running in sandbox context
      return c.json({
        id,
        status: 'stopped',
        startedAt: null,
        lastActivity: null,
        sessionCount: 0,
        error: null,
      });
    } catch (error) {
      log.error('Failed to get agent status', { id, error });
      return c.json({ error: 'Failed to get agent status' }, 500);
    }
  })

  // ===========================================================================
  // Authentication Endpoints
  // ===========================================================================

  /**
   * POST /api/agents/:id/auth
   * Initialize authentication for an AI Assistant
   */
  .post('/:id/auth', async (c) => {
    const id = c.req.param('id') as AgentId;
    
    try {
      const config = BUILTIN_AGENTS.find(a => a.id === id);
      
      if (!config) {
        return c.json({ error: `Agent not found: ${id}` }, 404);
      }
      
      if (!config.requiresAuth) {
        return c.json({
          flowType: 'none',
          expiresIn: 0,
          message: 'No authentication required',
        });
      }
      
      // Handle PKCE OAuth flow (Anthropic)
      if (config.authType === 'pkce_oauth' && config.authProvider === 'anthropic') {
        // Return info for frontend to show mode selector
        // The actual OAuth init happens via /api/providers/anthropic/oauth/init
        const response: AgentAuthInitResponse = {
          flowType: 'pkce_oauth',
          expiresIn: 600, // 10 minutes
          message: 'Choose authentication method for Claude Code',
        };
        
        log.info('Agent auth initialized (PKCE OAuth)', { agentId: id });
        
        return c.json(response);
      }
      
      // Return auth flow info based on config
      const response: AgentAuthInitResponse = {
        flowType: config.authFlowType || 'api_key',
        authUrl: config.authUrl,
        expiresIn: 600, // 10 minutes
        message: config.authType === 'api_key'
          ? `Enter your ${config.authProvider || 'API'} key`
          : `Sign in with ${config.authProvider || 'your account'}`,
      };
      
      // For code-first flow, generate a user code
      if (config.authFlowType === 'code_first') {
        response.userCode = generateUserCode();
        response.verificationUrl = config.authUrl;
      }
      
      log.info('Agent auth initialized', { agentId: id, flowType: response.flowType });
      
      return c.json(response);
    } catch (error) {
      log.error('Failed to init agent auth', { id, error });
      return c.json({ error: 'Failed to initialize authentication' }, 500);
    }
  })

  /**
   * POST /api/agents/:id/auth/complete
   * Complete authentication with code or token
   */
  .post('/:id/auth/complete', zValidator('json', authCompleteSchema), async (c) => {
    const id = c.req.param('id') as AgentId;
    const { code: _code, token: _token } = c.req.valid('json');
    
    try {
      const config = BUILTIN_AGENTS.find(a => a.id === id);
      
      if (!config) {
        return c.json({ error: `Agent not found: ${id}` }, 404);
      }
      
      // TODO: Actually validate and store the token
      // For now, just accept it
      
      log.info('Agent auth completed', { agentId: id });
      
      return c.json({
        success: true,
        message: 'Authentication successful',
      });
    } catch (error) {
      log.error('Failed to complete agent auth', { id, error });
      return c.json({ error: 'Authentication failed' }, 500);
    }
  })

  /**
   * GET /api/agents/:id/auth/status
   * Get authentication status for an AI Assistant
   */
  .get('/:id/auth/status', async (c) => {
    const id = c.req.param('id') as AgentId;
    
    try {
      const config = BUILTIN_AGENTS.find(a => a.id === id);
      
      if (!config) {
        return c.json({ error: `Agent not found: ${id}` }, 404);
      }
      
      if (!config.requiresAuth) {
        return c.json({
          authenticated: true,
          message: 'No authentication required',
        });
      }
      
      // Check if the provider has credentials configured
      // For agents like Claude Code, check if Anthropic provider is configured
      if (config.authProvider && isProviderConfigured(config.authProvider)) {
        return c.json({
          authenticated: true,
          message: `Authenticated via ${config.authProvider} provider`,
        });
      }
      
      return c.json({
        authenticated: false,
        expiresAt: null,
      });
    } catch (error) {
      log.error('Failed to get agent auth status', { id, error });
      return c.json({ error: 'Failed to get auth status' }, 500);
    }
  })

  /**
   * DELETE /api/agents/:id/auth
   * Sign out / clear authentication for an AI Assistant
   */
  .delete('/:id/auth', async (c) => {
    const id = c.req.param('id') as AgentId;
    
    try {
      // TODO: Clear auth from ACP Gateway
      
      log.info('Agent auth cleared', { agentId: id });
      
      return c.json({
        success: true,
        message: 'Signed out successfully',
      });
    } catch (error) {
      log.error('Failed to clear agent auth', { id, error });
      return c.json({ error: 'Failed to sign out' }, 500);
    }
  })

  // ===========================================================================
  // Custom Agent Management
  // ===========================================================================

  /**
   * POST /api/agents/custom
   * Add a custom AI Assistant
   */
  .post('/custom', zValidator('json', customAgentSchema), async (c) => {
    const agentConfig = c.req.valid('json');
    
    try {
      // Check if ID conflicts with built-in agents
      if (BUILTIN_AGENTS.some(a => a.id === agentConfig.id)) {
        return c.json({ error: `Agent ID '${agentConfig.id}' conflicts with built-in agent` }, 400);
      }
      
      // TODO: Save to database and sync to ACP Gateway
      
      const newAgent: AgentConfig = {
        id: agentConfig.id,
        name: agentConfig.name,
        description: agentConfig.description || 'Custom agent',
        command: agentConfig.command,
        args: agentConfig.args || [],
        requiresAuth: agentConfig.requiresAuth || false,
        authType: agentConfig.authType || 'none',
        authFlowType: agentConfig.authFlowType,
        authProvider: agentConfig.authProvider,
        authUrl: agentConfig.authUrl,
        envVars: agentConfig.envVars,
        isBuiltIn: false,
        isDefault: false,
      };
      
      log.info('Custom agent added', { agentId: newAgent.id });
      
      return c.json({
        success: true,
        agent: configToInstance(newAgent),
      });
    } catch (error) {
      log.error('Failed to add custom agent', { error });
      return c.json({ error: 'Failed to add custom agent' }, 500);
    }
  })

  /**
   * DELETE /api/agents/:id
   * Remove a custom AI Assistant
   */
  .delete('/:id', async (c) => {
    const id = c.req.param('id') as AgentId;
    
    try {
      // Check if it's a built-in agent
      if (BUILTIN_AGENTS.some(a => a.id === id)) {
        return c.json({ error: 'Cannot remove built-in agents' }, 400);
      }
      
      // TODO: Remove from database and ACP Gateway
      
      log.info('Custom agent removed', { agentId: id });
      
      return c.json({
        success: true,
        message: 'Agent removed',
      });
    } catch (error) {
      log.error('Failed to remove agent', { id, error });
      return c.json({ error: 'Failed to remove agent' }, 500);
    }
  })

  // ===========================================================================
  // Default Agent Management
  // ===========================================================================

  /**
   * POST /api/agents/default
   * Set the default AI Assistant
   */
  .post('/default', zValidator('json', setDefaultSchema), async (c) => {
    const { agentId } = c.req.valid('json');
    
    try {
      // Verify agent exists
      const config = BUILTIN_AGENTS.find(a => a.id === agentId);
      
      if (!config) {
        return c.json({ error: `Agent not found: ${agentId}` }, 404);
      }
      
      // TODO: Save default to database
      
      log.info('Default agent set', { agentId });
      
      return c.json({
        success: true,
        message: `${config.name} is now the default AI Assistant`,
        defaultAssistantId: agentId,
      });
    } catch (error) {
      log.error('Failed to set default agent', { agentId, error });
      return c.json({ error: 'Failed to set default agent' }, 500);
    }
  })

  /**
   * GET /api/agents/default
   * Get the default AI Assistant
   */
  .get('/default', async (c) => {
    try {
      // TODO: Get from database
      const defaultAgent = BUILTIN_AGENTS.find(a => a.isDefault);
      
      if (!defaultAgent) {
        return c.json({ error: 'No default agent configured' }, 404);
      }
      
      return c.json({
        defaultAssistantId: defaultAgent.id,
        agent: configToInstance(defaultAgent),
      });
    } catch (error) {
      log.error('Failed to get default agent', { error });
      return c.json({ error: 'Failed to get default agent' }, 500);
    }
  });

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a random user code for device flow
 */
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
