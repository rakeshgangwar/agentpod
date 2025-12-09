/**
 * Agent Manager
 * 
 * Manages the lifecycle of AI coding agents, including spawning, stopping,
 * and tracking their connection status.
 */

import type { AgentId, AgentConnection, AgentStatus, AgentConfig } from './types.ts';
import { AcpClient } from './acp-client.ts';
import { agentRegistry } from './agent-registry.ts';
import { FileHandler } from './file-handler.ts';
import { sessionManager } from './session-manager.ts';
import { eventEmitter } from './event-emitter.ts';
import { authHandler } from './auth-handler.ts';

interface AgentInstance {
  connection: AgentConnection;
  client: AcpClient;
  fileHandler: FileHandler;
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
      process: null,
      startedAt: null,
      lastActivity: null,
      error: null,
      sessionCount: 0,
    };

    // Emit status update
    eventEmitter.emitAgentStatus(agentId, 'starting');

    // Create file handler
    const fileHandler = new FileHandler(workDir);

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

    // Create ACP client
    const client = new AcpClient(config, {
      workingDirectory: workDir,
      env: { ...env, ...authEnv },
      
      // Event handlers
      onSessionUpdate: (notification) => {
        console.log(`[AgentManager:${agentId}] Session update:`, notification.type);
        
        // Update session
        const session = sessionManager.getSessionByAcpId(notification.sessionId);
        if (session) {
          sessionManager.updateSession(session.id, {
            status: notification.type === 'error' ? 'idle' : 'processing',
          });
          
          // Emit to frontend
          eventEmitter.emitSessionUpdate(
            session.id,
            notification.type,
            notification.content,
            notification.isPartial,
            notification.toolName,
            notification.toolInput,
            notification.toolResult
          );
        }
      },
      
      onSessionEndTurn: (notification) => {
        console.log(`[AgentManager:${agentId}] Session end turn:`, notification.reason);
        
        const session = sessionManager.getSessionByAcpId(notification.sessionId);
        if (session) {
          sessionManager.setStatus(session.id, 'idle');
          eventEmitter.emitSessionEndTurn(session.id, notification.reason, notification.error);
        }
      },
      
      onAuthRequired: (notification) => {
        console.log(`[AgentManager:${agentId}] Auth required`);
        
        connection.status = 'auth_required';
        authHandler.handleAuthRequired(
          agentId,
          notification.authUrl,
          notification.deviceCode,
          notification.userCode,
          notification.expiresIn
        );
      },
      
      onError: (error) => {
        console.error(`[AgentManager:${agentId}] Error:`, error);
        connection.error = error.message;
        eventEmitter.emitAgentStatus(agentId, 'error', error.message);
      },
      
      onClose: (code) => {
        console.log(`[AgentManager:${agentId}] Process closed with code: ${code}`);
        connection.status = 'stopped';
        connection.process = null;
        eventEmitter.emitAgentStatus(agentId, 'stopped');
      },
      
      // File system handlers
      onFsRead: async (params) => {
        return fileHandler.readTextFile(params);
      },
      
      onFsWrite: async (params) => {
        await fileHandler.writeTextFile(params);
      },
      
      onFsList: async (params) => {
        return fileHandler.listDirectory(params);
      },
      
      // Permission handler (auto-approve for now, frontend can override)
      onPermissionRequest: async (params) => {
        console.log(`[AgentManager:${agentId}] Permission request:`, params.permission);
        
        // Emit permission request to frontend
        const session = sessionManager.getSessionByAcpId(params.sessionId);
        if (session) {
          eventEmitter.emitPermissionRequest(
            session.id,
            `perm_${Date.now()}`,
            params.permission,
            params.description,
            params.path,
            params.command
          );
        }
        
        // Auto-approve for now (can be made interactive later)
        return { granted: true };
      },
      
      // Terminal handler
      onTerminalRun: async (params) => {
        console.log(`[AgentManager:${agentId}] Terminal run:`, params.command);
        
        const proc = Bun.spawn(['sh', '-c', params.command], {
          cwd: params.cwd || workDir,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        
        const exitCode = await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        
        return { exitCode, stdout, stderr };
      },
    });

    // Store instance
    const instance: AgentInstance = {
      connection,
      client,
      fileHandler,
    };
    this.agents.set(agentId, instance);

    try {
      // Spawn the process
      await client.spawn();
      
      connection.status = 'running';
      connection.startedAt = new Date();
      connection.lastActivity = new Date();
      
      // Initialize ACP connection
      await client.initialize();
      
      // If auth is required, try to authenticate
      if (config.requiresAuth) {
        const token = authHandler.getToken(agentId);
        if (token) {
          const authResult = await client.authenticate(token);
          if (!authResult.authenticated) {
            connection.status = 'auth_required';
          }
        } else {
          // Trigger auth flow
          const authResult = await client.authenticate();
          if (!authResult.authenticated) {
            connection.status = 'auth_required';
          }
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
