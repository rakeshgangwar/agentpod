/**
 * OpenCode Sync Service
 * 
 * Real-time sync of OpenCode sessions and messages to the management API database.
 * 
 * Architecture:
 * - Subscribes to SSE events from OpenCode containers
 * - Real-time sync: session.created, message.created, etc.
 * - Backup sync: Full sync every 5 minutes
 * - Reconnects with exponential backoff on failures
 * 
 * Design Decision: OpenCode is the source of truth for chat data.
 * Our database is a cache/backup that survives container recreation.
 */

import { createLogger } from '../../utils/logger.ts';
import { getSandboxManager } from '../sandbox-manager.ts';
import { opencodeV2 } from '../opencode-v2.ts';
import * as ChatSessionModel from '../../models/chat-session.ts';
import * as ChatMessageModel from '../../models/chat-message.ts';
import * as SandboxModel from '../../models/sandbox.ts';

const log = createLogger('opencode-sync');

// =============================================================================
// Types
// =============================================================================

interface SyncConnection {
  sandboxId: string;
  abortController: AbortController;
  reconnectAttempts: number;
  lastSyncTime: Date;
  fullSyncInterval?: ReturnType<typeof setInterval>;
}

// OpenCode SSE event types (based on actual observed events)
interface OpenCodeEvent {
  type: string;
  properties?: Record<string, unknown>;
}

interface SessionCreatedEvent extends OpenCodeEvent {
  type: 'session.created';
  properties: {
    info: {
      id: string;
      title?: string;
      [key: string]: unknown;
    };
  };
}

interface SessionUpdatedEvent extends OpenCodeEvent {
  type: 'session.updated';
  properties: {
    info: {
      id: string;
      title?: string;
      [key: string]: unknown;
    };
  };
}

interface SessionDeletedEvent extends OpenCodeEvent {
  type: 'session.deleted';
  properties: {
    info?: {
      id: string;
    };
    sessionID?: string; // fallback
  };
}

interface MessageCreatedEvent extends OpenCodeEvent {
  type: 'message.created';
  properties: {
    info: {
      id: string;
      sessionID: string;
      role: 'user' | 'assistant' | 'system';
      [key: string]: unknown;
    };
  };
}

interface MessageUpdatedEvent extends OpenCodeEvent {
  type: 'message.updated';
  properties: {
    info: {
      id: string;
      sessionID: string;
      role?: 'user' | 'assistant' | 'system';
      [key: string]: unknown;
    };
  };
}

interface MessagePartUpdatedEvent extends OpenCodeEvent {
  type: 'message.part.updated';
  properties: {
    part: {
      id: string;
      sessionID: string;
      messageID: string;
      type: string;
      text?: string;
      [key: string]: unknown;
    };
    delta?: string;
  };
}

// =============================================================================
// Sync Service Class
// =============================================================================

class OpenCodeSyncService {
  private connections: Map<string, SyncConnection> = new Map();
  private readonly RECONNECT_MAX_ATTEMPTS = 10;
  private readonly RECONNECT_BASE_DELAY_MS = 1000;
  private readonly FULL_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    log.info('OpenCode Sync Service initialized');
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Start syncing a sandbox
   * Called when a sandbox starts running
   */
  async startSync(sandboxId: string): Promise<void> {
    // Don't start if already connected
    if (this.connections.has(sandboxId)) {
      log.debug('Sync already active for sandbox', { sandboxId });
      return;
    }

    // Verify sandbox is running
    const sandbox = await getSandboxManager().getSandbox(sandboxId);
    if (!sandbox || sandbox.status !== 'running') {
      log.warn('Cannot start sync - sandbox not running', { sandboxId, status: sandbox?.status });
      return;
    }

    log.info('Starting OpenCode sync', { sandboxId });

    const connection: SyncConnection = {
      sandboxId,
      abortController: new AbortController(),
      reconnectAttempts: 0,
      lastSyncTime: new Date(),
    };

    this.connections.set(sandboxId, connection);

    // Start SSE subscription
    this.subscribeToEvents(sandboxId, connection);

    // Start full sync interval (backup)
    connection.fullSyncInterval = setInterval(
      () => this.fullSync(sandboxId),
      this.FULL_SYNC_INTERVAL_MS
    );

    // Do initial full sync
    await this.fullSync(sandboxId);
  }

