import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bearerAuth } from 'hono/bearer-auth';
import { config } from './config.ts';
import { initDatabase } from './db/index.ts';
import { healthRoutes } from './routes/health.ts';
import { projectRoutes } from './routes/projects.ts';
import { providerRoutes } from './routes/providers.ts';
import { syncRoutes } from './routes/sync.ts';

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
  .use('/api/*', bearerAuth({ token: config.auth.token }))
  // API routes
  .route('/api/projects', projectRoutes)
  .route('/api/providers', providerRoutes)
  .route('/api/projects', syncRoutes); // Sync routes are under /api/projects/:id/sync

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
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║  - GET  /health              Health check                 ║
║  - GET  /api/info            API info                     ║
║  - GET  /api/projects        List projects                ║
║  - POST /api/projects        Create project               ║
║  - GET  /api/projects/:id    Get project                  ║
║  - POST /api/projects/:id/start   Start container         ║
║  - POST /api/projects/:id/stop    Stop container          ║
║  - GET  /api/providers       List providers               ║
║  - POST /api/providers/:id/configure  Set credentials     ║
╚═══════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
