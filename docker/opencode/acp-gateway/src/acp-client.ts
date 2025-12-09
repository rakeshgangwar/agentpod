/**
 * ACP Client
 * 
 * Handles JSON-RPC 2.0 communication with ACP-compliant agents over stdio.
 * Manages subprocess spawning, message framing, and bidirectional communication.
 */

import type { Subprocess } from 'bun';
import type {
  AgentConfig,
  AgentId,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  AcpInitializeParams,
  AcpInitializeResult,
  AcpAuthenticateParams,
  AcpAuthenticateResult,
  AcpSessionNewParams,
  AcpSessionNewResult,
  AcpSessionPromptParams,
  AcpSessionCancelParams,
  SessionUpdateNotification,
  SessionEndTurnNotification,
  AuthRequiredNotification,
  FsReadTextFileParams,
  FsReadTextFileResult,
  FsWriteTextFileParams,
  FsListDirectoryParams,
  FsListDirectoryResult,
  SessionRequestPermissionParams,
  TerminalRunParams,
  TerminalRunResult,
} from './types.ts';

// Event handler types
type SessionUpdateHandler = (notification: SessionUpdateNotification) => void;
type SessionEndTurnHandler = (notification: SessionEndTurnNotification) => void;
type AuthRequiredHandler = (notification: AuthRequiredNotification) => void;
type ErrorHandler = (error: Error) => void;
type CloseHandler = (code: number | null) => void;

// Client request handler types (requests FROM agent)
type FsReadHandler = (params: FsReadTextFileParams) => Promise<FsReadTextFileResult>;
type FsWriteHandler = (params: FsWriteTextFileParams) => Promise<void>;
type FsListHandler = (params: FsListDirectoryParams) => Promise<FsListDirectoryResult>;
type PermissionHandler = (params: SessionRequestPermissionParams) => Promise<{ granted: boolean }>;
type TerminalHandler = (params: TerminalRunParams) => Promise<TerminalRunResult>;

interface AcpClientOptions {
  workingDirectory: string;
  env?: Record<string, string>;
  onSessionUpdate?: SessionUpdateHandler;
  onSessionEndTurn?: SessionEndTurnHandler;
  onAuthRequired?: AuthRequiredHandler;
  onError?: ErrorHandler;
  onClose?: CloseHandler;
  // Client capability handlers
  onFsRead?: FsReadHandler;
  onFsWrite?: FsWriteHandler;
  onFsList?: FsListHandler;
  onPermissionRequest?: PermissionHandler;
  onTerminalRun?: TerminalHandler;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  timeout: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT = 300000; // 5 minutes for long operations

/**
 * ACP Client for communicating with an agent subprocess.
 */
export class AcpClient {
  private agentConfig: AgentConfig;
  private options: AcpClientOptions;
  private process: Subprocess | null = null;
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private requestId = 0;
  private buffer = '';
  private initialized = false;
  private authenticated = false;

  constructor(agentConfig: AgentConfig, options: AcpClientOptions) {
    this.agentConfig = agentConfig;
    this.options = options;
  }

  /**
   * Get the agent ID.
   */
  get agentId(): AgentId {
    return this.agentConfig.id;
  }

  /**
   * Check if the client is connected to the agent process.
   */
  get isConnected(): boolean {
    return this.process !== null;
  }

  /**
   * Check if the client is initialized.
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if authenticated (for agents requiring auth).
   */
  get isAuthenticated(): boolean {
    return !this.agentConfig.requiresAuth || this.authenticated;
  }