  /**
   * Stop syncing a sandbox
   * Called when a sandbox stops or is deleted
   */
  stopSync(sandboxId: string): void {
    const connection = this.connections.get(sandboxId);
    if (!connection) return;

    log.info('Stopping OpenCode sync', { sandboxId });

    // Abort SSE connection
    connection.abortController.abort();

    // Clear full sync interval
    if (connection.fullSyncInterval) {
      clearInterval(connection.fullSyncInterval);
    }

    this.connections.delete(sandboxId);
  }

  /**
   * Stop all sync connections
   * Called on service shutdown
   */
  stopAll(): void {
    log.info('Stopping all OpenCode sync connections', { count: this.connections.size });
    
    for (const sandboxId of this.connections.keys()) {
      this.stopSync(sandboxId);
    }
  }

  /**
   * Get sync status for a sandbox
   */
  getSyncStatus(sandboxId: string): {
    active: boolean;
    lastSyncTime?: Date;
    reconnectAttempts?: number;
  } {
    const connection = this.connections.get(sandboxId);
    if (!connection) {
      return { active: false };
    }

    return {
      active: true,
      lastSyncTime: connection.lastSyncTime,
      reconnectAttempts: connection.reconnectAttempts,
    };
  }

  // ===========================================================================
  // SSE Event Handling
  // ===========================================================================

