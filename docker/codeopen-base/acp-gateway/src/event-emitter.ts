/**
 * Event Emitter
 * 
 * Manages Server-Sent Events (SSE) for real-time communication with clients.
 */

import type { GatewayEvent, EventType, AgentId } from './types.ts';

type EventCallback = (event: GatewayEvent) => void;

interface SSEClient {
  id: string;
  sessionId?: string;
  callback: EventCallback;
  connectedAt: Date;
}

/**
 * Event Emitter for SSE-based real-time updates.
 */
export class EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private clientIdCounter = 0;

  /**
   * Register a new SSE client.
   */
  addClient(callback: EventCallback, sessionId?: string): string {
    const id = `client_${++this.clientIdCounter}`;
    
    this.clients.set(id, {
      id,
      sessionId,
      callback,
      connectedAt: new Date(),
    });
    
    console.log(`[EventEmitter] Client connected: ${id}${sessionId ? ` (session: ${sessionId})` : ' (global)'}`);
    
    return id;
  }

  /**
   * Remove a client.
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      console.log(`[EventEmitter] Client disconnected: ${clientId}`);
    }
  }

  /**
   * Emit an event to a specific session's clients.
   */
  emit(type: EventType, data: unknown, sessionId?: string, agentId?: AgentId): void {
    const event: GatewayEvent = {
      type,
      sessionId,
      agentId,
      data,
      timestamp: new Date(),
    };
    
    let sent = 0;
    
    for (const client of this.clients.values()) {
      // Send to clients subscribed to this session or global clients
      if (!client.sessionId || client.sessionId === sessionId) {
        try {
          client.callback(event);
          sent++;
        } catch (error) {
          console.error(`[EventEmitter] Error sending to client ${client.id}:`, error);
          // Remove broken client
          this.removeClient(client.id);
        }
      }
    }
    
    console.log(`[EventEmitter] Emitted ${type} to ${sent} clients`);
  }

  /**
   * Emit an event to all clients.
   */
  emitToAll(type: EventType, data: unknown, agentId?: AgentId): void {
    const event: GatewayEvent = {
      type,
      agentId,
      data,
      timestamp: new Date(),
    };
    
    for (const client of this.clients.values()) {
      try {
        client.callback(event);
      } catch (error) {
        console.error(`[EventEmitter] Error sending to client ${client.id}:`, error);
        this.removeClient(client.id);
      }
    }
    
    console.log(`[EventEmitter] Emitted ${type} to all ${this.clients.size} clients`);
  }

  /**
   * Get connected client count.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients for a specific session.
   */
  getSessionClientCount(sessionId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (!client.sessionId || client.sessionId === sessionId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Emit session update event.
   */
  emitSessionUpdate(
    sessionId: string,
    type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'error',
    content?: string,
    isPartial?: boolean,
    toolName?: string,
    toolInput?: unknown,
    toolResult?: unknown
  ): void {
    this.emit('session_update', {
      sessionId,
      type,
      content,
      isPartial,
      toolName,
      toolInput,
      toolResult,
    }, sessionId);
  }

  /**
   * Emit session end turn event.
   */
  emitSessionEndTurn(sessionId: string, reason: 'complete' | 'cancelled' | 'error', error?: string): void {
    this.emit('session_end_turn', {
      sessionId,
      reason,
      error,
    }, sessionId);
  }

  /**
   * Emit permission request event.
   */
  emitPermissionRequest(
    sessionId: string,
    requestId: string,
    permission: string,
    description: string,
    path?: string,
    command?: string
  ): void {
    this.emit('permission_request', {
      requestId,
      sessionId,
      permission,
      description,
      path,
      command,
    }, sessionId);
  }

  /**
   * Emit auth required event.
   */
  emitAuthRequired(
    agentId: AgentId,
    authUrl?: string,
    deviceCode?: string,
    userCode?: string,
    expiresIn?: number,
    message?: string
  ): void {
    this.emitToAll('auth_required', {
      agentId,
      authUrl,
      deviceCode,
      userCode,
      expiresIn,
      message,
    }, agentId);
  }

  /**
   * Emit auth complete event.
   */
  emitAuthComplete(agentId: AgentId): void {
    this.emitToAll('auth_complete', { agentId }, agentId);
  }

  /**
   * Emit agent status event.
   */
  emitAgentStatus(agentId: AgentId, status: string, error?: string): void {
    this.emitToAll('agent_status', { agentId, status, error }, agentId);
  }

  /**
   * Emit error event.
   */
  emitError(message: string, sessionId?: string, agentId?: AgentId): void {
    this.emit('error', { message }, sessionId, agentId);
  }
}

// Singleton instance
export const eventEmitter = new EventEmitter();
