/**
 * Agent Session Model
 * 
 * Manages ACP sessions and message history for persistence.
 */

import { db } from '../db/index.ts';
import { nanoid } from 'nanoid';
import type { AgentId } from './agent-auth.ts';

// =============================================================================
// Types
// =============================================================================

export type SessionStatus = 'active' | 'idle' | 'processing' | 'ended' | 'error';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AgentSession {
  id: string;
  projectId: string;
  agentId: AgentId;
  acpSessionId: string;
  status: SessionStatus;
  workingDirectory: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

export interface CreateAgentSessionInput {
  projectId: string;
  agentId: AgentId;
  acpSessionId: string;
  workingDirectory?: string;
}

export interface UpdateAgentSessionInput {
  status?: SessionStatus;
  messageCount?: number;
  endedAt?: string;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  toolName: string | null;
  toolInput: string | null;
  toolResult: string | null;
  isPartial: boolean;
  createdAt: string;
}

export interface AddSessionMessageInput {
  sessionId: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  isPartial?: boolean;
}

// =============================================================================
// Database Row Mapping
// =============================================================================

interface AgentSessionRow {
  id: string;
  project_id: string;
  agent_id: string;
  acp_session_id: string;
  status: string;
  working_directory: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

interface SessionMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_name: string | null;
  tool_input: string | null;
  tool_result: string | null;
  is_partial: number;
  created_at: string;
}

function rowToAgentSession(row: AgentSessionRow): AgentSession {
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id as AgentId,
    acpSessionId: row.acp_session_id,
    status: row.status as SessionStatus,
    workingDirectory: row.working_directory,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at,
  };
}

function rowToSessionMessage(row: SessionMessageRow): SessionMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as MessageRole,
    content: row.content,
    toolName: row.tool_name,
    toolInput: row.tool_input,
    toolResult: row.tool_result,
    isPartial: row.is_partial === 1,
    createdAt: row.created_at,
  };
}

// =============================================================================
// Session CRUD Operations
// =============================================================================

/**
 * Create a new agent session
 */
export function createAgentSession(input: CreateAgentSessionInput): AgentSession {
  const id = nanoid();
  
  db.query(`
    INSERT INTO agent_sessions (
      id, project_id, agent_id, acp_session_id, 
      status, working_directory, message_count
    ) VALUES (
      $id, $projectId, $agentId, $acpSessionId,
      $status, $workingDirectory, $messageCount
    )
  `).run({
    $id: id,
    $projectId: input.projectId,
    $agentId: input.agentId,
    $acpSessionId: input.acpSessionId,
    $status: 'active',
    $workingDirectory: input.workingDirectory || '/workspace',
    $messageCount: 0,
  });
  
  return getAgentSession(id)!;
}

/**
 * Get session by ID
 */
export function getAgentSession(id: string): AgentSession | null {
  const row = db.query(`
    SELECT * FROM agent_sessions WHERE id = $id
  `).get({ $id: id }) as AgentSessionRow | null;
  
  return row ? rowToAgentSession(row) : null;
}

/**
 * Get session by ACP session ID
 */
export function getAgentSessionByAcpId(acpSessionId: string): AgentSession | null {
  const row = db.query(`
    SELECT * FROM agent_sessions WHERE acp_session_id = $acpSessionId
  `).get({ $acpSessionId: acpSessionId }) as AgentSessionRow | null;
  
  return row ? rowToAgentSession(row) : null;
}

/**
 * List sessions for a project
 */
export function getProjectSessions(projectId: string, includeEnded: boolean = false): AgentSession[] {
  const sql = includeEnded
    ? `SELECT * FROM agent_sessions WHERE project_id = $projectId ORDER BY created_at DESC`
    : `SELECT * FROM agent_sessions WHERE project_id = $projectId AND status != 'ended' ORDER BY created_at DESC`;
  
  const rows = db.query(sql).all({ $projectId: projectId }) as AgentSessionRow[];
  return rows.map(rowToAgentSession);
}

/**
 * Update session
 */
export function updateAgentSession(id: string, input: UpdateAgentSessionInput): AgentSession | null {
  const updates: string[] = [];
  const params: Record<string, unknown> = { $id: id };
  
  if (input.status !== undefined) {
    updates.push('status = $status');
    params.$status = input.status;
  }
  if (input.messageCount !== undefined) {
    updates.push('message_count = $messageCount');
    params.$messageCount = input.messageCount;
  }
  if (input.endedAt !== undefined) {
    updates.push('ended_at = $endedAt');
    params.$endedAt = input.endedAt;
  }
  
  if (updates.length === 0) {
    return getAgentSession(id);
  }
  
  updates.push("updated_at = datetime('now')");
  
  const sql = `UPDATE agent_sessions SET ${updates.join(', ')} WHERE id = $id`;
  db.query(sql).run(params as Record<string, string | number | null>);
  
  return getAgentSession(id);
}