  /**
   * Subscribe to SSE events from OpenCode
   */
  private async subscribeToEvents(sandboxId: string, connection: SyncConnection): Promise<void> {
    try {
      const events = await opencodeV2.subscribeToEvents(sandboxId, connection.abortController.signal);

      // Reset reconnect attempts on successful connection
      connection.reconnectAttempts = 0;

      for await (const event of events) {
        if (connection.abortController.signal.aborted) break;

        try {
          await this.handleEvent(sandboxId, event as OpenCodeEvent);
        } catch (error) {
          log.error('Error handling SSE event', { sandboxId, event: event.type, error });
        }
      }
    } catch (error) {
      // Don't log error if aborted intentionally
      if (connection.abortController.signal.aborted) return;

      log.error('SSE connection error', { sandboxId, error });
      await this.handleReconnect(sandboxId, connection);
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private async handleReconnect(sandboxId: string, connection: SyncConnection): Promise<void> {
    connection.reconnectAttempts++;

    if (connection.reconnectAttempts > this.RECONNECT_MAX_ATTEMPTS) {
      log.error('Max reconnect attempts reached', { sandboxId, attempts: connection.reconnectAttempts });
      this.stopSync(sandboxId);
      return;
    }

    // Exponential backoff
    const delay = this.RECONNECT_BASE_DELAY_MS * Math.pow(2, connection.reconnectAttempts - 1);
    log.info('Reconnecting to OpenCode SSE', { sandboxId, attempt: connection.reconnectAttempts, delayMs: delay });

    await new Promise(resolve => setTimeout(resolve, delay));

    // Check if still should reconnect (might have been stopped)
    if (!this.connections.has(sandboxId)) return;

    // Create new abort controller for new connection
    connection.abortController = new AbortController();

    // Reconnect
    this.subscribeToEvents(sandboxId, connection);
  }

  /**
   * Handle individual SSE events
   */
  private async handleEvent(sandboxId: string, event: OpenCodeEvent): Promise<void> {
    log.debug('Received SSE event', { sandboxId, type: event.type });

    const sandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!sandbox) {
      log.warn('Sandbox not found for event', { sandboxId });
      return;
    }

    switch (event.type) {
      case 'server.connected':
        log.info('SSE connected to OpenCode', { sandboxId });
        break;
      case 'session.created':
        await this.handleSessionCreated(sandbox, event as SessionCreatedEvent);
        break;
      case 'session.updated':
        await this.handleSessionUpdated(sandbox, event as SessionUpdatedEvent);
        break;
      case 'session.deleted':
        await this.handleSessionDeleted(sandbox, event as SessionDeletedEvent);
        break;
      case 'message.created':
        await this.handleMessageCreated(sandbox, event as MessageCreatedEvent);
        break;
      case 'message.updated':
        await this.handleMessageUpdated(sandbox, event as MessageUpdatedEvent);
        break;
      case 'message.part.updated':
        await this.handlePartUpdated(sandbox, event as MessagePartUpdatedEvent);
        break;
      case 'session.status':
      case 'session.diff':
        // Ignore status/diff events for now
        break;
      default:
        log.debug('Unhandled event type', { sandboxId, type: event.type });
    }

    // Update last sync time
    const connection = this.connections.get(sandboxId);
    if (connection) {
      connection.lastSyncTime = new Date();
    }
  }

  private async handleSessionCreated(
    sandbox: SandboxModel.Sandbox,
    event: SessionCreatedEvent
  ): Promise<void> {
    const { id: opencodeSessionId, title } = event.properties.info;

    // Get or create local session
    await ChatSessionModel.getOrCreateOpencodeSession(
      sandbox.id,
      sandbox.userId,
      opencodeSessionId,
      title
    );

    log.info('Synced session created', { sandboxId: sandbox.id, opencodeSessionId });
  }

  private async handleSessionUpdated(
    sandbox: SandboxModel.Sandbox,
    event: SessionUpdatedEvent
  ): Promise<void> {
    const { id: opencodeSessionId, title } = event.properties.info;

    const session = await ChatSessionModel.getChatSessionByOpencodeId(sandbox.id, opencodeSessionId);
    if (!session) {
      // Create if doesn't exist
      await ChatSessionModel.getOrCreateOpencodeSession(
        sandbox.id,
        sandbox.userId,
        opencodeSessionId,
        title
      );
      return;
    }

    // Update title if changed
    if (title && title !== session.title) {
      await ChatSessionModel.updateChatSession(session.id, { title });
    }

    await ChatSessionModel.touchChatSessionSync(session.id);
    log.debug('Synced session updated', { sandboxId: sandbox.id, sessionId: session.id });
  }

  private async handleSessionDeleted(
    sandbox: SandboxModel.Sandbox,
    event: SessionDeletedEvent
  ): Promise<void> {
    // Handle both possible event structures
    const opencodeSessionId = event.properties.info?.id ?? event.properties.sessionID;
    if (!opencodeSessionId) {
      log.warn('No session ID in delete event', { sandboxId: sandbox.id });
      return;
    }

    const session = await ChatSessionModel.getChatSessionByOpencodeId(sandbox.id, opencodeSessionId);
    if (session) {
      // Soft delete (archive)
      await ChatSessionModel.archiveChatSession(session.id);
      log.info('Archived deleted session', { sandboxId: sandbox.id, sessionId: session.id });
    }
  }

  private async handleMessageCreated(
    sandbox: SandboxModel.Sandbox,
    event: MessageCreatedEvent
  ): Promise<void> {
    const { sessionID: opencodeSessionId, id: messageId, role, ...rest } = event.properties.info;

    // Ensure session exists
    const session = await ChatSessionModel.getOrCreateOpencodeSession(
      sandbox.id,
      sandbox.userId,
      opencodeSessionId
    );

    // Check if message already exists
    const existing = await ChatMessageModel.getChatMessageByExternalId(session.id, messageId);
    if (existing) {
      log.debug('Message already exists, skipping', { sessionId: session.id, messageId });
      return;
    }

    // Create message
    await ChatMessageModel.createChatMessage({
      sessionId: session.id,
      externalMessageId: messageId,
      role: role as ChatMessageModel.MessageRole,
      content: rest,
      status: 'streaming', // New messages start as streaming
    });

    // Update session counts
    await ChatSessionModel.incrementMessageCount(session.id, role === 'user' ? 'user' : 'assistant');

    log.debug('Synced message created', { sessionId: session.id, messageId, role });
  }

  private async handleMessageUpdated(
    sandbox: SandboxModel.Sandbox,
    event: MessageUpdatedEvent
  ): Promise<void> {
    const { sessionID: opencodeSessionId, id: messageId, role, ...metadata } = event.properties.info;

    // Ensure session exists (create if needed)
    const session = await ChatSessionModel.getOrCreateOpencodeSession(
      sandbox.id,
      sandbox.userId,
      opencodeSessionId
    );

    const message = await ChatMessageModel.getChatMessageByExternalId(session.id, messageId);
    if (!message) {
      // Message doesn't exist yet - create it with metadata
      // This can happen if we missed the message.created event
      if (role) {
        await ChatMessageModel.createChatMessage({
          sessionId: session.id,
          externalMessageId: messageId,
          role: role as ChatMessageModel.MessageRole,
          content: { metadata }, // Store metadata separately, parts will come from part.updated or full sync
          status: 'streaming',
        });
        await ChatSessionModel.incrementMessageCount(session.id, role === 'user' ? 'user' : 'assistant');
        log.debug('Created message from update event', { sessionId: session.id, messageId, role });
      } else {
        log.warn('Message not found and no role in update event', { sessionId: session.id, messageId });
      }
      return;
    }

    // Merge metadata into existing content, preserving parts if they exist
    const existingContent = (message.content as Record<string, unknown>) || {};
    const mergedContent = {
      ...existingContent,
      metadata, // Add/update metadata
      // Preserve time info from event
      time: metadata.time || existingContent.time,
      // Mark as complete if finish is set
      finish: metadata.finish || existingContent.finish,
    };

    // Determine status based on finish field
    const isComplete = !!metadata.finish;
    
    await ChatMessageModel.updateChatMessage(message.id, {
      content: mergedContent,
      status: isComplete ? 'complete' : message.status,
      completedAt: isComplete ? new Date().toISOString() : undefined,
    });

    log.debug('Synced message updated', { sessionId: session.id, messageId, isComplete });
  }

  private async handlePartUpdated(
    sandbox: SandboxModel.Sandbox,
    event: MessagePartUpdatedEvent
  ): Promise<void> {
    const { sessionID: opencodeSessionId, messageID: messageId, type: partType, text } = event.properties.part;

    // Ensure session exists
    const session = await ChatSessionModel.getOrCreateOpencodeSession(
      sandbox.id,
      sandbox.userId,
      opencodeSessionId
    );

    // Find the message and update its content with the part
    const message = await ChatMessageModel.getChatMessageByExternalId(session.id, messageId);
    if (message && partType === 'text' && text) {
      // Get existing content or initialize
      const existingContent = (message.content as Record<string, unknown>) || {};
      const existingParts = (existingContent.parts as unknown[]) || [];
      
      // Add or update the text part
      const updatedParts = [...existingParts];
      const existingTextPartIndex = updatedParts.findIndex(
        (p: unknown) => (p as Record<string, unknown>).type === 'text'
      );
      
      if (existingTextPartIndex >= 0) {
        // Update existing text part
        (updatedParts[existingTextPartIndex] as Record<string, unknown>).text = text;
      } else {
        // Add new text part
        updatedParts.push({ type: 'text', text });
      }
      
      await ChatMessageModel.updateChatMessage(message.id, {
        content: { ...existingContent, parts: updatedParts },
      });
      
      log.debug('Updated message with part content', {
        sessionId: session.id,
        messageId,
        partType,
        textLength: text.length,
      });
    } else {
      log.debug('Part updated (streaming)', {
        sandboxId: sandbox.id,
        opencodeSessionId,
        messageId,
        partType,
        hasText: !!text,
      });
    }
  }

  // ===========================================================================
  // Full Sync (Backup)
  // ===========================================================================

  /**
   * Full sync of all sessions and messages for a sandbox
   * Run periodically as a backup to SSE events
   */
  async fullSync(sandboxId: string): Promise<void> {
    const sandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!sandbox) {
      log.warn('Sandbox not found for full sync', { sandboxId });
      return;
    }

    if (sandbox.status !== 'running') {
      log.debug('Skipping full sync - sandbox not running', { sandboxId, status: sandbox.status });
      return;
    }

    log.info('Starting full sync', { sandboxId });

    try {
      // Get all sessions from OpenCode
      const opencodeSessions = await opencodeV2.listSessions(sandboxId);

      for (const opcSession of opencodeSessions) {
        // Get or create local session
        const localSession = await ChatSessionModel.getOrCreateOpencodeSession(
          sandbox.id,
          sandbox.userId,
          opcSession.id,
          opcSession.title ?? undefined
        );

        // Update title if changed
        if (opcSession.title && opcSession.title !== localSession.title) {
          await ChatSessionModel.updateChatSession(localSession.id, { title: opcSession.title });
        }

        // Sync messages for this session
        await this.syncSessionMessages(sandboxId, localSession.id, opcSession.id);
      }

      // Update sync timestamp
      const connection = this.connections.get(sandboxId);
      if (connection) {
        connection.lastSyncTime = new Date();
      }

      log.info('Full sync complete', { sandboxId, sessionCount: opencodeSessions.length });
    } catch (error) {
      log.error('Full sync failed', { sandboxId, error });
    }
  }

