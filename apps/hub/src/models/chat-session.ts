/**
 * Chat Session Model
 * Manages chat session metadata for both OpenCode and ACP Gateway sessions
 * 
 * Sessions can come from two sources:
 * - opencode: Direct OpenCode API sessions
 * - acp_gateway: Multi-agent sessions via ACP Gateway
 */

import { db } from '../db/drizzle';
import { chatSessions } from '../db/schema/chat';
import { eq, and, sql, desc } from 'drizzle-orm';
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

// Database row type from Drizzle schema
type ChatSessionRow = typeof chatSessions.$inferSelect;

// =============================================================================
// Helpers
// =============================================================================

function rowToChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    sandboxId: row.sandboxId,
    userId: row.userId,
    source: row.source as ChatSessionSource,
    opencodeSessionId: row.opencodeSessionId ?? undefined,
    acpSessionId: row.acpSessionId ?? undefined,
    acpAgentId: row.acpAgentId ?? undefined,
    title: row.title ?? undefined,
    status: (row.status ?? 'active') as ChatSessionStatus,
    messageCount: row.messageCount ?? 0,
    userMessageCount: row.userMessageCount ?? 0,
    assistantMessageCount: row.assistantMessageCount ?? 0,
    totalInputTokens: row.totalInputTokens ?? 0,
    totalOutputTokens: row.totalOutputTokens ?? 0,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? undefined,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new chat session
 */
export async function createChatSession(input: CreateChatSessionInput): Promise<ChatSession> {
  const id = crypto.randomUUID();
  const now = new Date();
  
  await db.insert(chatSessions).values({
    id,
    sandboxId: input.sandboxId,
    userId: input.userId,
    source: input.source,
    opencodeSessionId: input.opencodeSessionId ?? null,
    acpSessionId: input.acpSessionId ?? null,
    acpAgentId: input.acpAgentId ?? null,
    title: input.title ?? null,
    status: 'active',
    messageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    createdAt: now,
    updatedAt: now,
  });
  
  log.info('Created chat session', { sessionId: id, sandboxId: input.sandboxId, source: input.source });
  return (await getChatSessionById(id))!;
}

/**
 * Get a chat session by ID
 */
export async function getChatSessionById(id: string): Promise<ChatSession | null> {
  const [row] = await db.select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id));
  
  return row ? rowToChatSession(row) : null;
}

/**
 * Get a chat session by OpenCode session ID
 */
export async function getChatSessionByOpencodeId(
  sandboxId: string,
  opencodeSessionId: string
): Promise<ChatSession | null> {
  const [row] = await db.select()
    .from(chatSessions)
    .where(and(
      eq(chatSessions.sandboxId, sandboxId),
      eq(chatSessions.opencodeSessionId, opencodeSessionId)
    ));
  
  return row ? rowToChatSession(row) : null;
}

/**
 * Get a chat session by ACP session ID
 */
export async function getChatSessionByAcpId(
  sandboxId: string,
  acpSessionId: string
): Promise<ChatSession | null> {
  const [row] = await db.select()
    .from(chatSessions)
    .where(and(
      eq(chatSessions.sandboxId, sandboxId),
      eq(chatSessions.acpSessionId, acpSessionId)
    ));
  
  return row ? rowToChatSession(row) : null;
}

/**
 * List all chat sessions for a sandbox
 */
export async function listChatSessionsBySandboxId(
  sandboxId: string,
  options?: { status?: ChatSessionStatus; limit?: number; offset?: number }
): Promise<ChatSession[]> {
  let query = db.select()
    .from(chatSessions)
    .where(options?.status 
      ? and(eq(chatSessions.sandboxId, sandboxId), eq(chatSessions.status, options.status))
      : eq(chatSessions.sandboxId, sandboxId))
    .orderBy(desc(chatSessions.lastMessageAt), desc(chatSessions.createdAt));
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }
  }
  
  const rows = await query;
  return rows.map(rowToChatSession);
}

/**
 * List all chat sessions for a user
 */
export async function listChatSessionsByUserId(
  userId: string,
  options?: { status?: ChatSessionStatus; limit?: number; offset?: number }
): Promise<ChatSession[]> {
  let query = db.select()
    .from(chatSessions)
    .where(options?.status 
      ? and(eq(chatSessions.userId, userId), eq(chatSessions.status, options.status))
      : eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.lastMessageAt), desc(chatSessions.createdAt));
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }
  }
  
  const rows = await query;
  return rows.map(rowToChatSession);
}

/**
 * Update a chat session
 */
