/**
 * Chat Session Model
 * Manages chat session metadata for both OpenCode and ACP Gateway sessions
 * 
 * Sessions can come from two sources:
 * - opencode: Direct OpenCode API sessions
 * - acp_gateway: Multi-agent sessions via ACP Gateway
 */

import { db } from '../db/index.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('chat-session-model');

// =============================================================================
// Types
// =============================================================================

export type ChatSessionSource = 'opencode' | 'acp_gateway';
export type ChatSessionStatus = 'active' | 'archived' | 'deleted';

export interface ChatSession {
  id: string;
  sandboxId: string;
  userId: string;
  
  // Session source
  source: ChatSessionSource;
  
  // External references
  opencodeSessionId?: string;
  acpSessionId?: string;
  acpAgentId?: string;
  
  // Metadata
  title?: string;
  status: ChatSessionStatus;
  
  // Statistics
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  
  // Timestamps
  lastMessageAt?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChatSessionInput {
  sandboxId: string;
  userId: string;
  source: ChatSessionSource;
  opencodeSessionId?: string;
  acpSessionId?: string;
  acpAgentId?: string;
  title?: string;
}

export interface UpdateChatSessionInput {
  title?: string;
  status?: ChatSessionStatus;
  messageCount?: number;
  userMessageCount?: number;
  assistantMessageCount?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  lastMessageAt?: string;
  lastSyncedAt?: string;
}

// Database row type
interface ChatSessionRow {
  id: string;
  sandbox_id: string;
  user_id: string;
  source: string;
  opencode_session_id: string | null;
  acp_session_id: string | null;
  acp_agent_id: string | null;
  title: string | null;
  status: string;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  last_message_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    sandboxId: row.sandbox_id,
    userId: row.user_id,
    source: row.source as ChatSessionSource,
    opencodeSessionId: row.opencode_session_id ?? undefined,
    acpSessionId: row.acp_session_id ?? undefined,
    acpAgentId: row.acp_agent_id ?? undefined,
    title: row.title ?? undefined,
    status: row.status as ChatSessionStatus,
    messageCount: row.message_count,
    userMessageCount: row.user_message_count,
    assistantMessageCount: row.assistant_message_count,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    lastMessageAt: row.last_message_at ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new chat session
 */
export function createChatSession(input: CreateChatSessionInput): ChatSession {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO chat_sessions (
      id, sandbox_id, user_id, source, opencode_session_id, acp_session_id,
      acp_agent_id, title, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      id,
      input.sandboxId,
      input.userId,
      input.source,
      input.opencodeSessionId ?? null,
      input.acpSessionId ?? null,
      input.acpAgentId ?? null,
      input.title ?? null,
      now,
      now,
    ]
  );
  
  log.info('Created chat session', { sessionId: id, sandboxId: input.sandboxId, source: input.source });
  return getChatSessionById(id)!;
}

/**
 * Get a chat session by ID
 */
export function getChatSessionById(id: string): ChatSession | null {
  const row = db.query<ChatSessionRow, [string]>(
    'SELECT * FROM chat_sessions WHERE id = ?'
  ).get(id);
  
  return row ? rowToChatSession(row) : null;
}

/**
 * Get a chat session by OpenCode session ID
 */
export function getChatSessionByOpencodeId(
  sandboxId: string,
  opencodeSessionId: string
): ChatSession | null {
  const row = db.query<ChatSessionRow, [string, string]>(
    'SELECT * FROM chat_sessions WHERE sandbox_id = ? AND opencode_session_id = ?'
  ).get(sandboxId, opencodeSessionId);
  
  return row ? rowToChatSession(row) : null;
}

/**
 * Get a chat session by ACP session ID
 */
export function getChatSessionByAcpId(
  sandboxId: string,
  acpSessionId: string
): ChatSession | null {
  const row = db.query<ChatSessionRow, [string, string]>(
    'SELECT * FROM chat_sessions WHERE sandbox_id = ? AND acp_session_id = ?'
  ).get(sandboxId, acpSessionId);
  
  return row ? rowToChatSession(row) : null;
}

/**
 * List all chat sessions for a sandbox
 */
export function listChatSessionsBySandboxId(
  sandboxId: string,
  options?: { status?: ChatSessionStatus; limit?: number; offset?: number }
): ChatSession[] {
  let query = 'SELECT * FROM chat_sessions WHERE sandbox_id = ?';
  const params: (string | number)[] = [sandboxId];
  
  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }
  
  query += ' ORDER BY last_message_at DESC NULLS LAST, created_at DESC';
  
  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
    
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }
  }
  
  const rows = db.query<ChatSessionRow, (string | number)[]>(query).all(...params);
  return rows.map(rowToChatSession);
}

/**
 * List all chat sessions for a user
 */
export function listChatSessionsByUserId(
  userId: string,
  options?: { status?: ChatSessionStatus; limit?: number; offset?: number }
): ChatSession[] {
  let query = 'SELECT * FROM chat_sessions WHERE user_id = ?';
  const params: (string | number)[] = [userId];
  
  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }
  
  query += ' ORDER BY last_message_at DESC NULLS LAST, created_at DESC';
  
  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
    
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }
  }
  
  const rows = db.query<ChatSessionRow, (string | number)[]>(query).all(...params);
  return rows.map(rowToChatSession);
}

/**
 * Update a chat session
 */
