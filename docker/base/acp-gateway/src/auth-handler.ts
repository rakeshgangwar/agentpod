/**
 * Auth Handler
 * 
 * Handles authentication flows for agents that require OAuth or API keys.
 * Supports multiple authentication patterns:
 * - URL-first (Claude Code style): User visits URL, gets code, enters in app
 * - Code-first (GitHub Copilot style): App shows code, user enters on URL
 * - PKCE OAuth (Anthropic): OAuth 2.0 with PKCE code challenge
 */

import type { 
  AgentId, 
  AgentAuthState, 
  AgentAuthStatus,
  AgentAuthFlowType,
  AuthInitResponse, 
  AuthCompleteRequest,
  AuthStatusResponse 
} from './types.ts';
import { agentRegistry } from './agent-registry.ts';
import { eventEmitter } from './event-emitter.ts';

// =============================================================================
// Anthropic OAuth Constants (from opencode-anthropic-auth)
// =============================================================================

const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_CONSOLE_AUTH_URL = 'https://console.anthropic.com/oauth/authorize';
const ANTHROPIC_CLAUDE_AI_AUTH_URL = 'https://claude.ai/oauth/authorize';
const ANTHROPIC_TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference';
const ANTHROPIC_API_KEY_ENDPOINT = 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key';

// Required beta headers when using Anthropic OAuth tokens
const ANTHROPIC_OAUTH_BETA_HEADERS = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
];

interface TokenEntry {
  token: string;
  expiresAt: Date;
}

interface PollState {
  intervalId: ReturnType<typeof setInterval>;
  attempts: number;
}

interface PKCEPair {
  challenge: string;
  verifier: string;
}

interface AnthropicPKCEState {
  verifier: string;
  mode: 'max' | 'console';
  expiresAt: Date;
}

/**
 * Auth Handler for managing agent authentication.
 */
export class AuthHandler {
  private authStates: Map<AgentId, AgentAuthState> = new Map();
  private tokens: Map<AgentId, TokenEntry> = new Map();
  private pollStates: Map<AgentId, PollState> = new Map();
  private anthropicPKCEStates: Map<string, AnthropicPKCEState> = new Map();

  // Default expiration times
  private readonly DEFAULT_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly AUTH_FLOW_EXPIRY = 10 * 60 * 1000; // 10 minutes
  private readonly POLL_INTERVAL = 5000; // 5 seconds
  private readonly MAX_POLL_ATTEMPTS = 120; // 10 minutes at 5s intervals

  /**
   * Initialize authentication for an agent.
   * Returns auth URL or device code for user to complete.
   */
  async initializeAuth(agentId: AgentId): Promise<AuthInitResponse> {
    console.log(`[AuthHandler] Initializing auth for: ${agentId}`);
    
    const config = agentRegistry.getAgent(agentId);
    if (!config) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    // If already authenticated, return success
    if (this.isAuthenticated(agentId)) {
      return {
        flowType: config.authFlowType || 'api_key',
        expiresIn: 0,
        message: 'Already authenticated',
      };
    }

    // Handle different auth types
    switch (config.authType) {
      case 'none':
        return {
          flowType: 'api_key',
          expiresIn: 0,
          message: 'No authentication required',
        };

      case 'api_key':
        return this.initApiKeyAuth(agentId, config);

      case 'device_flow':
      case 'oauth':
        return this.initDeviceFlowAuth(agentId, config);

      case 'pkce_oauth':
        // Anthropic PKCE OAuth flow
        return this.initAnthropicPKCEAuth(agentId, 'console');

      default:
        throw new Error(`Unsupported auth type: ${config.authType}`);
    }
  }

  /**
   * Initialize API key authentication.
   */
  private initApiKeyAuth(agentId: AgentId, config: { authUrl?: string; authProvider?: string }): AuthInitResponse {
    const state: AgentAuthState = {
      agentId,
      status: 'pending',
      flowType: 'api_key',
      authUrl: config.authUrl,
    };
    this.authStates.set(agentId, state);

    return {
      flowType: 'api_key',
      authUrl: config.authUrl,
      expiresIn: this.AUTH_FLOW_EXPIRY / 1000,
      message: `Enter your ${config.authProvider || 'API'} key`,
    };
  }

