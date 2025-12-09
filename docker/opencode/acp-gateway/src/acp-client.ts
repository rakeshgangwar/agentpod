/**
 * ACP Client
 * 
 * Uses the official @agentclientprotocol/sdk to communicate with ACP-compliant agents.
 */

import { spawn, type Subprocess } from 'bun';
import { Writable, Readable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';

import type { AgentConfig, AgentId } from './types.ts';

// Re-export types from the official SDK for use in other files
export type {
  InitializeResponse,
  NewSessionResponse,
  PromptResponse,
  SessionNotification,
  ContentBlock,
} from '@agentclientprotocol/sdk';

/**
 * Event handlers for session updates
 */
export interface AcpClientEventHandlers {
  onSessionUpdate?: (params: acp.SessionNotification) => void;
  onPermissionRequest?: (params: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse>;
  onReadTextFile?: (params: acp.ReadTextFileRequest) => Promise<acp.ReadTextFileResponse>;
  onWriteTextFile?: (params: acp.WriteTextFileRequest) => Promise<acp.WriteTextFileResponse>;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

/**
 * Client handler implementation for the ACP SDK
 */
class ClientHandler implements acp.Client {
  constructor(private handlers: AcpClientEventHandlers) {}

  async requestPermission(params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    if (this.handlers.onPermissionRequest) {
      return this.handlers.onPermissionRequest(params);
    }
    // Auto-approve if no handler (for now)
    return {
      outcome: {
        outcome: 'selected',
        optionId: params.options[0]?.optionId || '',
      },
    };
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    this.handlers.onSessionUpdate?.(params);
  }

  async readTextFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
    if (this.handlers.onReadTextFile) {
      return this.handlers.onReadTextFile(params);
    }
    throw new Error('File read not supported');
  }

  async writeTextFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
    if (this.handlers.onWriteTextFile) {
      return this.handlers.onWriteTextFile(params);
    }
    throw new Error('File write not supported');
  }
}

/**
 * ACP Client for communicating with an agent subprocess.
 * Uses the official @agentclientprotocol/sdk.
 */
export class AcpClient {
  private agentConfig: AgentConfig;
  private workingDirectory: string;
  private handlers: AcpClientEventHandlers;
  private process: Subprocess | null = null;
  private connection: acp.ClientSideConnection | null = null;
  private _initialized = false;

  constructor(
    agentConfig: AgentConfig,
    workingDirectory: string,
    handlers: AcpClientEventHandlers = {}
  ) {
    this.agentConfig = agentConfig;
    this.workingDirectory = workingDirectory;
    this.handlers = handlers;
  }

  get agentId(): AgentId {
    return this.agentConfig.id;
  }

  get isConnected(): boolean {
    return this.process !== null && this.connection !== null;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Spawn the agent subprocess and establish ACP connection.
   */
  async spawn(env?: Record<string, string>): Promise<acp.InitializeResponse> {
    if (this.process) {
      throw new Error('Agent process already running');
    }

    const { command, args, envVars } = this.agentConfig;

    console.log(`[AcpClient:${this.agentId}] Spawning: ${command} ${args.join(' ')}`);

    // Merge environment variables
    const processEnv = {
      ...process.env,
      ...envVars,
      ...env,
      PWD: this.workingDirectory,
    };

    // Spawn the agent subprocess
    this.process = spawn([command, ...args], {
      cwd: this.workingDirectory,
      env: processEnv,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'inherit', // Pass stderr through for debugging
    });

    console.log(`[AcpClient:${this.agentId}] Process spawned with PID: ${this.process.pid}`);

    // Create Node.js compatible streams from Bun's streams
    const stdinWritable = this.process.stdin as unknown as NodeJS.WritableStream;
    const stdoutReadable = this.process.stdout as unknown as NodeJS.ReadableStream;

    // Create the ACP stream using the SDK's ndJsonStream helper
    const input = Writable.toWeb(stdinWritable as unknown as Writable);
    const output = Readable.toWeb(stdoutReadable as unknown as Readable);
    const stream = acp.ndJsonStream(input, output);

    // Create the client handler
    const clientHandler = new ClientHandler(this.handlers);

    // Create the ACP connection
    this.connection = new acp.ClientSideConnection(
      (_agent) => clientHandler,
      stream
    );

    // Handle connection close
    this.connection.closed.then(() => {
      console.log(`[AcpClient:${this.agentId}] Connection closed`);
      this.handlers.onClose?.();
    });

    // Monitor process exit
    this.process.exited.then((code) => {
      console.log(`[AcpClient:${this.agentId}] Process exited with code: ${code}`);
      this.process = null;
      this._initialized = false;
    });

    // Initialize the connection
    try {
      const initResult = await this.connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: {
            readTextFile: !!this.handlers.onReadTextFile,
            writeTextFile: !!this.handlers.onWriteTextFile,
          },
          terminal: true,
        },
        clientInfo: {
          name: 'acp-gateway',
          title: 'ACP Gateway',
          version: '0.1.0',
        },
      });

      this._initialized = true;
      console.log(`[AcpClient:${this.agentId}] Initialized with protocol v${initResult.protocolVersion}`);
      console.log(`[AcpClient:${this.agentId}] Agent info:`, initResult.agentInfo);

      return initResult;
    } catch (error) {
      console.error(`[AcpClient:${this.agentId}] Initialization failed:`, error);
      this.kill();
      throw error;
    }
  }

  /**
   * Create a new session.
   */
  async newSession(cwd?: string, mcpServers?: acp.McpServer[]): Promise<acp.NewSessionResponse> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    return this.connection.newSession({
      cwd: cwd || this.workingDirectory,
      mcpServers: mcpServers || [],
    });
  }

  /**
   * Send a prompt to a session.
   */
  async prompt(sessionId: string, prompt: acp.ContentBlock[]): Promise<acp.PromptResponse> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    return this.connection.prompt({
      sessionId,
      prompt,
    });
  }

  /**
   * Send a text prompt (convenience method).
   */
  async promptText(sessionId: string, text: string): Promise<acp.PromptResponse> {
    return this.prompt(sessionId, [{ type: 'text', text }]);
  }

  /**
   * Cancel an ongoing prompt.
   */
  async cancel(sessionId: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    return this.connection.cancel({ sessionId });
  }

  /**
   * Load an existing session (if supported by agent).
   */
  async loadSession(sessionId: string, cwd?: string, mcpServers?: acp.McpServer[]): Promise<acp.LoadSessionResponse> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    return this.connection.loadSession({
      sessionId,
      cwd: cwd || this.workingDirectory,
      mcpServers: mcpServers || [],
    });
  }

  /**
   * Authenticate with the agent (if required).
   */
  async authenticate(methodId: string): Promise<acp.AuthenticateResponse> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    return this.connection.authenticate({ methodId });
  }

  /**
   * Shutdown the agent gracefully.
   */
  async shutdown(): Promise<void> {
    if (!this.process) return;

    // Give it a moment to finish any pending work
    await new Promise(resolve => setTimeout(resolve, 500));

    // Kill the process
    this.kill();
  }

  /**
   * Kill the agent process immediately.
   */
  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connection = null;
    this._initialized = false;
  }
}
