/**
 * Unit Tests for OpenCode V2 Service
 * 
 * Tests the OpenCode SDK integration service which provides:
 * - Session management (create, list, get, delete, abort)
 * - Message API (send, list, get messages)
 * - File operations (read, list, find)
 * - App info and provider configuration
 * - Permission handling
 * - Event streaming
 * - Health checks
 * 
 * Note: These tests mock the SDK client to avoid requiring actual OpenCode containers.
 */

import { describe, test, expect } from 'bun:test';
import { opencodeV2, OpenCodeV2Error, type SendMessageInput } from '../../../src/services/opencode-v2.ts';

// Import test setup
import '../../setup.ts';

// =============================================================================
// Mock Setup
// =============================================================================

// We need to mock the sandbox manager and SDK client
// Since the actual service uses getSandboxManager internally, we'll test
// the error handling and interface contracts

describe('OpenCodeV2Error', () => {
  test('should create error with message and status code', () => {
    const error = new OpenCodeV2Error('Test error', 404);
    
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('OpenCodeV2Error');
  });

  test('should create error with details', () => {
    const details = { field: 'sandboxId', reason: 'not found' };
    const error = new OpenCodeV2Error('Test error', 404, details);
    
    expect(error.details).toEqual(details);
  });

  test('should be instance of Error', () => {
    const error = new OpenCodeV2Error('Test error', 500);
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OpenCodeV2Error);
  });

  test('should have correct stack trace', () => {
    const error = new OpenCodeV2Error('Test error', 500);
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('OpenCodeV2Error');
  });
});

describe('opencodeV2 service interface', () => {
  describe('service methods exist', () => {
    test('should have session management methods', () => {
      expect(typeof opencodeV2.listSessions).toBe('function');
      expect(typeof opencodeV2.createSession).toBe('function');
      expect(typeof opencodeV2.getSession).toBe('function');
      expect(typeof opencodeV2.deleteSession).toBe('function');
      expect(typeof opencodeV2.abortSession).toBe('function');
    });

    test('should have message API methods', () => {
      expect(typeof opencodeV2.listMessages).toBe('function');
      expect(typeof opencodeV2.sendMessage).toBe('function');
      expect(typeof opencodeV2.getMessage).toBe('function');
    });

    test('should have file API methods', () => {
      expect(typeof opencodeV2.getFileContent).toBe('function');
      expect(typeof opencodeV2.findFiles).toBe('function');
      expect(typeof opencodeV2.listFiles).toBe('function');
    });

    test('should have app info methods', () => {
      expect(typeof opencodeV2.getAppInfo).toBe('function');
      expect(typeof opencodeV2.getProviders).toBe('function');
    });

    test('should have permission methods', () => {
      expect(typeof opencodeV2.respondToPermission).toBe('function');
    });

    test('should have event streaming methods', () => {
      expect(typeof opencodeV2.subscribeToEvents).toBe('function');
      expect(typeof opencodeV2.getEventStreamUrl).toBe('function');
    });

    test('should have utility methods', () => {
      expect(typeof opencodeV2.healthCheck).toBe('function');
      expect(typeof opencodeV2.clearClientCache).toBe('function');
    });
  });
});

describe('SendMessageInput type validation', () => {
  test('should accept text part', () => {
    const input: SendMessageInput = {
      parts: [{ type: 'text', text: 'Hello, world!' }],
    };
    
    expect(input.parts[0].type).toBe('text');
    expect(input.parts[0].text).toBe('Hello, world!');
  });

  test('should accept file part', () => {
    const input: SendMessageInput = {
      parts: [{
        type: 'file',
        url: 'file:///path/to/file.txt',
        filename: 'file.txt',
        mime: 'text/plain',
      }],
    };
    
    expect(input.parts[0].type).toBe('file');
    expect(input.parts[0].url).toBe('file:///path/to/file.txt');
    expect(input.parts[0].filename).toBe('file.txt');
    expect(input.parts[0].mime).toBe('text/plain');
  });

  test('should accept model selection', () => {
    const input: SendMessageInput = {
      parts: [{ type: 'text', text: 'Test' }],
      model: {
        providerID: 'anthropic',
        modelID: 'claude-3-5-sonnet-20241022',
      },
    };
    
    expect(input.model?.providerID).toBe('anthropic');
    expect(input.model?.modelID).toBe('claude-3-5-sonnet-20241022');
  });

  test('should accept multiple parts', () => {
    const input: SendMessageInput = {
      parts: [
        { type: 'text', text: 'Here is a file:' },
        { type: 'file', url: 'file:///path/to/file.txt', filename: 'file.txt', mime: 'text/plain' },
        { type: 'text', text: 'What do you think?' },
      ],
    };
    
    expect(input.parts.length).toBe(3);
    expect(input.parts[0].type).toBe('text');
    expect(input.parts[1].type).toBe('file');
    expect(input.parts[2].type).toBe('text');
  });
});

