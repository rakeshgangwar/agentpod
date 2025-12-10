/**
 * Configuration for Daytona POC
 */

import 'dotenv/config';

export const config = {
  daytona: {
    apiUrl: process.env.DAYTONA_API_URL || 'http://localhost:3000/api',
    apiKey: process.env.DAYTONA_API_KEY || '',
  },
  opencode: {
    image: process.env.OPENCODE_IMAGE || 'daytonaio/sandbox:0.5.0-slim',
    port: parseInt(process.env.OPENCODE_PORT || '4096', 10),
  },
} as const;

export function validateConfig(): void {
  if (!config.daytona.apiKey) {
    console.warn('Warning: DAYTONA_API_KEY not set. You may need to authenticate via the dashboard first.');
  }
}
