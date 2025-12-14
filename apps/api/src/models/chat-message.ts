/**
 * Chat Message Model
 * Stores message content in raw format from the source (OpenCode or ACP)
 * Supports streaming status and token tracking
 */

import { db } from '../db/drizzle';
import { chatMessages } from '../db/schema/chat';
import { eq, and, sql, asc, desc } from 'drizzle-orm';
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

// Database row type from Drizzle schema
type ChatMessageRow = typeof chatMessages.$inferSelect;

// =============================================================================
// Helpers
// =============================================================================

function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    externalMessageId: row.externalMessageId ?? undefined,
    role: row.role as MessageRole,
    content: row.content ? JSON.parse(row.content) : '',
    toolCalls: row.toolCalls ? JSON.parse(row.toolCalls) : undefined,
    toolResults: row.toolResults ? JSON.parse(row.toolResults) : undefined,
    thinking: row.thinking ? JSON.parse(row.thinking) : undefined,
    modelProvider: row.modelProvider ?? undefined,
    modelId: row.modelId ?? undefined,
    agentId: row.agentId ?? undefined,
    inputTokens: row.inputTokens ?? undefined,
    outputTokens: row.outputTokens ?? undefined,
    status: (row.status ?? 'complete') as MessageStatus,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? undefined,
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
export async function createChatMessage(input: CreateChatMessageInput): Promise<ChatMessage> {
  const id = crypto.randomUUID();
  const now = new Date();
  
  await db.insert(chatMessages).values({
    id,
    sessionId: input.sessionId,
    externalMessageId: input.externalMessageId ?? null,
    role: input.role,
    content: safeStringify(input.content),
    toolCalls: input.toolCalls ? safeStringify(input.toolCalls) : null,
    toolResults: input.toolResults ? safeStringify(input.toolResults) : null,
    thinking: input.thinking ? safeStringify(input.thinking) : null,
    modelProvider: input.modelProvider ?? null,
    modelId: input.modelId ?? null,
    agentId: input.agentId ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    status: input.status ?? 'complete',
    createdAt: now,
  });
  
  log.debug('Created chat message', { messageId: id, sessionId: input.sessionId, role: input.role });
  return (await getChatMessageById(id))!;
}

/**
 * Get a chat message by ID
 */
export async function getChatMessageById(id: string): Promise<ChatMessage | null> {
  const [row] = await db.select()
    .from(chatMessages)
    .where(eq(chatMessages.id, id));
  
  return row ? rowToChatMessage(row) : null;
}

/**
 * Get a chat message by external message ID
 */
export async function getChatMessageByExternalId(
  sessionId: string,
  externalMessageId: string
): Promise<ChatMessage | null> {
  const [row] = await db.select()
    .from(chatMessages)
    .where(and(
      eq(chatMessages.sessionId, sessionId),
      eq(chatMessages.externalMessageId, externalMessageId)
    ));
  
  return row ? rowToChatMessage(row) : null;
}

/**
 * List messages for a session (paginated)
 */
export async function listChatMessagesBySessionId(
  sessionId: string,
  options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }
): Promise<ChatMessage[]> {
  const order = options?.order ?? 'asc';
  
  let query = db.select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(order === 'asc' ? asc(chatMessages.createdAt) : desc(chatMessages.createdAt));
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }
  }
  
  const rows = await query;
  return rows.map(rowToChatMessage);
}

/**
 * Get the most recent messages for a session
 */
export async function getRecentMessages(sessionId: string, limit: number = 10): Promise<ChatMessage[]> {
  const rows = await db.select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  
  // Reverse to get chronological order
  return rows.reverse().map(rowToChatMessage);
}

/**
 * Update a chat message
 */
export async function updateChatMessage(id: string, input: UpdateChatMessageInput): Promise<ChatMessage | null> {
  const existing = await getChatMessageById(id);
  if (!existing) return null;
  
  const updates: Partial<typeof chatMessages.$inferInsert> = {};
  
  if (input.content !== undefined) {
    updates.content = safeStringify(input.content);
  }
  if (input.toolCalls !== undefined) {
    updates.toolCalls = input.toolCalls ? safeStringify(input.toolCalls) : null;
  }
  if (input.toolResults !== undefined) {
    updates.toolResults = input.toolResults ? safeStringify(input.toolResults) : null;
  }
  if (input.thinking !== undefined) {
    updates.thinking = input.thinking ? safeStringify(input.thinking) : null;
  }
  if (input.inputTokens !== undefined) {
    updates.inputTokens = input.inputTokens ?? null;
  }
  if (input.outputTokens !== undefined) {
    updates.outputTokens = input.outputTokens ?? null;
  }
  if (input.status !== undefined) {
    updates.status = input.status;
  }
  if (input.errorMessage !== undefined) {
    updates.errorMessage = input.errorMessage ?? null;
  }
  if (input.completedAt !== undefined) {
    updates.completedAt = input.completedAt ? new Date(input.completedAt) : null;
  }
  
  if (Object.keys(updates).length === 0) return existing;
  
  await db.update(chatMessages)
    .set(updates)
    .where(eq(chatMessages.id, id));
  
  log.debug('Updated chat message', { messageId: id, updates: Object.keys(input) });
  return getChatMessageById(id);
}

/**
 * Mark message as complete
 */
export async function completeMessage(
  id: string,
  inputTokens?: number,
  outputTokens?: number
): Promise<ChatMessage | null> {
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
export async function errorMessage(id: string, errorMsg: string): Promise<ChatMessage | null> {
  return updateChatMessage(id, {
    status: 'error',
    errorMessage: errorMsg,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Delete a chat message
 */
export async function deleteChatMessage(id: string): Promise<boolean> {
  const result = await db.delete(chatMessages)
    .where(eq(chatMessages.id, id))
    .returning({ id: chatMessages.id });
  
  if (result.length > 0) {
    log.debug('Deleted chat message', { messageId: id });
    return true;
  }
  return false;
}

/**
 * Delete all messages for a session
 */
export async function deleteChatMessagesBySessionId(sessionId: string): Promise<number> {
  const result = await db.delete(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .returning({ id: chatMessages.id });
  
  if (result.length > 0) {
    log.debug('Deleted session messages', { sessionId, count: result.length });
  }
  return result.length;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get or create a message by external ID
 * Used during sync to ensure we have a local record
 */
export async function getOrCreateMessage(
  sessionId: string,
  externalMessageId: string,
  role: MessageRole,
  content: unknown
): Promise<ChatMessage> {
  const existing = await getChatMessageByExternalId(sessionId, externalMessageId);
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
export async function getMessageCount(sessionId: string): Promise<number> {
  const [result] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId));
  
  return Number(result?.count ?? 0);
}

/**
 * Get total tokens for a session
 */
export async function getSessionTokens(sessionId: string): Promise<{ input: number; output: number }> {
  const [result] = await db.select({
    inputTotal: sql<number>`COALESCE(SUM(${chatMessages.inputTokens}), 0)`,
    outputTotal: sql<number>`COALESCE(SUM(${chatMessages.outputTokens}), 0)`,
  })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId));
  
  return {
    input: Number(result?.inputTotal ?? 0),
    output: Number(result?.outputTotal ?? 0),
  };
}
