/**
 * Agent Manager
 * 
 * Manages the lifecycle of AI coding agents using the official ACP SDK.
 */

import type { AgentId, AgentConnection, SessionNotification } from './types.ts';
import { AcpClient, type AcpClientEventHandlers } from './acp-client.ts';
import { agentRegistry } from './agent-registry.ts';
import { sessionManager } from './session-manager.ts';
import { eventEmitter } from './event-emitter.ts';
import { authHandler } from './auth-handler.ts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface AgentInstance {
  connection: AgentConnection;
  client: AcpClient;
}

/**
 * Agent Manager for orchestrating multiple AI agents.
 */
export class AgentManager {
  private agents: Map<AgentId, AgentInstance> = new Map();
  private defaultWorkingDirectory: string;

  constructor(defaultWorkingDirectory: string = '/workspace') {
    this.defaultWorkingDirectory = defaultWorkingDirectory;
  }

  /**
   * Spawn an agent subprocess.
   */
  async spawnAgent(
    agentId: AgentId,
    env?: Record<string, string>,
    workingDirectory?: string
  ): Promise<AgentConnection> {
    // Check if already running
    const existing = this.agents.get(agentId);
    if (existing && existing.connection.status === 'running') {
      console.log(`[AgentManager] Agent ${agentId} already running`);
      return existing.connection;
    }

    // Get agent config
    const config = agentRegistry.getAgent(agentId);
    if (!config) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const workDir = workingDirectory || this.defaultWorkingDirectory;
    
    // Create connection record
    const connection: AgentConnection = {
      id: agentId,
      status: 'starting',
      startedAt: null,
      lastActivity: null,
      error: null,
      sessionCount: 0,
    };

    // Emit status update
    eventEmitter.emitAgentStatus(agentId, 'starting');

    // Check if auth token is available for agents requiring auth
    let authEnv: Record<string, string> = {};
    if (config.requiresAuth) {
      const token = authHandler.getToken(agentId);
      if (token) {
        // Inject token based on auth provider
        switch (config.authProvider) {
          case 'anthropic':
            authEnv['ANTHROPIC_API_KEY'] = token;
            break;
          case 'google':
            authEnv['GOOGLE_API_KEY'] = token;
            break;
          case 'openai':
            authEnv['OPENAI_API_KEY'] = token;
            break;
          default:
            authEnv['AUTH_TOKEN'] = token;
        }
      }
    }

    // Create event handlers
    const handlers: AcpClientEventHandlers = {
      onSessionUpdate: (notification: SessionNotification) => {
        console.log(`[AgentManager:${agentId}] Session update:`, notification.update);
        
        // Find the local session by ACP session ID
        const session = sessionManager.getSessionByAcpId(notification.sessionId);
        if (session) {
          // Emit to frontend via SSE
          eventEmitter.emit('session_update', notification, session.id, agentId);
        }
      },

      onPermissionRequest: async (params) => {
        console.log(`[AgentManager:${agentId}] Permission request:`, params.toolCall.title);
        
        // For now, auto-approve with first option
        // TODO: Emit to frontend for user decision
        return {
          outcome: {
            outcome: 'selected' as const,
            optionId: params.options[0]?.optionId || '',
          },
        };
      },

      onReadTextFile: async (params) => {
        console.log(`[AgentManager:${agentId}] Read file:`, params.path);
        try {
          const filePath = path.isAbsolute(params.path) 
            ? params.path 
            : path.join(workDir, params.path);
          const content = await fs.readFile(filePath, 'utf-8');
          return { content };
        } catch (error) {
          throw new Error(`Failed to read file: ${(error as Error).message}`);
        }
      },

      onWriteTextFile: async (params) => {
        console.log(`[AgentManager:${agentId}] Write file:`, params.path);
        try {
          const filePath = path.isAbsolute(params.path) 
            ? params.path 
            : path.join(workDir, params.path);
          await fs.writeFile(filePath, params.content, 'utf-8');
          return {};
        } catch (error) {
          throw new Error(`Failed to write file: ${(error as Error).message}`);
        }
      },

      onError: (error: Error) => {
        console.error(`[AgentManager:${agentId}] Error:`, error);
        connection.error = error.message;
        eventEmitter.emitAgentStatus(agentId, 'error', error.message);
      },

      onClose: () => {
        console.log(`[AgentManager:${agentId}] Connection closed`);
        connection.status = 'stopped';
        eventEmitter.emitAgentStatus(agentId, 'stopped');
      },
    };

    // Create ACP client using official SDK
    const client = new AcpClient(config, workDir, handlers);

    // Store instance
    const instance: AgentInstance = {
      connection,
      client,
    };
    this.agents.set(agentId, instance);

    try {
      // Spawn and initialize the agent
      const initResult = await client.spawn({ ...env, ...authEnv });
      
      connection.status = 'running';
      connection.startedAt = new Date();
      connection.lastActivity = new Date();
      
      console.log(`[AgentManager] Agent ${agentId} initialized:`, initResult.agentInfo);

      // Check if authentication is required
      if (initResult.authMethods && initResult.authMethods.length > 0) {
        console.log(`[AgentManager:${agentId}] Auth methods available:`, initResult.authMethods);
        // For now, mark as auth required if no token available
        if (config.requiresAuth && !authHandler.isAuthenticated(agentId)) {
          connection.status = 'auth_required';
        }
      }
      
      eventEmitter.emitAgentStatus(agentId, connection.status);
      
      console.log(`[AgentManager] Agent ${agentId} spawned successfully`);
      return connection;
      
    } catch (error) {
      connection.status = 'error';
      connection.error = (error as Error).message;
      eventEmitter.emitAgentStatus(agentId, 'error', connection.error);
      throw error;
    }
  }