  /**
   * Spawn the agent subprocess and set up communication.
   */
  async spawn(): Promise<void> {
    if (this.process) {
      throw new Error('Agent process already running');
    }

    const { command, args, envVars } = this.agentConfig;

    console.log(`[AcpClient:${this.agentId}] Spawning: ${command} ${args.join(' ')}`);

    // Merge environment variables
    const env = {
      ...process.env,
      ...envVars,
      ...this.options.env,
      // Ensure working directory is set
      PWD: this.options.workingDirectory,
    };

    this.process = Bun.spawn([command, ...args], {
      cwd: this.options.workingDirectory,
      env,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Set up stdout reader for JSON-RPC messages
    this.readStdout();

    // Set up stderr reader for logging
    this.readStderr();

    // Monitor process exit
    this.process.exited.then((code) => {
      console.log(`[AcpClient:${this.agentId}] Process exited with code: ${code}`);
      this.process = null;
      this.initialized = false;
      this.options.onClose?.(code);
    });

    console.log(`[AcpClient:${this.agentId}] Process spawned with PID: ${this.process.pid}`);
  }

  /**
   * Read and process stdout (JSON-RPC messages).
   */
  private async readStdout(): Promise<void> {
    const stdout = this.process?.stdout;
    if (!stdout || typeof stdout === 'number') return;

    const reader = (stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        this.buffer += text;
        this.processBuffer();
      }
    } catch (error) {
      if (this.process) {
        console.error(`[AcpClient:${this.agentId}] Stdout read error:`, error);
        this.options.onError?.(error as Error);
      }
    }
  }

  /**
   * Read stderr for logging and errors.
   */
  private async readStderr(): Promise<void> {
    const stderr = this.process?.stderr;
    if (!stderr || typeof stderr === 'number') return;

    const reader = (stderr as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        // Log stderr but don't treat as fatal error
        console.log(`[AcpClient:${this.agentId}:stderr] ${text.trim()}`);
      }
    } catch (error) {
      if (this.process) {
        console.error(`[AcpClient:${this.agentId}] Stderr read error:`, error);
      }
    }
  }

  /**
   * Process the message buffer for complete JSON-RPC messages.
   * Messages are newline-delimited JSON.
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed);
        this.handleMessage(message);
      } catch (error) {
        console.error(`[AcpClient:${this.agentId}] Failed to parse message:`, trimmed, error);
      }
    }
  }

  /**
   * Handle an incoming JSON-RPC message.
   */
  private handleMessage(message: JsonRpcResponse | JsonRpcNotification | JsonRpcRequest): void {
    // Check if it's a response (has id and no method)
    if ('id' in message && !('method' in message)) {
      this.handleResponse(message as JsonRpcResponse);
      return;
    }

    // Check if it's a request from the agent (has id and method)
    if ('id' in message && 'method' in message) {
      this.handleAgentRequest(message as JsonRpcRequest);
      return;
    }

    // Otherwise it's a notification
    if ('method' in message) {
      this.handleNotification(message as JsonRpcNotification);
    }
  }

  /**
   * Handle a response to a request we sent.
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn(`[AcpClient:${this.agentId}] Received response for unknown request:`, response.id);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(`${response.error.message} (code: ${response.error.code})`));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle a request FROM the agent (client capabilities).
   */
  private async handleAgentRequest(request: JsonRpcRequest): Promise<void> {
    console.log(`[AcpClient:${this.agentId}] Agent request: ${request.method}`);

    try {
      let result: unknown;

      switch (request.method) {
        case 'fs/read_text_file':
          if (this.options.onFsRead) {
            result = await this.options.onFsRead(request.params as FsReadTextFileParams);
          } else {
            throw new Error('File read not supported');
          }
          break;

        case 'fs/write_text_file':
          if (this.options.onFsWrite) {
            await this.options.onFsWrite(request.params as FsWriteTextFileParams);
            result = {};
          } else {
            throw new Error('File write not supported');
          }
          break;

        case 'fs/list_directory':
          if (this.options.onFsList) {
            result = await this.options.onFsList(request.params as FsListDirectoryParams);
          } else {
            throw new Error('Directory listing not supported');
          }
          break;

        case 'session/request_permission':
          if (this.options.onPermissionRequest) {
            result = await this.options.onPermissionRequest(request.params as SessionRequestPermissionParams);
          } else {
            // Auto-grant if no handler
            result = { granted: true };
          }
          break;

        case 'terminal/run':
          if (this.options.onTerminalRun) {
            result = await this.options.onTerminalRun(request.params as TerminalRunParams);
          } else {
            throw new Error('Terminal execution not supported');
          }
          break;

        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      this.sendResponse(request.id, result);
    } catch (error) {
      this.sendErrorResponse(request.id, -32603, (error as Error).message);
    }
  }

  /**
   * Handle a notification from the agent.
   */
  private handleNotification(notification: JsonRpcNotification): void {
    console.log(`[AcpClient:${this.agentId}] Notification: ${notification.method}`);

    switch (notification.method) {
      case 'session/update':
        this.options.onSessionUpdate?.(notification.params as SessionUpdateNotification);
        break;

      case 'session/end_turn':
        this.options.onSessionEndTurn?.(notification.params as SessionEndTurnNotification);
        break;

      case 'auth/required':
        this.options.onAuthRequired?.(notification.params as AuthRequiredNotification);
        break;

      default:
        console.log(`[AcpClient:${this.agentId}] Unknown notification:`, notification.method);
    }
  }

  /**
   * Send a JSON-RPC request to the agent.
   */
  private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    if (!this.process?.stdin) {
      throw new Error('Agent process not running');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, REQUEST_TIMEOUT);

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        method,
        timeout,
      });

