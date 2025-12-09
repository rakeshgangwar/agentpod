/**
 * Agent Auth Token Model
 * 
 * Manages encrypted OAuth tokens for AI agents (Claude Code, Gemini CLI, etc.)
 */

import { db } from '../db/index.ts';
import { nanoid } from 'nanoid';
import { encrypt, decrypt } from '../utils/encryption.ts';

// =============================================================================
// Types
// =============================================================================

export type AgentId = 'opencode' | 'claude-code' | 'gemini-cli' | 'qwen-code' | 'codex';

export interface AgentAuthToken {
  id: string;
  userId: string;
  agentId: AgentId;
  accessToken: string | null;  // Decrypted
  refreshToken: string | null; // Decrypted
  tokenType: string;
  expiresAt: string | null;
  scopes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveAgentAuthTokenInput {
  userId: string;
  agentId: AgentId;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
  scopes?: string;
}

// =============================================================================
// Database Row Mapping
// =============================================================================

interface AgentAuthTokenRow {
  id: string;
  user_id: string;
  agent_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_type: string;
  expires_at: string | null;
  scopes: string | null;
  created_at: string;
  updated_at: string;
}

async function rowToAgentAuthToken(row: AgentAuthTokenRow): Promise<AgentAuthToken> {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id as AgentId,
    accessToken: row.access_token_encrypted ? await decrypt(row.access_token_encrypted) : null,
    refreshToken: row.refresh_token_encrypted ? await decrypt(row.refresh_token_encrypted) : null,
    tokenType: row.token_type,
    expiresAt: row.expires_at,
    scopes: row.scopes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get agent auth token for a user and agent
 */
export async function getAgentAuthToken(userId: string, agentId: AgentId): Promise<AgentAuthToken | null> {
  const row = db.query(`
    SELECT * FROM agent_auth_tokens 
    WHERE user_id = $userId AND agent_id = $agentId
  `).get({ $userId: userId, $agentId: agentId }) as AgentAuthTokenRow | null;
  
  return row ? await rowToAgentAuthToken(row) : null;
}

/**
 * Save or update agent auth token
 */
export async function saveAgentAuthToken(input: SaveAgentAuthTokenInput): Promise<AgentAuthToken> {
  const existing = await getAgentAuthToken(input.userId, input.agentId);
  
  // Encrypt tokens
  const accessTokenEncrypted = input.accessToken ? await encrypt(input.accessToken) : null;
  const refreshTokenEncrypted = input.refreshToken ? await encrypt(input.refreshToken) : null;
  
  if (existing) {
    // Update existing
    const updates: string[] = [];
    const params: Record<string, unknown> = {
      $userId: input.userId,
      $agentId: input.agentId,
    };
    
    if (input.accessToken !== undefined) {
      updates.push('access_token_encrypted = $accessToken');
      params.$accessToken = accessTokenEncrypted;
    }
    if (input.refreshToken !== undefined) {
      updates.push('refresh_token_encrypted = $refreshToken');
      params.$refreshToken = refreshTokenEncrypted;
    }
    if (input.tokenType !== undefined) {
      updates.push('token_type = $tokenType');
      params.$tokenType = input.tokenType;
    }
    if (input.expiresAt !== undefined) {
      updates.push('expires_at = $expiresAt');
      params.$expiresAt = input.expiresAt;
    }
    if (input.scopes !== undefined) {
      updates.push('scopes = $scopes');
      params.$scopes = input.scopes;
    }
    
    updates.push("updated_at = datetime('now')");
    
    const sql = `UPDATE agent_auth_tokens SET ${updates.join(', ')} WHERE user_id = $userId AND agent_id = $agentId`;
    db.query(sql).run(params as Record<string, string | number | null>);
    
    return (await getAgentAuthToken(input.userId, input.agentId))!;
  } else {
    // Insert new
    const id = nanoid();
    
    db.query(`
      INSERT INTO agent_auth_tokens (
        id, user_id, agent_id, 
        access_token_encrypted, refresh_token_encrypted,
        token_type, expires_at, scopes
      ) VALUES (
        $id, $userId, $agentId,
        $accessToken, $refreshToken,
        $tokenType, $expiresAt, $scopes
      )
    `).run({
      $id: id,
      $userId: input.userId,
      $agentId: input.agentId,
      $accessToken: accessTokenEncrypted,
      $refreshToken: refreshTokenEncrypted,
      $tokenType: input.tokenType || 'Bearer',
      $expiresAt: input.expiresAt || null,
      $scopes: input.scopes || null,
    });
    
    return (await getAgentAuthToken(input.userId, input.agentId))!;
  }
}

/**
 * Delete agent auth token
 */
export function deleteAgentAuthToken(userId: string, agentId: AgentId): boolean {
  const result = db.query(`
    DELETE FROM agent_auth_tokens 
    WHERE user_id = $userId AND agent_id = $agentId
  `).run({ $userId: userId, $agentId: agentId });
  
  return result.changes > 0;
}

/**
 * Check if agent is authenticated for a user
 */
export async function isAgentAuthenticated(userId: string, agentId: AgentId): Promise<boolean> {
  const token = await getAgentAuthToken(userId, agentId);
  
  if (!token || !token.accessToken) {
    return false;
  }
  
  // Check if token is expired
  if (token.expiresAt) {
    const expiresAt = new Date(token.expiresAt);
    if (expiresAt < new Date()) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: AgentAuthToken): boolean {
  if (!token.expiresAt) {
    return false;
  }
  
  const expiresAt = new Date(token.expiresAt);
  // Consider expired if within 5 minutes of expiration
  const bufferMs = 5 * 60 * 1000;
  return expiresAt.getTime() - bufferMs < Date.now();
}

/**
 * Get environment variables to inject for an agent
 */
export function getEnvVarsForAgent(agentId: AgentId, accessToken: string): Record<string, string> {
  switch (agentId) {
    case 'claude-code':
      return {
        ANTHROPIC_API_KEY: accessToken,
      };
    case 'gemini-cli':
      return {
        GOOGLE_API_KEY: accessToken,
      };
    case 'qwen-code':
      return {
        ALIBABA_API_KEY: accessToken,
      };
    case 'codex':
      return {
        OPENAI_API_KEY: accessToken,
      };
    case 'opencode':
    default:
      return {}; // OpenCode doesn't need auth tokens
  }
}

/**
 * Get all authenticated agents for a user
 */
export async function getAuthenticatedAgents(userId: string): Promise<AgentId[]> {
  const rows = db.query(`
    SELECT agent_id FROM agent_auth_tokens 
    WHERE user_id = $userId AND access_token_encrypted IS NOT NULL
  `).all({ $userId: userId }) as Array<{ agent_id: string }>;
  
  const authenticated: AgentId[] = [];
  
  for (const row of rows) {
    const isAuth = await isAgentAuthenticated(userId, row.agent_id as AgentId);
    if (isAuth) {
      authenticated.push(row.agent_id as AgentId);
    }
  }
  
  return authenticated;
}

/**
 * List all agent tokens for a user (without decrypted tokens)
 */
export function listAgentAuthTokens(userId: string): Array<{
  agentId: AgentId;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  expiresAt: string | null;
  updatedAt: string;
}> {
  const rows = db.query(`
    SELECT agent_id, access_token_encrypted, refresh_token_encrypted, expires_at, updated_at
    FROM agent_auth_tokens 
    WHERE user_id = $userId
  `).all({ $userId: userId }) as Array<{
    agent_id: string;
    access_token_encrypted: string | null;
    refresh_token_encrypted: string | null;
    expires_at: string | null;
    updated_at: string;
  }>;
  
  return rows.map(row => ({
    agentId: row.agent_id as AgentId,
    hasAccessToken: !!row.access_token_encrypted,
    hasRefreshToken: !!row.refresh_token_encrypted,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  }));
}
