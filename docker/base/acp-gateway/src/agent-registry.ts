/**
 * Agent Registry
 * 
 * Configuration and registry for supported AI coding assistants.
 * OpenCode is the default agent (no auth required).
 */

import type { AgentConfig, AgentId, AgentMode } from './types.ts';

// =============================================================================
// Built-in Agent Configurations
// =============================================================================

/**
 * Built-in (pre-installed) agent configurations.
 * These agents are available out-of-the-box in the container.
 */
export const BUILTIN_AGENTS: AgentConfig[] = [
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
// Available (Installable) Agent Configurations
// =============================================================================

/**
 * Available agents that can be installed on-demand.
 * These are not pre-installed but can be added by the user.
 */
export const AVAILABLE_AGENTS: AgentConfig[] = [
  {
    id: 'goose',
    name: 'Goose',
    description: 'Block\'s open AI coding agent. Uses your own LLM API keys.',
    command: 'goose',
    args: ['--acp'],
    requiresAuth: false,
    authType: 'none',
    isBuiltIn: false,
    isDefault: false,
    icon: '🪿',
  },
  {
    id: 'mistral-vibe',
    name: 'Mistral Vibe',
    description: 'Mistral AI coding assistant.',
    command: 'mistral-vibe',
    args: [],
    requiresAuth: true,
    authType: 'api_key',
    authProvider: 'mistral',
    authUrl: 'https://console.mistral.ai/api-keys',
    isBuiltIn: false,
    isDefault: false,
    icon: '🌀',
  },
  {
    id: 'kimi-cli',
    name: 'Kimi CLI',
    description: 'Moonshot AI\'s Kimi coding assistant.',
    command: 'kimi',
    args: ['--acp'],
    requiresAuth: true,
    authType: 'api_key',
    authProvider: 'moonshot',
    isBuiltIn: false,
    isDefault: false,
    icon: '🌙',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    description: 'Alibaba\'s Qwen AI coding assistant.',
    command: 'qwen-code',
    args: ['--acp'],
    requiresAuth: true,
    authType: 'api_key',
    authProvider: 'alibaba',
    isBuiltIn: false,
    isDefault: false,
    icon: '🎯',
  },
];

// =============================================================================
// Default Agent Modes
// =============================================================================

/**
 * Default agent modes that work with any assistant.
 * These are generic modes that can be applied to any agent.
 */
export const DEFAULT_MODES: AgentMode[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Standard coding assistant mode.',
    source: 'builtin',
    assistantId: 'all',
  },
];

/**
 * OpenCode-specific agent modes.
 * These map to OpenCode's built-in agents from the /agent endpoint.
 */
export const OPENCODE_MODES: AgentMode[] = [
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
  },
];

// =============================================================================
// Agent Registry Class
// =============================================================================

/**
 * Agent Registry class for managing agent configurations.
 */
export class AgentRegistry {
  private agents: Map<AgentId, AgentConfig> = new Map();
  private modes: Map<string, AgentMode> = new Map();
  private defaultAgentId: AgentId = 'opencode';

  constructor() {
    // Load built-in agents
    for (const agent of BUILTIN_AGENTS) {
      this.agents.set(agent.id, agent);
      if (agent.isDefault) {
        this.defaultAgentId = agent.id;
      }
    }

    // Load available agents (not installed but can be added)
    for (const agent of AVAILABLE_AGENTS) {
      this.agents.set(agent.id, agent);
    }

    // Load default modes
    for (const mode of DEFAULT_MODES) {
      this.modes.set(mode.id, mode);
    }

    // Load OpenCode modes
    for (const mode of OPENCODE_MODES) {
      this.modes.set(mode.id, mode);
    }
  }

  /**
   * Get all registered agents.
   */
  getAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get only built-in (pre-installed) agents.
   */
  getBuiltInAgents(): AgentConfig[] {
    return this.getAgents().filter(a => a.isBuiltIn);
  }

