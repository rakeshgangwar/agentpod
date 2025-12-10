/**
 * Cleanup Daytona Sandbox
 * 
 * Deletes a sandbox created by create-sandbox.ts
 */

import { getDaytonaClient, log, logError } from './daytona-client.js';
import { validateConfig } from './config.js';
import * as fs from 'fs';

interface SandboxInfo {
  sandboxId: string;
  opencodeUrl: string;
  token?: string;
  sessionId: string;
  createdAt: string;
}

async function main(): Promise<void> {
  validateConfig();
  
  log('=== Cleanup Daytona Sandbox ===');
  log('');
  
  // Get sandbox ID from environment or sandbox-info.json
  let sandboxId = process.env.SANDBOX_ID;
  
  if (!sandboxId) {
    // Try to read from sandbox-info.json
    try {
      const info: SandboxInfo = JSON.parse(fs.readFileSync('sandbox-info.json', 'utf-8'));
      sandboxId = info.sandboxId;
      log(`Loaded sandbox ID from sandbox-info.json: ${sandboxId}`);
    } catch {
      logError('No SANDBOX_ID provided and sandbox-info.json not found');
      logError('Run "pnpm create-sandbox" first or set SANDBOX_ID environment variable');
      process.exit(1);
    }
  }
  
  const daytona = getDaytonaClient();
  
  try {
    log(`Deleting sandbox: ${sandboxId}`);
    
    // Get sandbox reference and delete
    // Note: The SDK might have a direct delete method, but let's list first to verify it exists
    const sandboxes = await daytona.list();
    const sandbox = sandboxes.find(s => s.id === sandboxId);
    
    if (!sandbox) {
      logError(`Sandbox not found: ${sandboxId}`);
      log('');
      log('Available sandboxes:');
      for (const s of sandboxes) {
        log(`  - ${s.id}`);
      }
      process.exit(1);
    }
    
    // Delete the sandbox
    await sandbox.delete();
    
    log('Sandbox deleted successfully');
    log('');
    
    // Remove sandbox-info.json
    try {
      fs.unlinkSync('sandbox-info.json');
      log('Removed sandbox-info.json');
    } catch {
      // File might not exist
    }
    
    log('=== Cleanup Complete ===');
    
  } catch (error) {
    logError('Failed to delete sandbox:', error);
    process.exit(1);
  }
}

main();