  /**
   * Initialize device flow authentication.
   */
  private async initDeviceFlowAuth(
    agentId: AgentId, 
    config: { authFlowType?: AgentAuthFlowType; authUrl?: string; authProvider?: string }
  ): Promise<AuthInitResponse> {
    const flowType = config.authFlowType || 'url_first';
    const expiresAt = new Date(Date.now() + this.AUTH_FLOW_EXPIRY);

    if (flowType === 'url_first') {
      // Claude Code style: User visits URL, gets code, enters in app
      const authUrl = config.authUrl || await this.generateAuthUrl(agentId, config);
      
      const state: AgentAuthState = {
        agentId,
        status: 'pending',
        flowType: 'url_first',
        authUrl,
        expiresAt,
      };
      this.authStates.set(agentId, state);

      return {
        flowType: 'url_first',
        authUrl,
        expiresIn: this.AUTH_FLOW_EXPIRY / 1000,
        message: 'Sign in and paste the code back here',
      };
    } else {
      // GitHub Copilot style: App shows code, user enters on URL
      const { userCode, verificationUrl } = await this.generateDeviceCode(agentId, config);
      
      const state: AgentAuthState = {
        agentId,
        status: 'pending',
        flowType: 'code_first',
        userCode,
        verificationUrl,
        expiresAt,
      };
      this.authStates.set(agentId, state);

      // Start polling for completion
      this.startPolling(agentId);

      return {
        flowType: 'code_first',
        userCode,
        verificationUrl,
        expiresIn: this.AUTH_FLOW_EXPIRY / 1000,
        message: 'Enter this code on the verification page',
      };
    }
  }

  /**
   * Complete authentication with provided credentials.
   */
  async completeAuth(agentId: AgentId, request: AuthCompleteRequest): Promise<void> {
    console.log(`[AuthHandler] Completing auth for: ${agentId}`);

    const config = agentRegistry.getAgent(agentId);
    if (!config) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const state = this.authStates.get(agentId);

    // Handle API key authentication
    if (config.authType === 'api_key' || state?.flowType === 'api_key') {
      if (!request.token) {
        throw new Error('API key is required');
      }
      
      // Validate API key format (basic validation)
      if (request.token.length < 10) {
        throw new Error('Invalid API key format');
      }

      this.setToken(agentId, request.token);
      this.updateAuthState(agentId, 'completed');
      eventEmitter.emitAuthComplete(agentId);
      return;
    }

    // Handle URL-first device flow (user provided code from browser)
    if (state?.flowType === 'url_first') {
      if (!request.code) {
        throw new Error('Code is required');
      }

      // Exchange code for token
      const token = await this.exchangeCodeForToken(agentId, config, request.code);
      this.setToken(agentId, token);
      this.updateAuthState(agentId, 'completed');
      eventEmitter.emitAuthComplete(agentId);
      return;
    }

    // Handle PKCE OAuth flow (Anthropic)
    if (state?.flowType === 'pkce_oauth') {
      if (!request.code) {
        throw new Error('Authorization code is required');
      }

      // Complete the PKCE OAuth flow
      await this.completeAnthropicPKCEAuth(agentId, request.code);
      return;
    }

    // Code-first flow completes automatically via polling
    throw new Error('Invalid auth state - code_first flow completes via polling');
  }

  /**
   * Get authentication status for an agent.
   */
  getAuthStatus(agentId: AgentId): AuthStatusResponse {
    const token = this.tokens.get(agentId);
    
    if (!token) {
      return { authenticated: false };
    }
    
    // Check expiration
    if (token.expiresAt < new Date()) {
      this.tokens.delete(agentId);
      return { authenticated: false };
    }
    
    return {
      authenticated: true,
      expiresAt: token.expiresAt.toISOString(),
    };
  }

  /**
   * Get the current auth state for an agent.
   */
  getAuthState(agentId: AgentId): AgentAuthState | undefined {
    return this.authStates.get(agentId);
  }

  /**
   * Handle auth required notification from agent subprocess.
   * This is called when an agent process reports it needs authentication.
   */
  handleAuthRequired(
    agentId: AgentId,
    authUrl?: string,
    deviceCode?: string,
    userCode?: string,
    expiresIn?: number
  ): void {
    console.log(`[AuthHandler] Auth required for ${agentId}: ${authUrl || deviceCode}`);
    
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000)
      : new Date(Date.now() + this.AUTH_FLOW_EXPIRY);

    // Determine flow type based on what was provided
    const flowType: AgentAuthFlowType = userCode ? 'code_first' : 'url_first';
    
    const state: AgentAuthState = {
      agentId,
      status: 'pending',
      flowType,
      authUrl,
      userCode,
      verificationUrl: deviceCode, // deviceCode might be the verification URL
      expiresAt,
    };
    
    this.authStates.set(agentId, state);
    
