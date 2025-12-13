/**
 * Test Data Factories
 * 
 * Create consistent test data for unit and integration tests.
 * Each factory returns a complete object with sensible defaults
 * that can be overridden.
 */

import { nanoid } from 'nanoid';

// ============================================================================
// Types
// ============================================================================

export interface SandboxData {
  id: string;
  userId: string;
  name: string;
  containerId: string;
  flavor: string;
  status: string;
  port: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface UserData {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionData {
  id: string;
  sandboxId: string;
  userId: string;
  sessionType: 'opencode' | 'acp';
  externalSessionId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface ChatMessageData {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts: string | null;
  toolCalls: string | null;
  createdAt: string;
  tokenCount: number | null;
}

export interface UserPreferencesData {
  id: string;
  userId: string;
  category: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogData {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface ProviderConfigData {
  id: string;
  userId: string;
  providerId: string;
  apiKey: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Factories
// ============================================================================

let counter = 0;

function nextId(prefix: string = ''): string {
  counter++;
  return `${prefix}${nanoid(12)}-${counter}`;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Create a sandbox test object
 */
export function createSandbox(overrides: Partial<SandboxData> = {}): SandboxData {
  const timestamp = now();
  return {
    id: nextId('sandbox-'),
    userId: nextId('user-'),
    name: `test-sandbox-${counter}`,
    containerId: nextId('container-'),
    flavor: 'fullstack',
    status: 'running',
    port: 4000 + counter,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastAccessedAt: null,
    metadata: null,
    ...overrides,
  };
}

/**
 * Create a user test object
 */
export function createUser(overrides: Partial<UserData> = {}): UserData {
  const timestamp = now();
  return {
    id: nextId('user-'),
    email: `test-${counter}@example.com`,
    name: `Test User ${counter}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

/**
 * Create a chat session test object
 */
export function createChatSession(overrides: Partial<ChatSessionData> = {}): ChatSessionData {
  const timestamp = now();
  return {
    id: nextId('session-'),
    sandboxId: nextId('sandbox-'),
    userId: nextId('user-'),
    sessionType: 'opencode',
    externalSessionId: null,
    title: `Test Session ${counter}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: null,
    ...overrides,
  };
}

/**
 * Create a chat message test object
 */
export function createChatMessage(overrides: Partial<ChatMessageData> = {}): ChatMessageData {
  const timestamp = now();
  return {
    id: nextId('msg-'),
    sessionId: nextId('session-'),
    role: 'user',
    content: `Test message content ${counter}`,
    parts: null,
    toolCalls: null,
    createdAt: timestamp,
    tokenCount: null,
    ...overrides,
  };
}

/**
 * Create a user preferences test object
 */
export function createUserPreferences(overrides: Partial<UserPreferencesData> = {}): UserPreferencesData {
  const timestamp = now();
  return {
    id: nextId('pref-'),
    userId: nextId('user-'),
    category: 'general',
    key: `test-key-${counter}`,
    value: JSON.stringify({ enabled: true }),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

/**
 * Create an activity log test object
 */
export function createActivityLog(overrides: Partial<ActivityLogData> = {}): ActivityLogData {
  return {
    id: nextId('activity-'),
    userId: nextId('user-'),
    action: 'sandbox.create',
    resourceType: 'sandbox',
    resourceId: nextId('sandbox-'),
    metadata: null,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: now(),
    ...overrides,
  };
}

/**
 * Create a provider config test object
 */
export function createProviderConfig(overrides: Partial<ProviderConfigData> = {}): ProviderConfigData {
  const timestamp = now();
  return {
    id: nextId('provider-'),
    userId: nextId('user-'),
    providerId: 'openai',
    apiKey: 'sk-test-' + nanoid(32),
    isEnabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

// ============================================================================
// Batch Factories
// ============================================================================

/**
 * Create multiple sandboxes
 */
export function createSandboxes(count: number, overrides: Partial<SandboxData> = {}): SandboxData[] {
  return Array.from({ length: count }, () => createSandbox(overrides));
}

/**
 * Create multiple chat messages for a session
 */
export function createConversation(
  sessionId: string,
  exchanges: number,
  overrides: Partial<ChatMessageData> = {}
): ChatMessageData[] {
  const messages: ChatMessageData[] = [];
  
  for (let i = 0; i < exchanges; i++) {
    messages.push(
      createChatMessage({
        sessionId,
        role: 'user',
        content: `User message ${i + 1}`,
        ...overrides,
      }),
      createChatMessage({
        sessionId,
        role: 'assistant',
        content: `Assistant response ${i + 1}`,
        ...overrides,
      })
    );
  }
  
  return messages;
}

// ============================================================================
// Reset
// ============================================================================

/**
 * Reset the counter (useful between test files)
 */
export function resetFactories(): void {
  counter = 0;
}
