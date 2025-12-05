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
import { opencodeRoutes } from './routes/opencode.ts';

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
  // API routes - Note: Order matters! More specific routes should come first
  // OpenCode proxy routes must come before generic project routes to avoid /:id catching everything
  .route('/api/projects', opencodeRoutes) // OpenCode proxy routes are under /api/projects/:id/opencode/*
  .route('/api/projects', syncRoutes) // Sync routes are under /api/projects/:id/sync
  .route('/api/projects', projectRoutes)
  .route('/api/providers', providerRoutes);

// Export type for Hono Client (type-safe RPC from mobile app)
export type AppType = typeof app;

// Start server
const port = config.port;

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              Management API - Portable Command Center         ║
╠═══════════════════════════════════════════════════════════════╣
║  Port:        ${String(port).padEnd(46)}║
║  Environment: ${config.nodeEnv.padEnd(46)}║
║  Database:    ${config.database.path.padEnd(46)}║
╠═══════════════════════════════════════════════════════════════╣
║  Project Endpoints:                                           ║
║  - GET  /api/projects              List projects              ║
║  - POST /api/projects              Create project             ║
║  - GET  /api/projects/:id          Get project                ║
║  - POST /api/projects/:id/start    Start container            ║
║  - POST /api/projects/:id/stop     Stop container             ║
╠═══════════════════════════════════════════════════════════════╣
║  OpenCode Proxy Endpoints (per project):                      ║
║  - GET  /api/projects/:id/opencode/session     List sessions  ║
║  - POST /api/projects/:id/opencode/session     Create session ║
║  - POST .../session/:sid/message               Send message   ║
║  - GET  /api/projects/:id/opencode/event       SSE stream     ║
║  - GET  /api/projects/:id/opencode/file        List files     ║
╠═══════════════════════════════════════════════════════════════╣
║  Provider Endpoints:                                          ║
║  - GET  /api/providers             List providers             ║
║  - POST /api/providers/:id/configure  Set credentials         ║
╚═══════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