      const message = JSON.stringify(request) + '\n';
      const stdin = this.process!.stdin as import('bun').FileSink;
      stdin.write(message);
      
      console.log(`[AcpClient:${this.agentId}] Sent request: ${method} (id: ${id})`);
    });
  }

  /**
   * Send a JSON-RPC notification to the agent.
   */
  private sendNotification(method: string, params?: unknown): void {
    if (!this.process?.stdin) {
      throw new Error('Agent process not running');
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';
    const stdin = this.process.stdin as import('bun').FileSink;
    stdin.write(message);

    console.log(`[AcpClient:${this.agentId}] Sent notification: ${method}`);
  }

  /**
   * Send a response to an agent request.
   */
  private sendResponse(id: string | number, result: unknown): void {
    if (!this.process?.stdin) return;

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };

    const message = JSON.stringify(response) + '\n';
    const stdin = this.process.stdin as import('bun').FileSink;
    stdin.write(message);
  }

  /**
   * Send an error response to an agent request.
   */
  private sendErrorResponse(id: string | number, code: number, message: string): void {
    if (!this.process?.stdin) return;

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };

    const msg = JSON.stringify(response) + '\n';
    const stdin = this.process.stdin as import('bun').FileSink;
    stdin.write(msg);
  }

  // ==========================================================================
  // ACP Protocol Methods
  // ==========================================================================

  /**
   * Initialize the ACP connection.
   */
  async initialize(): Promise<AcpInitializeResult> {
    const params: AcpInitializeParams = {
      clientInfo: {
        name: 'ACP Gateway',
        version: '0.1.0',
      },
      capabilities: {
        textDocuments: true,
        tools: true,
      },
      workingDirectory: this.options.workingDirectory,
    };

    const result = await this.sendRequest<AcpInitializeResult>('initialize', params);
    this.initialized = true;
    
    console.log(`[AcpClient:${this.agentId}] Initialized with server:`, result.serverInfo);
    return result;
  }

  /**
   * Authenticate with the agent (for agents requiring auth).
   */
  async authenticate(token?: string): Promise<AcpAuthenticateResult> {
    const params: AcpAuthenticateParams = { token };
    const result = await this.sendRequest<AcpAuthenticateResult>('authenticate', params);
    
    if (result.authenticated) {
      this.authenticated = true;
      console.log(`[AcpClient:${this.agentId}] Authenticated successfully`);
    } else {
      console.log(`[AcpClient:${this.agentId}] Auth required, URL:`, result.authUrl);
    }
    
    return result;
  }

  /**
   * Create a new session.
   */
  async sessionNew(sessionId?: string): Promise<AcpSessionNewResult> {
    const params: AcpSessionNewParams = { sessionId };
    return this.sendRequest<AcpSessionNewResult>('session/new', params);
  }

  /**
   * Send a prompt to an active session.
   */
  async sessionPrompt(sessionId: string, prompt: string): Promise<void> {
    const params: AcpSessionPromptParams = { sessionId, prompt };
    await this.sendRequest<void>('session/prompt', params);
  }

  /**
   * Cancel an active operation.
   */
  async sessionCancel(sessionId: string): Promise<void> {
    const params: AcpSessionCancelParams = { sessionId };
    await this.sendRequest<void>('session/cancel', params);
  }

  /**
   * Shutdown the agent gracefully.
   */
  async shutdown(): Promise<void> {
    if (!this.process) return;

    try {
      await this.sendRequest<void>('shutdown');
    } catch (error) {
      console.warn(`[AcpClient:${this.agentId}] Shutdown request failed:`, error);
    }

    // Give it a moment to exit gracefully
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Force kill if still running
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.initialized = false;
    this.authenticated = false;
    
    console.log(`[AcpClient:${this.agentId}] Shutdown complete`);
  }

  /**
   * Kill the agent process immediately.
   */
  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.initialized = false;
    this.authenticated = false;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Agent process killed'));
    }
    this.pendingRequests.clear();
  }
}