/**
 * Delete session and its messages
 */
export function deleteAgentSession(id: string): boolean {
  // Messages are deleted via CASCADE
  const result = db.query(`
    DELETE FROM agent_sessions WHERE id = $id
  `).run({ $id: id });
  
  return result.changes > 0;
}

/**
 * End a session
 */
export function endAgentSession(id: string): AgentSession | null {
  return updateAgentSession(id, {
    status: 'ended',
    endedAt: new Date().toISOString(),
  });
}

/**
 * Increment message count
 */
export function incrementSessionMessageCount(id: string): void {
  db.query(`
    UPDATE agent_sessions 
    SET message_count = message_count + 1, updated_at = datetime('now')
    WHERE id = $id
  `).run({ $id: id });
}

/**
 * Get active session count for a project
 */
export function getActiveSessionCount(projectId: string): number {
  const result = db.query(`
    SELECT COUNT(*) as count FROM agent_sessions 
    WHERE project_id = $projectId AND status != 'ended'
  `).get({ $projectId: projectId }) as { count: number };
  
  return result.count;
}

// =============================================================================
// Message Operations
// =============================================================================

/**
 * Add a message to session history
 */
export function addSessionMessage(input: AddSessionMessageInput): SessionMessage {
  const id = nanoid();
  
  db.query(`
    INSERT INTO agent_session_messages (
      id, session_id, role, content,
      tool_name, tool_input, tool_result, is_partial
    ) VALUES (
      $id, $sessionId, $role, $content,
      $toolName, $toolInput, $toolResult, $isPartial
    )
  `).run({
    $id: id,
    $sessionId: input.sessionId,
    $role: input.role,
    $content: input.content,
    $toolName: input.toolName || null,
    $toolInput: input.toolInput ? JSON.stringify(input.toolInput) : null,
    $toolResult: input.toolResult ? JSON.stringify(input.toolResult) : null,
    $isPartial: input.isPartial ? 1 : 0,
  });
  
  // Increment session message count
  incrementSessionMessageCount(input.sessionId);
  
  return getSessionMessage(id)!;
}

/**
 * Get a single message
 */
export function getSessionMessage(id: string): SessionMessage | null {
  const row = db.query(`
    SELECT * FROM agent_session_messages WHERE id = $id
  `).get({ $id: id }) as SessionMessageRow | null;
  
  return row ? rowToSessionMessage(row) : null;
}

/**
 * Get all messages for a session
 */
export function getSessionMessages(sessionId: string, limit?: number): SessionMessage[] {
  if (limit) {
    const rows = db.query(`
      SELECT * FROM agent_session_messages 
      WHERE session_id = $sessionId 
      ORDER BY created_at ASC LIMIT $limit
    `).all({ $sessionId: sessionId, $limit: limit }) as SessionMessageRow[];
    return rows.map(rowToSessionMessage);
  } else {
    const rows = db.query(`
      SELECT * FROM agent_session_messages 
      WHERE session_id = $sessionId 
      ORDER BY created_at ASC
    `).all({ $sessionId: sessionId }) as SessionMessageRow[];
    return rows.map(rowToSessionMessage);
  }
}

/**
 * Clear all messages for a session
 */
export function clearSessionMessages(sessionId: string): number {
  const result = db.query(`
    DELETE FROM agent_session_messages WHERE session_id = $sessionId
  `).run({ $sessionId: sessionId });
  
  // Reset message count
  db.query(`
    UPDATE agent_sessions SET message_count = 0, updated_at = datetime('now')
    WHERE id = $sessionId
  `).run({ $sessionId: sessionId });
  
  return result.changes;
}

/**
 * Update a partial message (complete it)
 */
export function completePartialMessage(id: string, content: string): SessionMessage | null {
  db.query(`
    UPDATE agent_session_messages 
    SET content = $content, is_partial = 0
    WHERE id = $id
  `).run({ $id: id, $content: content });
  
  return getSessionMessage(id);
}

/**
 * Get the last message in a session
 */
export function getLastSessionMessage(sessionId: string): SessionMessage | null {
  const row = db.query(`
    SELECT * FROM agent_session_messages 
    WHERE session_id = $sessionId 
    ORDER BY rowid DESC LIMIT 1
  `).get({ $sessionId: sessionId }) as SessionMessageRow | null;
  
  return row ? rowToSessionMessage(row) : null;
}