  /**
   * Sync messages for a specific session
   * Public so it can be called after sending a message
   */
  async syncSessionMessages(
    sandboxId: string,
    localSessionId: string,
    opcSessionId: string
  ): Promise<void> {
    try {
      const messages = await opencodeV2.listMessages(sandboxId, opcSessionId);

      let userCount = 0;
      let assistantCount = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      for (const msg of messages) {
        const { info, parts } = msg;

        // Get or create message
        const existing = await ChatMessageModel.getChatMessageByExternalId(localSessionId, info.id);

        // Extract model info from assistant messages if available
        // The Message type varies, so we use type assertion to access optional fields
        const msgInfo = info as unknown as Record<string, unknown>;
        const modelInfo = msgInfo.model as { providerID?: string; modelID?: string } | undefined;
        
        const content = {
          parts,
          model: modelInfo,
          time: msgInfo.time,
        };

        if (existing) {
          // Always update content to ensure we have the latest parts
          // This ensures SSE-created messages get their full parts from the API
          await ChatMessageModel.updateChatMessage(existing.id, {
            content,
            status: 'complete',
            completedAt: existing.completedAt || new Date().toISOString(),
          });
        } else {
          // Create new message
          await ChatMessageModel.createChatMessage({
            sessionId: localSessionId,
            externalMessageId: info.id,
            role: info.role as ChatMessageModel.MessageRole,
            content,
            modelProvider: modelInfo?.providerID,
            modelId: modelInfo?.modelID,
            status: 'complete',
          });
        }

        // Count messages
        if (info.role === 'user') userCount++;
        else if (info.role === 'assistant') assistantCount++;

        // Note: Token tracking would require OpenCode to expose this in the API
        // For now, we track counts but not tokens
      }

      // Update session stats
      await ChatSessionModel.updateChatSession(localSessionId, {
        messageCount: messages.length,
        userMessageCount: userCount,
        assistantMessageCount: assistantCount,
        totalInputTokens: inputTokens,
        totalOutputTokens: outputTokens,
        lastSyncedAt: new Date().toISOString(),
      });

    } catch (error) {
      log.error('Failed to sync session messages', { sandboxId, localSessionId, opcSessionId, error });
    }
  }

