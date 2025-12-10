/**
 * Daytona SDK Client Wrapper
 * 
 * Provides a configured Daytona client for the POC.
 */

import { Daytona } from '@daytonaio/sdk';
import { config } from './config.js';

let daytonaClient: Daytona | null = null;

/**
 * Get or create the Daytona client instance
 */
export function getDaytonaClient(): Daytona {
  if (!daytonaClient) {
    daytonaClient = new Daytona({
      apiKey: config.daytona.apiKey || undefined,
      apiUrl: config.daytona.apiUrl,
    });
  }
  return daytonaClient;
}

/**
 * Helper to sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log with timestamp
 */
export function log(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

/**
 * Log error with timestamp
 */
export function logError(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR: ${message}`, ...args);
}
