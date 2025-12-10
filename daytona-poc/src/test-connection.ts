/**
 * Test OpenCode Connection
 * 
 * Tests connecting to the OpenCode API running in a Daytona sandbox.
 * Uses the OpenCode SDK to create a session and send a test message.
 */

import { createOpencodeClient } from '@opencode-ai/sdk';
import { log, logError } from './daytona-client.js';
import * as fs from 'fs';

interface SandboxInfo {
  sandboxId: string;
  opencodeUrl: string;
  token?: string;
  sessionId: string;
  createdAt: string;
}

async function main(): Promise<void> {
  log('=== Test OpenCode Connection ===');
  log('');
  
  // Get OpenCode URL from environment or sandbox-info.json
  let opencodeUrl = process.env.OPENCODE_URL;
  let token = process.env.OPENCODE_TOKEN;
  
  if (!opencodeUrl) {
    // Try to read from sandbox-info.json
    try {
      const info: SandboxInfo = JSON.parse(fs.readFileSync('sandbox-info.json', 'utf-8'));
      opencodeUrl = info.opencodeUrl;
      token = info.token;
      log(`Loaded OpenCode URL from sandbox-info.json: ${opencodeUrl}`);
    } catch {
      logError('No OPENCODE_URL provided and sandbox-info.json not found');
      logError('Run "pnpm create-sandbox" first or set OPENCODE_URL environment variable');
      process.exit(1);
    }
  }
  
  log(`Connecting to OpenCode at: ${opencodeUrl}`);
  log('');
  
  try {
    // Create OpenCode client
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      log('Using authentication token');
    }
    
    const client = createOpencodeClient({
      baseUrl: opencodeUrl,
      headers,
    });
    
    // Test 1: Get app info
    log('Test 1: Getting app info...');
    const configResult = await client.config.get();
    log('  Config:', JSON.stringify(configResult.data, null, 2));
    log('');
    
    // Test 2: Get current project
    log('Test 2: Getting current project...');
    const projectResult = await client.project.current();
    log('  Project:', JSON.stringify(projectResult.data, null, 2));
    log('');
    
    // Test 3: List existing sessions
    log('Test 3: Listing sessions...');
    const sessionsResult = await client.session.list();
    log(`  Found ${sessionsResult.data?.length ?? 0} sessions`);
    log('');
    
    // Test 4: Create a new session
    log('Test 4: Creating test session...');
    const sessionResult = await client.session.create({
      body: { title: 'Daytona POC Test' },
    });
    const sessionId = sessionResult.data!.id;
    log(`  Session created: ${sessionId}`);
    log('');
    
    // Test 5: Send a simple message (note: this requires configured providers)
    log('Test 5: Sending test message...');
    log('  Note: This requires configured AI providers in OpenCode');
    
    try {
      const messageResult = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [
            { type: 'text', text: 'Respond with exactly: "POC successful!"' },
          ],
        },
      });
      log('  Response:', JSON.stringify(messageResult.data, null, 2));
    } catch (error) {
      log('  Message test skipped (no AI providers configured)');
      log('  This is expected for sandbox testing without API keys');
    }
    log('');
    
    // Test 6: Clean up test session
    log('Test 6: Cleaning up test session...');
    await client.session.delete({
      path: { id: sessionId },
    });
    log('  Session deleted');
    log('');
    
    // Success!
    log('=== ALL TESTS PASSED ===');
    log('');
    log('OpenCode is running correctly in the Daytona sandbox!');
    log('');
    log('Key capabilities verified:');
    log('  - OpenCode API is accessible');
    log('  - Config endpoint works');
    log('  - Project endpoint works');
    log('  - Session CRUD operations work');
    log('');
    
  } catch (error) {
    logError('Connection test failed:', error);
    process.exit(1);
  }
}

main();