  // ===========================================================================
  // Manual Sync Trigger
  // ===========================================================================

  /**
   * Manually trigger a full sync for a session
   */
  async syncSession(sandboxId: string, sessionId: string): Promise<void> {
    const session = await ChatSessionModel.getChatSessionById(sessionId);
    if (!session || !session.opencodeSessionId) {
      throw new Error('Session not found or not an OpenCode session');
    }

    await this.syncSessionMessages(sandboxId, session.id, session.opencodeSessionId);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let syncServiceInstance: OpenCodeSyncService | null = null;

/**
 * Get the OpenCode sync service singleton instance
 */
export function getOpenCodeSyncService(): OpenCodeSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new OpenCodeSyncService();
  }
  return syncServiceInstance;
}

/**
 * Start sync for all running sandboxes
 * Called on API startup
 */
export async function startSyncForRunningSandboxes(): Promise<void> {
  const runningBoxes = await SandboxModel.listSandboxesByStatus('running');
  const syncService = getOpenCodeSyncService();

  log.info('Starting sync for running sandboxes', { count: runningBoxes.length });

  for (const sandbox of runningBoxes) {
    try {
      await syncService.startSync(sandbox.id);
    } catch (error) {
      log.error('Failed to start sync for sandbox', { sandboxId: sandbox.id, error });
    }
  }
}

/**
 * Stop all sync connections
 * Called on API shutdown
 */
export function stopAllSync(): void {
  getOpenCodeSyncService().stopAll();
}

/**
 * Sync messages for a specific OpenCode session
 * Called after sending a message to capture both user message and AI response
 */
export async function syncSessionMessages(sandboxId: string, opcodeSessionId: string): Promise<void> {
  const sandbox = await SandboxModel.getSandboxById(sandboxId);
  if (!sandbox) {
    log.warn('Sandbox not found for message sync', { sandboxId });
    return;
  }

  // Get or create the local session
  const localSession = await ChatSessionModel.getOrCreateOpencodeSession(
    sandbox.id,
    sandbox.userId,
    opcodeSessionId
  );

  // Use the sync service to sync this session's messages
  const syncService = getOpenCodeSyncService();
  await syncService.syncSessionMessages(sandboxId, localSession.id, opcodeSessionId);
  
  log.info('Synced session messages after prompt', { sandboxId, opcodeSessionId, localSessionId: localSession.id });
}