export function updateChatSession(id: string, input: UpdateChatSessionInput): ChatSession | null {
  const existing = getChatSessionById(id);
  if (!existing) return null;
  
  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (input.title !== undefined) {
    updates.push('title = ?');
    values.push(input.title ?? null);
  }
  if (input.status !== undefined) {
    updates.push('status = ?');
    values.push(input.status);
  }
  if (input.messageCount !== undefined) {
    updates.push('message_count = ?');
    values.push(input.messageCount);
  }
  if (input.userMessageCount !== undefined) {
    updates.push('user_message_count = ?');
    values.push(input.userMessageCount);
  }
  if (input.assistantMessageCount !== undefined) {
    updates.push('assistant_message_count = ?');
    values.push(input.assistantMessageCount);
  }
  if (input.totalInputTokens !== undefined) {
    updates.push('total_input_tokens = ?');
    values.push(input.totalInputTokens);
  }
  if (input.totalOutputTokens !== undefined) {
    updates.push('total_output_tokens = ?');
    values.push(input.totalOutputTokens);
  }
  if (input.lastMessageAt !== undefined) {
    updates.push('last_message_at = ?');
    values.push(input.lastMessageAt ?? null);
  }
  if (input.lastSyncedAt !== undefined) {
    updates.push('last_synced_at = ?');
    values.push(input.lastSyncedAt ?? null);
  }
  
  if (updates.length === 0) return existing;
  
  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  db.run(
    `UPDATE chat_sessions SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  
  log.debug('Updated chat session', { sessionId: id, updates: Object.keys(input) });
  return getChatSessionById(id);
}

/**
 * Increment message counts
 */
export function incrementMessageCount(
  id: string,
  role: 'user' | 'assistant',
  inputTokens?: number,
  outputTokens?: number
): void {
  const roleColumn = role === 'user' ? 'user_message_count' : 'assistant_message_count';
  const now = new Date().toISOString();
  
  db.run(
    `UPDATE chat_sessions SET 
      message_count = message_count + 1,
      ${roleColumn} = ${roleColumn} + 1,
      total_input_tokens = total_input_tokens + ?,
      total_output_tokens = total_output_tokens + ?,
      last_message_at = ?,
      updated_at = ?
    WHERE id = ?`,
    [inputTokens ?? 0, outputTokens ?? 0, now, now, id]
  );
}

/**
 * Update last synced timestamp
 */
export function touchChatSessionSync(id: string): void {
  const now = new Date().toISOString();
  db.run(
    'UPDATE chat_sessions SET last_synced_at = ?, updated_at = ? WHERE id = ?',
    [now, now, id]
  );
}

/**
 * Archive a chat session (soft delete)
 */
export function archiveChatSession(id: string): ChatSession | null {
  return updateChatSession(id, { status: 'archived' });
}

/**
 * Delete a chat session (hard delete)
 */
export function deleteChatSession(id: string): boolean {
  const result = db.run('DELETE FROM chat_sessions WHERE id = ?', [id]);
  
  if (result.changes > 0) {
    log.info('Deleted chat session', { sessionId: id });
    return true;
  }
  return false;
}

/**
 * Delete all chat sessions for a sandbox
 */
export function deleteChatSessionsBySandboxId(sandboxId: string): number {
  const result = db.run('DELETE FROM chat_sessions WHERE sandbox_id = ?', [sandboxId]);
  
  if (result.changes > 0) {
    log.info('Deleted sandbox chat sessions', { sandboxId, count: result.changes });
  }
  return result.changes;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get or create a chat session by OpenCode session ID
 * Used during sync to ensure we have a local record
 */
export function getOrCreateOpencodeSession(
  sandboxId: string,
  userId: string,
  opencodeSessionId: string,
  title?: string
): ChatSession {
  const existing = getChatSessionByOpencodeId(sandboxId, opencodeSessionId);
  if (existing) return existing;
  
  return createChatSession({
    sandboxId,
    userId,
    source: 'opencode',
    opencodeSessionId,
    title,
  });
}

/**
 * Get or create a chat session by ACP session ID
 * Used during sync to ensure we have a local record
 */
export function getOrCreateAcpSession(
  sandboxId: string,
  userId: string,
  acpSessionId: string,
  acpAgentId?: string,
  title?: string
): ChatSession {
  const existing = getChatSessionByAcpId(sandboxId, acpSessionId);
  if (existing) return existing;
  
  return createChatSession({
    sandboxId,
    userId,
    source: 'acp_gateway',
    acpSessionId,
    acpAgentId,
    title,
  });
}

/**
 * Get session statistics for a sandbox
 */
export function getChatSessionStats(sandboxId: string): {
  total: number;
  active: number;
  archived: number;
  totalMessages: number;
  totalTokens: number;
} {
  const result = db.query<{
    total: number;
    active: number;
    archived: number;
    total_messages: number;
    total_tokens: number;
  }, [string]>(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
      SUM(message_count) as total_messages,
      SUM(total_input_tokens + total_output_tokens) as total_tokens
    FROM chat_sessions 
    WHERE sandbox_id = ?
  `).get(sandboxId);
  
  return {
    total: result?.total ?? 0,
    active: result?.active ?? 0,
    archived: result?.archived ?? 0,
    totalMessages: result?.total_messages ?? 0,
    totalTokens: result?.total_tokens ?? 0,
  };
}
