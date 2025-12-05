import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bearerAuth } from 'hono/bearer-auth';
import { config } from './config.ts';
import { initDatabase } from './db/index.ts';
import { healthRoutes } from './routes/health.ts';

// Initialize database
console.log('Initializing database...');
initDatabase();

// Create the Hono app
const app = new Hono()
  // Middleware
  .use('*', logger())
  .use('*', cors())
  // Health routes are public (no auth required)
  .route('/', healthRoutes)
  // Protected API routes require authentication
  .use('/api/*', bearerAuth({ token: config.auth.token }));

// Export type for Hono Client (type-safe RPC from mobile app)
export type AppType = typeof app;

// Start server
const port = config.port;

console.log(`
╔═══════════════════════════════════════════════════════════╗
║            Management API - Portable Command Center       ║
╠═══════════════════════════════════════════════════════════╣
║  Port:        ${String(port).padEnd(42)}║
║  Environment: ${config.nodeEnv.padEnd(42)}║
║  Database:    ${config.database.path.padEnd(42)}║
║  Health:      http://localhost:${port}/health${' '.repeat(20)}║
║  API Info:    http://localhost:${port}/api/info${' '.repeat(18)}║
╚═══════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
