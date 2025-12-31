/**
 * Agent Registry
 * 
 * Configuration and registry for supported AI coding agents.
 * OpenCode is the default agent (no auth required).
 */

import type { AgentConfig, AgentId } from './types.ts';

/**
 * Default agent configurations.
 * These are the built-in supported agents.
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open-source AI coding assistant by SST. Default agent with no authentication required.',
    command: 'opencode',
    args: ['acp'],
    requiresAuth: false,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic\'s Claude AI coding assistant. Requires Claude Pro/Max subscription.',
    command: 'npx',
    args: ['@anthropic-ai/claude-code', '--acp'],
    requiresAuth: true,
    authType: 'oauth',
    authProvider: 'anthropic',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Google\'s Gemini AI coding assistant. Requires Google account authentication.',
    command: 'gemini',
    args: ['--experimental-acp'],
    requiresAuth: true,
    authType: 'oauth',
    authProvider: 'google',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    description: 'Alibaba\'s Qwen AI coding assistant.',
    command: 'npx',
    args: ['@anthropic-ai/qwen-code', '--experimental-acp'],
    requiresAuth: true,
    authType: 'oauth',
    authProvider: 'alibaba',
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI\'s Codex coding assistant.',
    command: 'npx',
    args: ['@openai/codex', '--acp'],
    requiresAuth: true,
    authType: 'api_key',
    authProvider: 'openai',
  },
];

/**
 * Agent Registry class for managing agent configurations.
 */
export class AgentRegistry {
  private agents: Map<AgentId, AgentConfig> = new Map();

  constructor() {
    // Load default agents
    for (const agent of DEFAULT_AGENTS) {
      this.agents.set(agent.id, agent);
    }
  }

  /**
   * Get all registered agents.
   */
  getAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get a specific agent by ID.
   */
  getAgent(id: AgentId): AgentConfig | undefined {
    return this.agents.get(id);
  }

  /**
   * Check if an agent exists.
   */
  hasAgent(id: string): id is AgentId {
    return this.agents.has(id as AgentId);
  }

  /**
   * Get the default agent (OpenCode).
   */
  getDefaultAgent(): AgentConfig {
    const opencode = this.agents.get('opencode');
    if (!opencode) {
      throw new Error('Default agent (opencode) not found in registry');
    }
    return opencode;
  }

  /**
   * Load custom agents from a workspace configuration file.
   * This allows users to define additional agents.
   * 
   * @param configPath Path to the configuration file (e.g., .opencode/agents.json)
   */
  async loadCustomAgents(configPath: string): Promise<void> {
    try {
      const file = Bun.file(configPath);
      const exists = await file.exists();
      
      if (!exists) {
        console.log(`[AgentRegistry] No custom agents config at ${configPath}`);
        return;
      }

      const config = await file.json() as { agents?: Partial<AgentConfig>[] };
      
      if (config.agents && Array.isArray(config.agents)) {
        for (const customAgent of config.agents) {
          if (customAgent.id && customAgent.command) {
            // Merge with defaults or add new
            const existing = this.agents.get(customAgent.id as AgentId);
            if (existing) {
              this.agents.set(customAgent.id as AgentId, {
                ...existing,
                ...customAgent,
                id: existing.id, // Preserve original ID
              });
              console.log(`[AgentRegistry] Updated agent: ${customAgent.id}`);
            } else {
              // Add as new custom agent
              this.agents.set(customAgent.id as AgentId, {
                id: customAgent.id as AgentId,
                name: customAgent.name || customAgent.id,
                description: customAgent.description || 'Custom agent',
                command: customAgent.command,
                args: customAgent.args || [],
                requiresAuth: customAgent.requiresAuth || false,
                authType: customAgent.authType,
                authProvider: customAgent.authProvider,
                envVars: customAgent.envVars,
              });
              console.log(`[AgentRegistry] Added custom agent: ${customAgent.id}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[AgentRegistry] Failed to load custom agents from ${configPath}:`, error);
    }
  }

  /**
   * Get agents that require authentication.
   */
  getAgentsRequiringAuth(): AgentConfig[] {
    return this.getAgents().filter(a => a.requiresAuth);
  }

  /**
   * Get agents that don't require authentication.
   */
  getAgentsWithoutAuth(): AgentConfig[] {
    return this.getAgents().filter(a => !a.requiresAuth);
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();
