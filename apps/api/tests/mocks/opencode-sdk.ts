/**
 * OpenCode SDK Mock
 *
 * Provides a mock implementation of the OpenCode v2 service for testing.
 * Simulates the OpenCode API responses without requiring a running container.
 */

import type { Session, Message, Part } from '@opencode-ai/sdk';
import type { SendMessageInput } from '../../src/services/opencode-v2';

// =============================================================================
// Types
// =============================================================================

export interface MockSessionData {
  id: string;
  title: string;
  path: string;
  createdAt: number;
  updatedAt: number;
}

export interface MockMessageData {
  info: Message;
  parts: Part[];
}

export interface MockFileData {
  path: string;
  content: string;
  type: string;
}

// =============================================================================
// Mock State
// =============================================================================

let mockSessions: Map<string, Map<string, MockSessionData>> = new Map(); // sandboxId -> sessionId -> session
let mockMessages: Map<string, MockMessageData[]> = new Map(); // sessionId -> messages
let mockFiles: Map<string, MockFileData[]> = new Map(); // sandboxId -> files
let mockHealthy: Map<string, boolean> = new Map(); // sandboxId -> healthy

// Track method calls for assertions
export const mockCalls = {
  listSessions: [] as string[],
  createSession: [] as Array<{ sandboxId: string; title?: string }>,
  getSession: [] as Array<{ sandboxId: string; sessionId: string }>,
  deleteSession: [] as Array<{ sandboxId: string; sessionId: string }>,
  abortSession: [] as Array<{ sandboxId: string; sessionId: string }>,
  listMessages: [] as Array<{ sandboxId: string; sessionId: string }>,
  sendMessage: [] as Array<{ sandboxId: string; sessionId: string; input: SendMessageInput }>,
  getMessage: [] as Array<{ sandboxId: string; sessionId: string; messageId: string }>,
  getFileContent: [] as Array<{ sandboxId: string; filePath: string }>,
  findFiles: [] as Array<{ sandboxId: string; query: string }>,
  listFiles: [] as Array<{ sandboxId: string; path: string }>,
  healthCheck: [] as string[],
};

// =============================================================================
// Reset Function
// =============================================================================

/**
 * Reset all mock state - call this in beforeEach
 */
export function resetOpencodeMock(): void {
  mockSessions = new Map();
  mockMessages = new Map();
  mockFiles = new Map();
  mockHealthy = new Map();

  // Reset call tracking
  Object.keys(mockCalls).forEach((key) => {
    (mockCalls as Record<string, unknown[]>)[key] = [];
  });
}

// =============================================================================
// Mock Configuration Functions
// =============================================================================

/**
 * Add a mock session to a sandbox
 */
export function addMockSession(
  sandboxId: string,
  data: Partial<MockSessionData> & { id: string }
): MockSessionData {
  if (!mockSessions.has(sandboxId)) {
    mockSessions.set(sandboxId, new Map());
  }

  const session: MockSessionData = {
    id: data.id,
    title: data.title ?? `Session ${data.id}`,
    path: data.path ?? '/workspace',
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };

  mockSessions.get(sandboxId)!.set(data.id, session);
  mockMessages.set(data.id, []);
  return session;
}

/**
 * Add a mock message to a session
 */
export function addMockMessage(
  sessionId: string,
  message: { role: 'user' | 'assistant'; content: string }
): MockMessageData {
  const messageData: MockMessageData = {
    info: {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionID: sessionId,
      role: message.role,
      model: {
        providerID: 'anthropic',
        modelID: 'claude-3-5-sonnet',
      },
      createdAt: Date.now(),
    },
    parts: [
      {
        type: 'text',
        text: message.content,
      },
    ],
  };

  const messages = mockMessages.get(sessionId) ?? [];
  messages.push(messageData);
  mockMessages.set(sessionId, messages);

  return messageData;
}

/**
 * Add mock files to a sandbox
 */
export function addMockFiles(sandboxId: string, files: MockFileData[]): void {
  mockFiles.set(sandboxId, files);
}

/**
 * Set health status for a sandbox's OpenCode instance
 */
export function setMockOpenCodeHealth(sandboxId: string, healthy: boolean): void {
  mockHealthy.set(sandboxId, healthy);
}

/**
 * Get mock session by ID
 */
export function getMockSession(sandboxId: string, sessionId: string): MockSessionData | undefined {
  return mockSessions.get(sandboxId)?.get(sessionId);
}

// =============================================================================
// Mock OpenCode V2 Service
// =============================================================================

