/**
 * Chat Message Model
 * Stores message content in raw format from the source (OpenCode or ACP)
 * Supports streaming status and token tracking
 */

import { db } from '../db/index.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('chat-message-model');

// =============================================================================
// Types
// =============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'streaming' | 'complete' | 'error' | 'cancelled';

export interface ChatMessage {
  id: string;
  sessionId: string;
  
  // External reference
  externalMessageId?: string;
  
  // Message content (raw format from source)
  role: MessageRole;
  content: unknown;  // JSON: raw message parts/content
  toolCalls?: unknown;  // JSON: tool invocations
  toolResults?: unknown;  // JSON: tool results
  thinking?: unknown;  // JSON: reasoning output
  
  // Model info
  modelProvider?: string;
  modelId?: string;
  agentId?: string;  // For ACP: which agent responded
  
  // Token usage
  inputTokens?: number;
  outputTokens?: number;
  
  // Message status
  status: MessageStatus;
  errorMessage?: string;
  
  // Timestamps
  createdAt: string;
  completedAt?: string;
}

export interface CreateChatMessageInput {
  sessionId: string;
  externalMessageId?: string;
  role: MessageRole;
  content: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  thinking?: unknown;
  modelProvider?: string;
  modelId?: string;
  agentId?: string;
  inputTokens?: number;
  outputTokens?: number;
  status?: MessageStatus;
}

export interface UpdateChatMessageInput {
  content?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  thinking?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  status?: MessageStatus;
  errorMessage?: string;
  completedAt?: string;
}

// Database row type
interface ChatMessageRow {
  id: string;
  session_id: string;
  external_message_id: string | null;
  role: string;
  content: string;
  tool_calls: string | null;
  tool_results: string | null;
  thinking: string | null;
  model_provider: string | null;
  model_id: string | null;
  agent_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    externalMessageId: row.external_message_id ?? undefined,
    role: row.role as MessageRole,
    content: JSON.parse(row.content),
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    toolResults: row.tool_results ? JSON.parse(row.tool_results) : undefined,
    thinking: row.thinking ? JSON.parse(row.thinking) : undefined,
    modelProvider: row.model_provider ?? undefined,
    modelId: row.model_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    status: row.status as MessageStatus,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    // If it's already a string, check if it's valid JSON
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new chat message
 */
export function createChatMessage(input: CreateChatMessageInput): ChatMessage {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO chat_messages (
      id, session_id, external_message_id, role, content, tool_calls,
      tool_results, thinking, model_provider, model_id, agent_id,
      input_tokens, output_tokens, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      input.externalMessageId ?? null,
      input.role,
      safeStringify(input.content),
      input.toolCalls ? safeStringify(input.toolCalls) : null,
      input.toolResults ? safeStringify(input.toolResults) : null,
      input.thinking ? safeStringify(input.thinking) : null,
      input.modelProvider ?? null,
      input.modelId ?? null,
      input.agentId ?? null,
      input.inputTokens ?? null,
      input.outputTokens ?? null,
      input.status ?? 'complete',
      now,
    ]
  );
  
  log.debug('Created chat message', { messageId: id, sessionId: input.sessionId, role: input.role });
  return getChatMessageById(id)!;
}

/**
 * Get a chat message by ID
 */
export function getChatMessageById(id: string): ChatMessage | null {
  const row = db.query<ChatMessageRow, [string]>(
    'SELECT * FROM chat_messages WHERE id = ?'
  ).get(id);
  
  return row ? rowToChatMessage(row) : null;
}

/**
 * Get a chat message by external message ID
 */
export function getChatMessageByExternalId(
  sessionId: string,
  externalMessageId: string
): ChatMessage | null {
  const row = db.query<ChatMessageRow, [string, string]>(
    'SELECT * FROM chat_messages WHERE session_id = ? AND external_message_id = ?'
  ).get(sessionId, externalMessageId);
  
  return row ? rowToChatMessage(row) : null;
}

/**
 * List messages for a session (paginated)
 */
export function listChatMessagesBySessionId(
  sessionId: string,
  options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }
): ChatMessage[] {
  let query = 'SELECT * FROM chat_messages WHERE session_id = ?';
  const params: (string | number)[] = [sessionId];
  
  const order = options?.order ?? 'asc';
  query += ` ORDER BY created_at ${order.toUpperCase()}`;
  
  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
    
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }
  }
  
  const rows = db.query<ChatMessageRow, (string | number)[]>(query).all(...params);
  return rows.map(rowToChatMessage);
}