  /**
   * Get agents that can be installed on-demand.
   */
  getAvailableAgents(): AgentConfig[] {
    return this.getAgents().filter(a => !a.isBuiltIn);
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
   * Get the default agent ID.
   */
  getDefaultAgentId(): AgentId {
    return this.defaultAgentId;
  }

  /**
   * Set the default agent.
   */
  setDefaultAgent(id: AgentId): void {
    if (!this.hasAgent(id)) {
      throw new Error(`Unknown agent: ${id}`);
    }
    
    // Update isDefault flags
    for (const [agentId, config] of this.agents) {
      config.isDefault = agentId === id;
    }
    
    this.defaultAgentId = id;
  }

  /**
   * Get the default agent (OpenCode).
   */
  getDefaultAgent(): AgentConfig {
    const agent = this.agents.get(this.defaultAgentId);
    if (!agent) {
      throw new Error(`Default agent (${this.defaultAgentId}) not found in registry`);
    }
    return agent;
  }

  /**
   * Get all modes for an agent (including universal modes).
   */
  getModes(agentId: AgentId): AgentMode[] {
    return Array.from(this.modes.values()).filter(
      mode => mode.assistantId === 'all' || mode.assistantId === agentId
    );
  }

  /**
   * Get a specific mode by ID.
   */
  getMode(modeId: string): AgentMode | undefined {
    return this.modes.get(modeId);
  }

  /**
   * Add a custom mode.
   */
  addCustomMode(mode: AgentMode): void {
    this.modes.set(mode.id, { ...mode, source: 'custom' });
  }

  /**
   * Remove a custom mode.
   */
  removeCustomMode(modeId: string): boolean {
    const mode = this.modes.get(modeId);
    if (mode && mode.source === 'custom') {
      this.modes.delete(modeId);
      return true;
    }
    return false;
  }

  /**
   * Load custom agents from a workspace configuration file.
   * This allows users to define additional agents.
   * 
   * @param configPath Path to the configuration file (e.g., .agentpod/agents.json)
   */
  async loadCustomAgents(configPath: string): Promise<void> {
    try {
      const file = Bun.file(configPath);
      const exists = await file.exists();
      
      if (!exists) {
        console.log(`[AgentRegistry] No custom agents config at ${configPath}`);
        return;
      }

      const config = await file.json() as { 
        agents?: Partial<AgentConfig>[];
        modes?: Partial<AgentMode>[];
        defaultAgentId?: string;
      };
      
      // Load custom agents
      if (config.agents && Array.isArray(config.agents)) {
        for (const customAgent of config.agents) {
          if (customAgent.id && customAgent.command) {
            const existing = this.agents.get(customAgent.id as AgentId);
            if (existing) {
              // Merge with existing
              this.agents.set(customAgent.id as AgentId, {
                ...existing,
                ...customAgent,
                id: existing.id,
                isBuiltIn: existing.isBuiltIn, // Preserve built-in status
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
                authType: customAgent.authType || 'none',
                authFlowType: customAgent.authFlowType,
                authProvider: customAgent.authProvider,
                authUrl: customAgent.authUrl,
                envVars: customAgent.envVars,
                isBuiltIn: false,
                isDefault: false,
                icon: customAgent.icon,
              });
              console.log(`[AgentRegistry] Added custom agent: ${customAgent.id}`);
            }
          }
        }
      }

      // Load custom modes
      if (config.modes && Array.isArray(config.modes)) {
        for (const customMode of config.modes) {
          if (customMode.id && customMode.name) {
            this.modes.set(customMode.id, {
              id: customMode.id,
              name: customMode.name,
              description: customMode.description || '',
              source: 'custom',
              assistantId: customMode.assistantId || 'all',
              systemPrompt: customMode.systemPrompt,
              icon: customMode.icon,
            });
            console.log(`[AgentRegistry] Added custom mode: ${customMode.id}`);
          }
        }
      }

      // Set default agent if specified
      if (config.defaultAgentId && this.hasAgent(config.defaultAgentId)) {
        this.setDefaultAgent(config.defaultAgentId);
        console.log(`[AgentRegistry] Set default agent: ${config.defaultAgentId}`);
      }

    } catch (error) {
      console.error(`[AgentRegistry] Failed to load custom agents from ${configPath}:`, error);
    }
  }

  /**
   * Add a custom agent dynamically.
   */
  addCustomAgent(config: Omit<AgentConfig, 'isBuiltIn'>): AgentConfig {
    if (this.agents.has(config.id)) {
      throw new Error(`Agent with ID '${config.id}' already exists`);
    }

    const agent: AgentConfig = {
      ...config,
      isBuiltIn: false,
      isDefault: false,
    };

    this.agents.set(config.id, agent);
    console.log(`[AgentRegistry] Added custom agent: ${config.id}`);

    return agent;
  }

  /**
   * Remove a custom agent.
   */
  removeCustomAgent(id: AgentId): boolean {
    const agent = this.agents.get(id);
    if (!agent) {
      return false;
    }

    if (agent.isBuiltIn) {
      throw new Error(`Cannot remove built-in agent: ${id}`);
    }

    if (agent.isDefault) {
      // Reset default to OpenCode
      this.setDefaultAgent('opencode');
    }

    this.agents.delete(id);
    console.log(`[AgentRegistry] Removed custom agent: ${id}`);
    return true;
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

  /**
   * Export registry state for persistence.
   */
  exportState(): {
    customAgents: AgentConfig[];
    customModes: AgentMode[];
    defaultAgentId: AgentId;
  } {
    return {
      customAgents: this.getAgents().filter(a => !a.isBuiltIn),
      customModes: Array.from(this.modes.values()).filter(m => m.source === 'custom'),
      defaultAgentId: this.defaultAgentId,
    };
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();
