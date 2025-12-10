/**
 * Create OpenCode Sandbox in Daytona
 * 
 * This script:
 * 1. Creates a sandbox using our custom OpenCode image
 * 2. Creates a background session for opencode serve
 * 3. Starts opencode serve asynchronously
 * 4. Verifies the server is running
 * 5. Returns the preview URL for external access
 */

import { getDaytonaClient, sleep, log, logError } from './daytona-client.js';
import { config, validateConfig } from './config.js';
import type { Sandbox } from '@daytonaio/sdk';
import * as fs from 'fs';

const OPENCODE_SESSION_ID = 'opencode-serve';
const STARTUP_WAIT_MS = 10000; // Wait 10 seconds for OpenCode to start
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

async function waitForOpenCode(sandbox: Sandbox, port: number): Promise<boolean> {
  log(`Waiting for OpenCode to start on port ${port}...`);
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await sandbox.process.executeCommand(
        `curl -sf http://localhost:${port}/app || exit 1`,
        undefined,
        5
      );
      
      if (result.exitCode === 0) {
        log('OpenCode is responding!');
        log('Response:', result.result);
        return true;
      }
    } catch (error) {
      log(`Attempt ${i + 1}/${MAX_RETRIES}: OpenCode not ready yet...`);
    }
    
    await sleep(RETRY_DELAY_MS);
  }
  
  return false;
}

async function main(): Promise<void> {
  validateConfig();
  
  log('=== Daytona OpenCode Sandbox POC ===');
  log('');
  
  const daytona = getDaytonaClient();
  let sandbox: Sandbox | null = null;
  
  try {
    // Step 1: Create sandbox with custom OpenCode image
    log('Step 1: Creating sandbox...');
    log(`  Image: ${config.opencode.image}`);
    
    // SDK v0.11.x API: create(params, timeout)
    // NOTE: Don't specify resources - let Daytona use defaults
    // Resource limits don't work in Docker-in-Docker environments
    sandbox = await daytona.create(
      {
        image: config.opencode.image,
        // Labels for identification
        labels: {
          'app': 'opencode',
          'poc': 'daytona',
        },
      },
      120 // 2 minute timeout for image pull
    );
    
    log(`  Sandbox created: ${sandbox.id}`);
    log('');
    
    // Wait for sandbox to be ready
    log('Waiting for sandbox to start...');
    await sleep(10000); // Give it 10 seconds to start
    
    // Step 2: Verify OpenCode is installed
    log('Step 2: Verifying OpenCode installation...');
    const versionResult = await sandbox.process.executeCommand('opencode --version');
    log(`  OpenCode version: ${versionResult.result.trim()}`);
    log('');
    
    // Step 3: Create a background session
    log('Step 3: Creating background session...');
    await sandbox.process.createSession(OPENCODE_SESSION_ID);
    log(`  Session created: ${OPENCODE_SESSION_ID}`);
    log('');
    
    // Step 4: Start opencode serve asynchronously (THE KEY TEST!)
    log('Step 4: Starting OpenCode serve (async)...');
    log('  This is the critical test - running a long-running process in background');
    
    const startResult = await sandbox.process.executeSessionCommand(
      OPENCODE_SESSION_ID,
      {
        command: `opencode serve --port ${config.opencode.port} --hostname 0.0.0.0`,
        async: true, // Don't wait for completion - this is the key!
      }
    );
    
    log(`  Command started with cmdId: ${startResult.cmdId}`);
    log('');
    
    // Step 5: Wait for OpenCode to initialize
    log(`Step 5: Waiting ${STARTUP_WAIT_MS / 1000}s for OpenCode to initialize...`);
    await sleep(STARTUP_WAIT_MS);
    
    // Step 6: Verify OpenCode is running
    log('Step 6: Verifying OpenCode is running...');
    const isRunning = await waitForOpenCode(sandbox, config.opencode.port);
    
    if (!isRunning) {
      logError('OpenCode failed to start!');
      
      // Try to get logs from the session
      log('Checking session command logs...');
      try {
        const logs = await sandbox.process.getSessionCommandLogs(
          OPENCODE_SESSION_ID,
          startResult.cmdId!
        );
        log('Session logs:', logs);
      } catch (e) {
        logError('Could not get session logs:', e);
      }
      
      throw new Error('OpenCode server did not start');
    }
    log('');
    
    // Step 7: Get preview URL for external access
    // SDK v0.11.x: getPreviewLink returns string directly, not an object
    log('Step 7: Getting preview URL...');
    const previewUrl = sandbox.getPreviewLink(config.opencode.port);
    log(`  Preview URL: ${previewUrl}`);
    log('');
    
    // Success!
    log('=== SUCCESS ===');
    log('');
    log('OpenCode is running in Daytona sandbox!');
    log('');
    log('Sandbox Details:');
    log(`  Sandbox ID: ${sandbox.id}`);
    log(`  OpenCode URL: ${previewUrl}`);
    log(`  Session ID: ${OPENCODE_SESSION_ID}`);
    log('');
    log('To test the connection, run:');
    log(`  OPENCODE_URL="${previewUrl}" pnpm test-connection`);
    log('');
    log('To clean up, run:');
    log(`  SANDBOX_ID="${sandbox.id}" pnpm cleanup`);
    log('');
    
    // Save sandbox info to a file for other scripts
    const sandboxInfo = {
      sandboxId: sandbox.id,
      opencodeUrl: previewUrl,
      sessionId: OPENCODE_SESSION_ID,
      createdAt: new Date().toISOString(),
    };
    
    fs.writeFileSync('sandbox-info.json', JSON.stringify(sandboxInfo, null, 2));
    log('Sandbox info saved to sandbox-info.json');
    
  } catch (error) {
    logError('Failed to create OpenCode sandbox:', error);
    
    // Cleanup on failure
    if (sandbox) {
      log('Cleaning up sandbox...');
      try {
        await sandbox.delete();
        log('Sandbox deleted');
      } catch (e) {
        logError('Failed to delete sandbox:', e);
      }
    }
    
    process.exit(1);
  }
}

main();
