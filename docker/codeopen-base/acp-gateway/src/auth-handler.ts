/**
 * Auth Handler
 * 
 * Handles authentication flows for agents that require OAuth or API keys.
 */

import type { AgentId, AuthInitResponse, AuthStatusResponse } from './types.ts';
import { eventEmitter } from './event-emitter.ts';

interface AuthState {
  agentId: AgentId;
  authenticated: boolean;
  authUrl?: string;
  deviceCode?: string;
  userCode?: string;
  expiresAt?: Date;
  token?: string;
}

/**
 * Auth Handler for managing agent authentication.
 */
export class AuthHandler {
  private authStates: Map<AgentId, AuthState> = new Map();

  /**
   * Initialize authentication for an agent.
   * Returns auth URL or device code for user to complete.
   */
  async initializeAuth(agentId: AgentId): Promise<AuthInitResponse> {
    console.log(`[AuthHandler] Initializing auth for: ${agentId}`);
    
    // Get existing state or create new
    let state = this.authStates.get(agentId);
    
    if (!state) {
      state = {
        agentId,
        authenticated: false,
      };
      this.authStates.set(agentId, state);
    }
    
    // If already authenticated, return success
    if (state.authenticated && state.token) {
      return {
        message: 'Already authenticated',
      };
    }
    
    // Return current auth state (URL, device code, etc.)
    return {
      authUrl: state.authUrl,
      deviceCode: state.deviceCode,
      userCode: state.userCode,
      expiresIn: state.expiresAt 
        ? Math.max(0, Math.floor((state.expiresAt.getTime() - Date.now()) / 1000))
        : undefined,
      message: state.authUrl ? 'Please complete authentication' : 'Authentication not started',
    };
  }

  /**
   * Get authentication status for an agent.
   */
  getAuthStatus(agentId: AgentId): AuthStatusResponse {
    const state = this.authStates.get(agentId);
    
    if (!state) {
      return { authenticated: false };
    }
    
    return {
      authenticated: state.authenticated,
      expiresAt: state.expiresAt?.toISOString(),
    };
  }

  /**
   * Handle auth required notification from agent.
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
      : undefined;
    
    this.authStates.set(agentId, {
      agentId,
      authenticated: false,
      authUrl,
      deviceCode,
      userCode,
      expiresAt,
    });
    
    // Emit event for frontend
    eventEmitter.emitAuthRequired(agentId, authUrl, deviceCode, userCode, expiresIn);
  }

  /**
   * Handle successful authentication.
   */
  handleAuthComplete(agentId: AgentId, token?: string): void {
    console.log(`[AuthHandler] Auth complete for: ${agentId}`);
    
    const existing = this.authStates.get(agentId);
    
    this.authStates.set(agentId, {
      agentId,
      authenticated: true,
      token,
      expiresAt: existing?.expiresAt,
    });
    
    // Emit event for frontend
    eventEmitter.emitAuthComplete(agentId);
  }

  /**
   * Store a token for an agent.
   */
  setToken(agentId: AgentId, token: string, expiresIn?: number): void {
    const existing = this.authStates.get(agentId);
    
    this.authStates.set(agentId, {
      agentId,
      authenticated: true,
      token,
      expiresAt: expiresIn 
        ? new Date(Date.now() + expiresIn * 1000)
        : existing?.expiresAt,
    });
  }

  /**
   * Get the token for an agent.
   */
  getToken(agentId: AgentId): string | undefined {
    const state = this.authStates.get(agentId);
    
    // Check if token is expired
    if (state?.expiresAt && state.expiresAt < new Date()) {
      console.log(`[AuthHandler] Token expired for: ${agentId}`);
      this.authStates.delete(agentId);
      return undefined;
    }
    
    return state?.token;
  }

  /**
   * Check if an agent is authenticated.
   */
  isAuthenticated(agentId: AgentId): boolean {
    const state = this.authStates.get(agentId);
    
    if (!state?.authenticated) return false;
    
    // Check if token is expired
    if (state.expiresAt && state.expiresAt < new Date()) {
      this.authStates.delete(agentId);
      return false;
    }
    
    return true;
  }

  /**
   * Clear authentication for an agent.
   */
  clearAuth(agentId: AgentId): void {
    this.authStates.delete(agentId);
    console.log(`[AuthHandler] Cleared auth for: ${agentId}`);
  }

  /**
   * Get all authenticated agents.
   */
  getAuthenticatedAgents(): AgentId[] {
    const authenticated: AgentId[] = [];
    
    for (const [agentId, state] of this.authStates) {
      if (state.authenticated) {
        authenticated.push(agentId);
      }
    }
    
    return authenticated;
  }
}

// Singleton instance
export const authHandler = new AuthHandler();