/**
 * Get the most recent messages for a session
 */
export function getRecentMessages(sessionId: string, limit: number = 10): ChatMessage[] {
  const rows = db.query<ChatMessageRow, [string, number]>(
    `SELECT * FROM chat_messages 
     WHERE session_id = ? 
     ORDER BY created_at DESC 
     LIMIT ?`
  ).all(sessionId, limit);
  
  // Reverse to get chronological order
  return rows.reverse().map(rowToChatMessage);
}

/**
 * Update a chat message
 */
export function updateChatMessage(id: string, input: UpdateChatMessageInput): ChatMessage | null {
  const existing = getChatMessageById(id);
  if (!existing) return null;
  
  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (input.content !== undefined) {
    updates.push('content = ?');
    values.push(safeStringify(input.content));
  }
  if (input.toolCalls !== undefined) {
    updates.push('tool_calls = ?');
    values.push(input.toolCalls ? safeStringify(input.toolCalls) : null);
  }
  if (input.toolResults !== undefined) {
    updates.push('tool_results = ?');
    values.push(input.toolResults ? safeStringify(input.toolResults) : null);
  }
  if (input.thinking !== undefined) {
    updates.push('thinking = ?');
    values.push(input.thinking ? safeStringify(input.thinking) : null);
  }
  if (input.inputTokens !== undefined) {
    updates.push('input_tokens = ?');
    values.push(input.inputTokens ?? null);
  }
  if (input.outputTokens !== undefined) {
    updates.push('output_tokens = ?');
    values.push(input.outputTokens ?? null);
  }
  if (input.status !== undefined) {
    updates.push('status = ?');
    values.push(input.status);
  }
  if (input.errorMessage !== undefined) {
    updates.push('error_message = ?');
    values.push(input.errorMessage ?? null);
  }
  if (input.completedAt !== undefined) {
    updates.push('completed_at = ?');
    values.push(input.completedAt ?? null);
  }
  
  if (updates.length === 0) return existing;
  
  values.push(id);
  
  db.run(
    `UPDATE chat_messages SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  
  log.debug('Updated chat message', { messageId: id, updates: Object.keys(input) });
  return getChatMessageById(id);
}

/**
 * Mark message as complete
 */
export function completeMessage(
  id: string,
  inputTokens?: number,
  outputTokens?: number
): ChatMessage | null {
  return updateChatMessage(id, {
    status: 'complete',
    completedAt: new Date().toISOString(),
    inputTokens,
    outputTokens,
  });
}

/**
 * Mark message as error
 */
export function errorMessage(id: string, errorMessage: string): ChatMessage | null {
  return updateChatMessage(id, {
    status: 'error',
    errorMessage,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Delete a chat message
 */
export function deleteChatMessage(id: string): boolean {
  const result = db.run('DELETE FROM chat_messages WHERE id = ?', [id]);
  
  if (result.changes > 0) {
    log.debug('Deleted chat message', { messageId: id });
    return true;
  }
  return false;
}

/**
 * Delete all messages for a session
 */
export function deleteChatMessagesBySessionId(sessionId: string): number {
  const result = db.run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  
  if (result.changes > 0) {
    log.debug('Deleted session messages', { sessionId, count: result.changes });
  }
  return result.changes;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get or create a message by external ID
 * Used during sync to ensure we have a local record
 */
export function getOrCreateMessage(
  sessionId: string,
  externalMessageId: string,
  role: MessageRole,
  content: unknown
): ChatMessage {
  const existing = getChatMessageByExternalId(sessionId, externalMessageId);
  if (existing) return existing;
  
  return createChatMessage({
    sessionId,
    externalMessageId,
    role,
    content,
  });
}

/**
 * Get message count for a session
 */
export function getMessageCount(sessionId: string): number {
  const result = db.query<{ count: number }, [string]>(
    'SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?'
  ).get(sessionId);
  
  return result?.count ?? 0;
}

/**
 * Get total tokens for a session
 */
export function getSessionTokens(sessionId: string): { input: number; output: number } {
  const result = db.query<{ input_total: number; output_total: number }, [string]>(
    `SELECT 
      COALESCE(SUM(input_tokens), 0) as input_total,
      COALESCE(SUM(output_tokens), 0) as output_total
    FROM chat_messages 
    WHERE session_id = ?`
  ).get(sessionId);
  
  return {
    input: result?.input_total ?? 0,
    output: result?.output_total ?? 0,
  };
}
