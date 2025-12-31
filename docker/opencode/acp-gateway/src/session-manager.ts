/**
 * Session Manager
 * 
 * Manages ACP sessions and tracks their state.
 */

import { nanoid } from 'nanoid';
import type {
  Session,
  SessionCreate,
  SessionUpdate,
  SessionStatus,
  AgentId,
} from './types.ts';

/**
 * Session Manager for tracking active sessions.
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  /**
   * Create a new session.
   */
  createSession(data: SessionCreate, acpSessionId?: string): Session {
    const id = nanoid();
    const now = new Date();
    
    const session: Session = {
      id,
      agentId: data.agentId,
      acpSessionId: acpSessionId || id,
      status: 'active',
      createdAt: now,
      lastActivity: now,
      messageCount: 0,
      workingDirectory: data.workingDirectory || '/workspace',
    };
    
    this.sessions.set(id, session);
    
    console.log(`[SessionManager] Created session: ${id} for agent: ${data.agentId}`);
    
    return session;
  }

  /**
   * Get a session by ID.
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get a session by ACP session ID.
   */
  getSessionByAcpId(acpSessionId: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.acpSessionId === acpSessionId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Update a session.
   */
  updateSession(id: string, updates: SessionUpdate): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    const updated: Session = {
      ...session,
      ...updates,
      lastActivity: updates.lastActivity || new Date(),
    };
    
    this.sessions.set(id, updated);
    
    return updated;
  }

  /**
   * Delete a session.
   */
  deleteSession(id: string): boolean {
    const existed = this.sessions.has(id);
    this.sessions.delete(id);
    
    if (existed) {
      console.log(`[SessionManager] Deleted session: ${id}`);
    }
    
    return existed;
  }

  /**
   * Get all sessions.
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions by agent ID.
   */
  getSessionsByAgent(agentId: AgentId): Session[] {
    return this.getAllSessions().filter(s => s.agentId === agentId);
  }

  /**
   * Get active sessions count.
   */
  getActiveSessionCount(): number {
    return this.getAllSessions().filter(s => s.status !== 'ended').length;
  }

  /**
   * Mark a session as ended.
   */
  endSession(id: string, reason: 'complete' | 'cancelled' | 'error' = 'complete'): void {
    const session = this.sessions.get(id);
    if (session) {
      this.updateSession(id, { status: 'ended' });
      console.log(`[SessionManager] Ended session: ${id}, reason: ${reason}`);
    }
  }

  /**
   * Increment message count for a session.
   */
  incrementMessageCount(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      this.updateSession(id, {
        messageCount: session.messageCount + 1,
      });
    }
  }

  /**
   * Set session status.
   */
  setStatus(id: string, status: SessionStatus): void {
    this.updateSession(id, { status });
  }

  /**
   * Clean up stale sessions (inactive for more than 1 hour).
   */
  cleanupStaleSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, session] of this.sessions) {
      const age = now - session.lastActivity.getTime();
      if (age > maxAgeMs && session.status !== 'processing') {
        this.deleteSession(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned up ${cleaned} stale sessions`);
    }
    
    return cleaned;
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