    // Emit event for frontend
    eventEmitter.emitAuthRequired(agentId, authUrl, deviceCode, userCode, expiresIn);

    // Start polling if code_first flow
    if (flowType === 'code_first') {
      this.startPolling(agentId);
    }
  }

  /**
   * Handle successful authentication callback from agent.
   */
  handleAuthComplete(agentId: AgentId, token?: string): void {
    console.log(`[AuthHandler] Auth complete for: ${agentId}`);
    
    // Stop any polling
    this.stopPolling(agentId);
    
    if (token) {
      this.setToken(agentId, token);
    }
    
    this.updateAuthState(agentId, 'completed');
    eventEmitter.emitAuthComplete(agentId);
  }

  /**
   * Store a token for an agent.
   */
  setToken(agentId: AgentId, token: string, expiresIn?: number): void {
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000)
      : new Date(Date.now() + this.DEFAULT_TOKEN_EXPIRY);
    
    this.tokens.set(agentId, { token, expiresAt });
    console.log(`[AuthHandler] Token stored for: ${agentId} (expires: ${expiresAt.toISOString()})`);
  }

  /**
   * Get the token for an agent.
   */
  getToken(agentId: AgentId): string | undefined {
    const entry = this.tokens.get(agentId);
    
    if (!entry) return undefined;
    
    // Check if token is expired
    if (entry.expiresAt < new Date()) {
      console.log(`[AuthHandler] Token expired for: ${agentId}`);
      this.tokens.delete(agentId);
      return undefined;
    }
    
    return entry.token;
  }

  /**
   * Check if an agent is authenticated.
   */
  isAuthenticated(agentId: AgentId): boolean {
    return this.getToken(agentId) !== undefined;
  }

  /**
   * Clear authentication for an agent.
   */
  clearAuth(agentId: AgentId): void {
    this.stopPolling(agentId);
    this.authStates.delete(agentId);
    this.tokens.delete(agentId);
    console.log(`[AuthHandler] Cleared auth for: ${agentId}`);
  }

  /**
   * Get all authenticated agents.
   */
  getAuthenticatedAgents(): AgentId[] {
    const authenticated: AgentId[] = [];
    
    for (const [agentId] of this.tokens) {
      if (this.isAuthenticated(agentId)) {
        authenticated.push(agentId);
      }
    }
    
    return authenticated;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Update auth state status.
   */
  private updateAuthState(agentId: AgentId, status: AgentAuthStatus): void {
    const state = this.authStates.get(agentId);
    if (state) {
      state.status = status;
      this.authStates.set(agentId, state);
    }
  }

  /**
   * Generate an auth URL for URL-first flow.
   * This may involve starting the agent to get its auth URL.
   */
  private async generateAuthUrl(
    _agentId: AgentId, 
    config: { authUrl?: string; authProvider?: string }
  ): Promise<string> {
    // For most providers, the auth URL is known in advance
    if (config.authUrl) {
      return config.authUrl;
    }

    // Provider-specific URL generation
    switch (config.authProvider) {
      case 'anthropic':
        return 'https://console.anthropic.com/settings/workspaces';
      case 'google':
        return 'https://accounts.google.com/o/oauth2/auth';
      case 'openai':
        return 'https://platform.openai.com/api-keys';
      default:
        throw new Error(`No auth URL available for provider: ${config.authProvider}`);
    }
  }

  /**
   * Generate a device code for code-first flow.
   * This typically involves an API call to the provider.
   */
  private async generateDeviceCode(
    _agentId: AgentId, 
    config: { authProvider?: string }
  ): Promise<{ userCode: string; verificationUrl: string }> {
    // This is a placeholder - actual implementation would call provider's API
    // For now, generate a mock code
    const userCode = this.generateRandomCode();
    
    // Provider-specific verification URLs
    let verificationUrl: string;
    switch (config.authProvider) {
      case 'google':
        verificationUrl = 'https://google.com/device';
        break;
      case 'github':
        verificationUrl = 'https://github.com/login/device';
        break;
      default:
        verificationUrl = `https://${config.authProvider || 'auth'}.example.com/device`;
    }

    return { userCode, verificationUrl };
  }

  /**
   * Exchange a code for an access token.
   * This is used in URL-first flow when user provides the code.
   */
  private async exchangeCodeForToken(
    _agentId: AgentId, 
    _config: { authProvider?: string }, 
    code: string
  ): Promise<string> {
    // This is a placeholder - actual implementation would exchange code for token
    // For now, we trust the code as the token (for testing)
    console.log(`[AuthHandler] Exchanging code for token: ${code.substring(0, 8)}...`);
    return code;
  }

  /**
   * Generate a random device code.
   */
  private generateRandomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Start polling for auth completion (for code-first flow).
   */
  private startPolling(agentId: AgentId): void {
    // Stop any existing polling
    this.stopPolling(agentId);

    const pollState: PollState = {
      intervalId: setInterval(() => this.pollAuthStatus(agentId), this.POLL_INTERVAL),
      attempts: 0,
    };

    this.pollStates.set(agentId, pollState);
    console.log(`[AuthHandler] Started polling for: ${agentId}`);
  }

  /**
   * Stop polling for an agent.
   */
  private stopPolling(agentId: AgentId): void {
    const pollState = this.pollStates.get(agentId);
    if (pollState) {
      clearInterval(pollState.intervalId);
      this.pollStates.delete(agentId);
      console.log(`[AuthHandler] Stopped polling for: ${agentId}`);
    }
  }

  /**
   * Poll for auth status (used in code-first flow).
   */
  private async pollAuthStatus(agentId: AgentId): Promise<void> {
    const pollState = this.pollStates.get(agentId);
    if (!pollState) return;

    pollState.attempts++;

    // Check if max attempts reached
    if (pollState.attempts >= this.MAX_POLL_ATTEMPTS) {
      console.log(`[AuthHandler] Polling timeout for: ${agentId}`);
      this.stopPolling(agentId);
      this.updateAuthState(agentId, 'failed');
      return;
    }

    // Check if auth state expired
    const state = this.authStates.get(agentId);
    if (state?.expiresAt && state.expiresAt < new Date()) {
      console.log(`[AuthHandler] Auth flow expired for: ${agentId}`);
      this.stopPolling(agentId);
      this.updateAuthState(agentId, 'failed');
      return;
    }

    // In a real implementation, this would call the provider's API to check status
    // For now, we just wait for handleAuthComplete to be called
    console.log(`[AuthHandler] Polling attempt ${pollState.attempts} for: ${agentId}`);
  }

  // ==========================================================================
  // Anthropic PKCE OAuth Methods
  // ==========================================================================

  /**
   * Generate a PKCE code verifier and challenge pair.
   */
  private async generatePKCE(): Promise<PKCEPair> {
    // Generate a random 32-byte verifier
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Create SHA-256 hash of verifier for challenge
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const challenge = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return { verifier, challenge };
  }

  /**
   * Generate a random state string for OAuth flows.
   */
  private generateStateId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Initialize Anthropic PKCE OAuth flow.
   * @param agentId The agent to authenticate (usually 'claude-code')
   * @param mode 'max' for Claude Pro/Max subscription, 'console' for API Console
   */
  async initAnthropicPKCEAuth(
    agentId: AgentId,
    mode: 'max' | 'console' = 'console'
  ): Promise<AuthInitResponse> {
    console.log(`[AuthHandler] Initializing Anthropic PKCE OAuth for ${agentId} (mode: ${mode})`);

    // Generate PKCE pair
    const pkce = await this.generatePKCE();
    const stateId = this.generateStateId();

    // Store PKCE state for later verification
    this.anthropicPKCEStates.set(stateId, {
      verifier: pkce.verifier,
      mode,
      expiresAt: new Date(Date.now() + this.AUTH_FLOW_EXPIRY),
    });

    // Build authorization URL
    const authBaseUrl = mode === 'max' 
      ? ANTHROPIC_CLAUDE_AI_AUTH_URL 
      : ANTHROPIC_CONSOLE_AUTH_URL;

    const params = new URLSearchParams({
      client_id: ANTHROPIC_CLIENT_ID,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      response_type: 'code',
      scope: ANTHROPIC_SCOPES,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state: stateId,
    });

    const authUrl = `${authBaseUrl}?${params.toString()}`;

    // Update auth state
    const authState: AgentAuthState = {
      agentId,
      status: 'pending',
      flowType: 'pkce_oauth',
      authUrl,
      expiresAt: new Date(Date.now() + this.AUTH_FLOW_EXPIRY),
    };
    this.authStates.set(agentId, authState);

    const modeLabel = mode === 'max' 
      ? 'Claude Pro/Max' 
      : 'Anthropic Console';

    return {
      flowType: 'pkce_oauth',
      authUrl,
      expiresIn: this.AUTH_FLOW_EXPIRY / 1000,
      message: `Sign in with ${modeLabel}. After authorizing, paste the code back here.`,
      stateId,
      authMode: mode,
    };
  }

  /**
   * Complete Anthropic PKCE OAuth flow by exchanging the authorization code.
   * @param agentId The agent being authenticated
   * @param code The authorization code (format: "authcode#state" or just "authcode")
   * @param stateId Optional state ID if not included in code
   */
  async completeAnthropicPKCEAuth(
    agentId: AgentId,
    code: string,
    stateId?: string
  ): Promise<void> {
    console.log(`[AuthHandler] Completing Anthropic PKCE OAuth for ${agentId}`);

    // Parse code - Anthropic returns "authcode#state" format
    let authCode = code;
    let extractedStateId = stateId;
    
    if (code.includes('#')) {
      const parts = code.split('#');
      authCode = parts[0];
      extractedStateId = parts[1] || stateId;
    }

    if (!extractedStateId) {
      throw new Error('State ID is required for OAuth verification');
    }

    // Retrieve and validate PKCE state
    const pkceState = this.anthropicPKCEStates.get(extractedStateId);
    if (!pkceState) {
      throw new Error('OAuth session expired or not found. Please try again.');
    }

    if (pkceState.expiresAt < new Date()) {
      this.anthropicPKCEStates.delete(extractedStateId);
      throw new Error('OAuth session expired. Please try again.');
    }

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await fetch(ANTHROPIC_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: ANTHROPIC_CLIENT_ID,
          code: authCode,
          redirect_uri: ANTHROPIC_REDIRECT_URI,
          code_verifier: pkceState.verifier,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`[AuthHandler] Token exchange failed: ${errorText}`);
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json() as {
        access_token: string;
        token_type: string;
        expires_in?: number;
        refresh_token?: string;
        scope?: string;
      };

      console.log(`[AuthHandler] Token exchange successful for ${agentId}`);

      // For 'console' mode, create a permanent API key
      // For 'max' mode, use the access token directly (it provides free API access)
      let finalToken: string;
      let expiresIn: number | undefined;

      if (pkceState.mode === 'console') {
        // Create a permanent API key using the access token
        finalToken = await this.createAnthropicApiKey(tokenData.access_token);
        expiresIn = undefined; // API keys don't expire
        console.log(`[AuthHandler] Created permanent API key for ${agentId}`);
      } else {
        // Use access token directly for Max mode
        finalToken = tokenData.access_token;
        expiresIn = tokenData.expires_in;
        console.log(`[AuthHandler] Using OAuth access token for ${agentId} (Max mode)`);
      }

      // Store the token
      this.setToken(agentId, finalToken, expiresIn);
      this.updateAuthState(agentId, 'completed');
      eventEmitter.emitAuthComplete(agentId);

    } finally {
      // Clean up PKCE state
      this.anthropicPKCEStates.delete(extractedStateId);
    }
  }

  /**
   * Create a permanent API key from Anthropic OAuth access token.
   */
  private async createAnthropicApiKey(accessToken: string): Promise<string> {
    const response = await fetch(ANTHROPIC_API_KEY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'anthropic-beta': ANTHROPIC_OAUTH_BETA_HEADERS.join(','),
      },
      body: JSON.stringify({
        name: `CodeOpen - ${new Date().toISOString().split('T')[0]}`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AuthHandler] API key creation failed: ${errorText}`);
      throw new Error(`Failed to create API key: ${response.status}`);
    }

    const data = await response.json() as { api_key: string };
    return data.api_key;
  }

  /**
   * Get beta headers required for Anthropic OAuth token usage.
   */
  getAnthropicOAuthBetaHeaders(): string[] {
    return [...ANTHROPIC_OAUTH_BETA_HEADERS];
  }

  /**
   * Get environment variables with auth token for spawning an agent.
   */
  getAuthEnvVars(agentId: AgentId): Record<string, string> {
    const config = agentRegistry.getAgent(agentId);
    if (!config?.requiresAuth) return {};

    const token = this.getToken(agentId);
    if (!token) return {};

    // Map token to appropriate environment variable based on provider
    switch (config.authProvider) {
      case 'anthropic':
        return { ANTHROPIC_API_KEY: token };
      case 'google':
        return { GOOGLE_API_KEY: token };
      case 'openai':
        return { OPENAI_API_KEY: token };
      case 'mistral':
        return { MISTRAL_API_KEY: token };
      case 'moonshot':
        return { MOONSHOT_API_KEY: token };
      case 'alibaba':
        return { DASHSCOPE_API_KEY: token };
      default:
        return { AUTH_TOKEN: token };
    }
  }
}

// Singleton instance
export const authHandler = new AuthHandler();