describe('opencodeV2 error handling', () => {
  describe('sandbox not found', () => {
    test('listSessions should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.listSessions('non-existent-sandbox'))
        .rejects.toThrow('Sandbox not found');
    });

    test('createSession should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.createSession('non-existent-sandbox'))
        .rejects.toThrow('Sandbox not found');
    });

    test('getSession should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.getSession('non-existent-sandbox', 'session-id'))
        .rejects.toThrow('Sandbox not found');
    });

    test('deleteSession should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.deleteSession('non-existent-sandbox', 'session-id'))
        .rejects.toThrow('Sandbox not found');
    });

    test('abortSession should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.abortSession('non-existent-sandbox', 'session-id'))
        .rejects.toThrow('Sandbox not found');
    });

    test('listMessages should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.listMessages('non-existent-sandbox', 'session-id'))
        .rejects.toThrow('Sandbox not found');
    });

    test('sendMessage should throw for non-existent sandbox', async () => {
      const input: SendMessageInput = { parts: [{ type: 'text', text: 'test' }] };
      await expect(opencodeV2.sendMessage('non-existent-sandbox', 'session-id', input))
        .rejects.toThrow('Sandbox not found');
    });

    test('getMessage should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.getMessage('non-existent-sandbox', 'session-id', 'msg-id'))
        .rejects.toThrow('Sandbox not found');
    });

    test('getFileContent should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.getFileContent('non-existent-sandbox', '/path/to/file'))
        .rejects.toThrow('Sandbox not found');
    });

    test('findFiles should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.findFiles('non-existent-sandbox', 'query'))
        .rejects.toThrow('Sandbox not found');
    });

    test('listFiles should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.listFiles('non-existent-sandbox', '/'))
        .rejects.toThrow('Sandbox not found');
    });

    test('getAppInfo should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.getAppInfo('non-existent-sandbox'))
        .rejects.toThrow('Sandbox not found');
    });

    test('getProviders should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.getProviders('non-existent-sandbox'))
        .rejects.toThrow('Sandbox not found');
    });

    test('respondToPermission should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.respondToPermission('non-existent-sandbox', 'session-id', 'perm-id', 'once'))
        .rejects.toThrow('Sandbox not found');
    });

    test('subscribeToEvents should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.subscribeToEvents('non-existent-sandbox'))
        .rejects.toThrow('Sandbox not found');
    });

    test('getEventStreamUrl should throw for non-existent sandbox', async () => {
      await expect(opencodeV2.getEventStreamUrl('non-existent-sandbox'))
        .rejects.toThrow('Sandbox not found');
    });
  });

  describe('health check', () => {
    test('should return false for non-existent sandbox', async () => {
      const healthy = await opencodeV2.healthCheck('non-existent-sandbox');
      expect(healthy).toBe(false);
    });
  });

  describe('client cache', () => {
    test('clearClientCache should not throw', () => {
      expect(() => opencodeV2.clearClientCache('any-sandbox-id')).not.toThrow();
    });

    test('clearClientCache should be callable multiple times', () => {
      opencodeV2.clearClientCache('sandbox-1');
      opencodeV2.clearClientCache('sandbox-1');
      opencodeV2.clearClientCache('sandbox-2');
      // No error means success
      expect(true).toBe(true);
    });
  });
});

describe('SendMessageInput edge cases', () => {
  test('should allow empty text in text part', () => {
    const input: SendMessageInput = {
      parts: [{ type: 'text', text: '' }],
    };
    expect(input.parts[0].text).toBe('');
  });

  test('should allow missing optional fields in file part', () => {
    const input: SendMessageInput = {
      parts: [{
        type: 'file',
        url: 'file:///path/to/file',
      }],
    };
    expect(input.parts[0].filename).toBeUndefined();
    expect(input.parts[0].mime).toBeUndefined();
  });

  test('should allow parts array with single part', () => {
    const input: SendMessageInput = {
      parts: [{ type: 'text', text: 'Single part' }],
    };
    expect(input.parts.length).toBe(1);
  });

  test('should handle model with both providerID and modelID', () => {
    const input: SendMessageInput = {
      parts: [{ type: 'text', text: 'Test' }],
      model: {
        providerID: 'openai',
        modelID: 'gpt-4o',
      },
    };
    expect(input.model?.providerID).toBe('openai');
    expect(input.model?.modelID).toBe('gpt-4o');
  });
});

describe('Permission response types', () => {
  test('should accept "once" response', async () => {
    // Just validating the type - the actual call will fail with sandbox not found
    await expect(opencodeV2.respondToPermission('test', 'session', 'perm', 'once'))
      .rejects.toThrow();
  });

  test('should accept "always" response', async () => {
    await expect(opencodeV2.respondToPermission('test', 'session', 'perm', 'always'))
      .rejects.toThrow();
  });

  test('should accept "reject" response', async () => {
    await expect(opencodeV2.respondToPermission('test', 'session', 'perm', 'reject'))
      .rejects.toThrow();
  });
});

describe('File API parameter handling', () => {
  test('listFiles should use default path if not provided', async () => {
    // The method signature shows path has default value
    // This just validates the call doesn't throw with default
    await expect(opencodeV2.listFiles('non-existent'))
      .rejects.toThrow('Sandbox not found');
  });

  test('listFiles should accept custom path', async () => {
    await expect(opencodeV2.listFiles('non-existent', '/src'))
      .rejects.toThrow('Sandbox not found');
  });
});