export async function updateChatSession(id: string, input: UpdateChatSessionInput): Promise<ChatSession | null> {
  const existing = await getChatSessionById(id);
  if (!existing) return null;
  
  const updates: Partial<typeof chatSessions.$inferInsert> = {
    updatedAt: new Date(),
  };
  
  if (input.title !== undefined) {
    updates.title = input.title ?? null;
  }
  if (input.status !== undefined) {
    updates.status = input.status;
  }
  if (input.messageCount !== undefined) {
    updates.messageCount = input.messageCount;
  }
  if (input.userMessageCount !== undefined) {
    updates.userMessageCount = input.userMessageCount;
  }
  if (input.assistantMessageCount !== undefined) {
    updates.assistantMessageCount = input.assistantMessageCount;
  }
  if (input.totalInputTokens !== undefined) {
    updates.totalInputTokens = input.totalInputTokens;
  }
  if (input.totalOutputTokens !== undefined) {
    updates.totalOutputTokens = input.totalOutputTokens;
  }
  if (input.lastMessageAt !== undefined) {
    updates.lastMessageAt = input.lastMessageAt ? new Date(input.lastMessageAt) : null;
  }
  if (input.lastSyncedAt !== undefined) {
    updates.lastSyncedAt = input.lastSyncedAt ? new Date(input.lastSyncedAt) : null;
  }
  
  if (Object.keys(updates).length === 1) return existing; // Only updatedAt
  
  await db.update(chatSessions)
    .set(updates)
    .where(eq(chatSessions.id, id));
  
  log.debug('Updated chat session', { sessionId: id, updates: Object.keys(input) });
  return getChatSessionById(id);
}

/**
 * Increment message counts
 */
export async function incrementMessageCount(
  id: string,
  role: 'user' | 'assistant',
  inputTokens?: number,
  outputTokens?: number
): Promise<void> {
  const now = new Date();
  
  if (role === 'user') {
    await db.update(chatSessions)
      .set({
        messageCount: sql`${chatSessions.messageCount} + 1`,
        userMessageCount: sql`${chatSessions.userMessageCount} + 1`,
        totalInputTokens: sql`${chatSessions.totalInputTokens} + ${inputTokens ?? 0}`,
        totalOutputTokens: sql`${chatSessions.totalOutputTokens} + ${outputTokens ?? 0}`,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(chatSessions.id, id));
  } else {
    await db.update(chatSessions)
      .set({
        messageCount: sql`${chatSessions.messageCount} + 1`,
        assistantMessageCount: sql`${chatSessions.assistantMessageCount} + 1`,
        totalInputTokens: sql`${chatSessions.totalInputTokens} + ${inputTokens ?? 0}`,
        totalOutputTokens: sql`${chatSessions.totalOutputTokens} + ${outputTokens ?? 0}`,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(chatSessions.id, id));
  }
}

/**
 * Update last synced timestamp
 */
export async function touchChatSessionSync(id: string): Promise<void> {
  const now = new Date();
  await db.update(chatSessions)
    .set({
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(chatSessions.id, id));
}

/**
 * Archive a chat session (soft delete)
 */
export async function archiveChatSession(id: string): Promise<ChatSession | null> {
  return updateChatSession(id, { status: 'archived' });
}

/**
 * Delete a chat session (hard delete)
 */
export async function deleteChatSession(id: string): Promise<boolean> {
  const result = await db.delete(chatSessions)
    .where(eq(chatSessions.id, id))
    .returning({ id: chatSessions.id });
  
  if (result.length > 0) {
    log.info('Deleted chat session', { sessionId: id });
    return true;
  }
  return false;
}

/**
 * Delete all chat sessions for a sandbox
 */
export async function deleteChatSessionsBySandboxId(sandboxId: string): Promise<number> {
  const result = await db.delete(chatSessions)
    .where(eq(chatSessions.sandboxId, sandboxId))
    .returning({ id: chatSessions.id });
  
  if (result.length > 0) {
    log.info('Deleted sandbox chat sessions', { sandboxId, count: result.length });
  }
  return result.length;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get or create a chat session by OpenCode session ID
 * Used during sync to ensure we have a local record
 */
export async function getOrCreateOpencodeSession(
  sandboxId: string,
  userId: string,
  opencodeSessionId: string,
  title?: string
): Promise<ChatSession> {
  const existing = await getChatSessionByOpencodeId(sandboxId, opencodeSessionId);
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
export async function getOrCreateAcpSession(
  sandboxId: string,
  userId: string,
  acpSessionId: string,
  acpAgentId?: string,
  title?: string
): Promise<ChatSession> {
  const existing = await getChatSessionByAcpId(sandboxId, acpSessionId);
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
export async function getChatSessionStats(sandboxId: string): Promise<{
  total: number;
  active: number;
  archived: number;
  totalMessages: number;
  totalTokens: number;
}> {
  const [result] = await db.select({
    total: sql<number>`COUNT(*)`,
    active: sql<number>`SUM(CASE WHEN ${chatSessions.status} = 'active' THEN 1 ELSE 0 END)`,
    archived: sql<number>`SUM(CASE WHEN ${chatSessions.status} = 'archived' THEN 1 ELSE 0 END)`,
    totalMessages: sql<number>`SUM(${chatSessions.messageCount})`,
    totalTokens: sql<number>`SUM(${chatSessions.totalInputTokens} + ${chatSessions.totalOutputTokens})`,
  })
    .from(chatSessions)
    .where(eq(chatSessions.sandboxId, sandboxId));
  
  return {
    total: Number(result?.total ?? 0),
    active: Number(result?.active ?? 0),
    archived: Number(result?.archived ?? 0),
    totalMessages: Number(result?.totalMessages ?? 0),
    totalTokens: Number(result?.totalTokens ?? 0),
  };
}