export const mockOpencodeV2 = {
  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  async listSessions(sandboxId: string): Promise<Session[]> {
    mockCalls.listSessions.push(sandboxId);
    const sessions = mockSessions.get(sandboxId);
    if (!sessions) {
      return [];
    }
    return Array.from(sessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      path: s.path,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },

  async createSession(sandboxId: string, title?: string | null): Promise<Session> {
    mockCalls.createSession.push({ sandboxId, title: title ?? undefined });
    const session = addMockSession(sandboxId, {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title ?? 'New Session',
    });
    return {
      id: session.id,
      title: session.title,
      path: session.path,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  },

  async getSession(sandboxId: string, sessionId: string): Promise<Session> {
    mockCalls.getSession.push({ sandboxId, sessionId });
    const session = mockSessions.get(sandboxId)?.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return {
      id: session.id,
      title: session.title,
      path: session.path,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  },

  async deleteSession(sandboxId: string, sessionId: string): Promise<void> {
    mockCalls.deleteSession.push({ sandboxId, sessionId });
    mockSessions.get(sandboxId)?.delete(sessionId);
    mockMessages.delete(sessionId);
  },

  async abortSession(sandboxId: string, sessionId: string): Promise<void> {
    mockCalls.abortSession.push({ sandboxId, sessionId });
    // No-op in mock
  },

  // ---------------------------------------------------------------------------
  // Message API
  // ---------------------------------------------------------------------------

  async listMessages(
    sandboxId: string,
    sessionId: string
  ): Promise<Array<{ info: Message; parts: Part[] }>> {
    mockCalls.listMessages.push({ sandboxId, sessionId });
    return mockMessages.get(sessionId) ?? [];
  },

  async sendMessage(
    sandboxId: string,
    sessionId: string,
    input: SendMessageInput
  ): Promise<{ info: Message; parts: Part[] }> {
    mockCalls.sendMessage.push({ sandboxId, sessionId, input });

    // Add user message
    const textPart = input.parts.find((p) => p.type === 'text');
    addMockMessage(sessionId, {
      role: 'user',
      content: textPart?.text ?? '',
    });

    // Generate mock assistant response
    const response = addMockMessage(sessionId, {
      role: 'assistant',
      content: `Mock response to: ${textPart?.text ?? 'your message'}`,
    });

    return response;
  },

  async getMessage(
    sandboxId: string,
    sessionId: string,
    messageId: string
  ): Promise<{ info: Message; parts: Part[] }> {
    mockCalls.getMessage.push({ sandboxId, sessionId, messageId });
    const messages = mockMessages.get(sessionId) ?? [];
    const message = messages.find((m) => m.info.id === messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }
    return message;
  },

  // ---------------------------------------------------------------------------
  // File API
  // ---------------------------------------------------------------------------

  async getFileContent(
    sandboxId: string,
    filePath: string
  ): Promise<{ type: string; content: string }> {
    mockCalls.getFileContent.push({ sandboxId, filePath });
    const files = mockFiles.get(sandboxId) ?? [];
    const file = files.find((f) => f.path === filePath);
    if (!file) {
      throw new Error(`File not found: ${filePath}`);
    }
    return { type: file.type, content: file.content };
  },

  async findFiles(sandboxId: string, query: string): Promise<string[]> {
    mockCalls.findFiles.push({ sandboxId, query });
    const files = mockFiles.get(sandboxId) ?? [];
    return files
      .filter((f) => f.path.toLowerCase().includes(query.toLowerCase()))
      .map((f) => f.path);
  },

  async listFiles(
    sandboxId: string,
    path: string = '/'
  ): Promise<
    Array<{
      name: string;
      path: string;
      absolute: string;
      type: 'file' | 'directory';
      ignored: boolean;
    }>
  > {
    mockCalls.listFiles.push({ sandboxId, path });
    const files = mockFiles.get(sandboxId) ?? [];

    // Filter files that start with the given path
    return files
      .filter((f) => f.path.startsWith(path))
      .map((f) => ({
        name: f.path.split('/').pop() ?? f.path,
        path: f.path,
        absolute: `/workspace${f.path}`,
        type: 'file' as const,
        ignored: false,
      }));
  },

  // ---------------------------------------------------------------------------
  // App Info
  // ---------------------------------------------------------------------------

  async getAppInfo(sandboxId: string): Promise<unknown> {
    return {
      config: {
        version: '1.0.0',
        environment: 'test',
      },
      project: {
        path: '/workspace',
        name: 'test-project',
      },
    };
  },

  async getProviders(
    sandboxId: string
  ): Promise<
    Array<{
      id: string;
      name: string;
      models: Array<{ id: string; name: string }>;
    }>
  > {
    return [
      {
        id: 'anthropic',
        name: 'Anthropic',
        models: [
          { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-opus', name: 'Claude 3 Opus' },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'gpt-4o', name: 'GPT-4o' },
          { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        ],
      },
    ];
  },

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  async respondToPermission(
    sandboxId: string,
    sessionId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject'
  ): Promise<boolean> {
    return true;
  },

  // ---------------------------------------------------------------------------
  // Events (SSE)
  // ---------------------------------------------------------------------------

  async subscribeToEvents(
    sandboxId: string,
    signal?: AbortSignal
  ): Promise<AsyncIterable<{ type: string; properties: unknown }>> {
    // Return an empty async iterable for testing
    return {
      async *[Symbol.asyncIterator]() {
        // No events in mock
      },
    };
  },

  async getEventStreamUrl(sandboxId: string): Promise<string> {
    return `http://mock-opencode:3000/event`;
  },

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  async healthCheck(sandboxId: string): Promise<boolean> {
    mockCalls.healthCheck.push(sandboxId);
    return mockHealthy.get(sandboxId) ?? true;
  },

  clearClientCache(sandboxId: string): void {
    // No-op in mock
  },
};

// =============================================================================
// Export as a module replacement
// =============================================================================

export function createMockOpencodeV2() {
  return mockOpencodeV2;
}