  /**
   * Stop an agent gracefully.
   */
  async stopAgent(agentId: AgentId): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      console.log(`[AgentManager] Agent ${agentId} not found`);
      return;
    }

    console.log(`[AgentManager] Stopping agent: ${agentId}`);
    
    await instance.client.shutdown();
    instance.connection.status = 'stopped';
    
    eventEmitter.emitAgentStatus(agentId, 'stopped');
  }

  /**
   * Restart an agent.
   */
  async restartAgent(agentId: AgentId): Promise<AgentConnection> {
    await this.stopAgent(agentId);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return this.spawnAgent(agentId);
  }

  /**
   * Kill an agent immediately.
   */
  killAgent(agentId: AgentId): void {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.client.kill();
      instance.connection.status = 'stopped';
      eventEmitter.emitAgentStatus(agentId, 'stopped');
    }
  }

  /**
   * Get agent connection status.
   */
  getAgentStatus(agentId: AgentId): AgentConnection | undefined {
    return this.agents.get(agentId)?.connection;
  }

  /**
   * Get ACP client for an agent.
   */
  getClient(agentId: AgentId): AcpClient | undefined {
    return this.agents.get(agentId)?.client;
  }

  /**
   * Get all agent statuses.
   */
  getAllAgentStatuses(): AgentConnection[] {
    return Array.from(this.agents.values()).map(i => i.connection);
  }

  /**
   * Check if an agent is running.
   */
  isAgentRunning(agentId: AgentId): boolean {
    const instance = this.agents.get(agentId);
    return instance?.connection.status === 'running';
  }

  /**
   * Get running agent count.
   */
  getRunningAgentCount(): number {
    return Array.from(this.agents.values())
      .filter(i => i.connection.status === 'running')
      .length;
  }

  /**
   * Shutdown all agents.
   */
  async shutdownAll(): Promise<void> {
    console.log('[AgentManager] Shutting down all agents');
    
    const shutdowns = Array.from(this.agents.keys()).map(id => this.stopAgent(id));
    await Promise.all(shutdowns);
  }

  /**
   * Update session count for an agent.
   */
  updateSessionCount(agentId: AgentId): void {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.connection.sessionCount = sessionManager.getSessionsByAgent(agentId).length;
    }
  }
}

// Singleton instance
export const agentManager = new AgentManager();
