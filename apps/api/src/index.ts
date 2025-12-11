import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config.ts';
import { initDatabase } from './db/index.ts';
import { runMigrations, migrations } from './db/migrations.ts';
import { authMiddleware } from './middleware/auth.ts';
import { healthRoutes } from './routes/health.ts';
import { projectRoutes } from './routes/projects.ts';
import { providerRoutes } from './routes/providers.ts';
import { syncRoutes } from './routes/sync.ts';
import { opencodeRoutes } from './routes/opencode.ts';
import { userRoutes } from './routes/users.ts';
import { containerTiersRouter } from './routes/container-tiers.ts';
import { resourceTiersRouter } from './routes/resource-tiers.ts';
import { flavorsRouter } from './routes/flavors.ts';
import { addonsRouter } from './routes/addons.ts';

// Initialize database
console.log('Initializing database...');
initDatabase();

// Run migrations
console.log('Running migrations...');
runMigrations(migrations);

// Create the Hono app
const app = new Hono()
  // Middleware
  .use('*', logger())
  .use('*', cors())
  // Health routes are public (no auth required)
  .route('/', healthRoutes)
  // Protected API routes require authentication (Keycloak OAuth or API key)
  .use('/api/*', authMiddleware)
  // API routes - Note: Order matters! More specific routes should come first
  // OpenCode proxy routes must come before generic project routes to avoid /:id catching everything
  .route('/api/projects', opencodeRoutes) // OpenCode proxy routes are under /api/projects/:id/opencode/*
  .route('/api/projects', syncRoutes) // Sync routes are under /api/projects/:id/sync
  .route('/api/projects', projectRoutes)
  .route('/api/providers', providerRoutes)
  .route('/api/users', userRoutes) // User OpenCode config routes
  .route('/api/container-tiers', containerTiersRouter) // Container tier definitions (legacy)
  .route('/api/resource-tiers', resourceTiersRouter) // Resource tiers (CPU, memory, storage)
  .route('/api/flavors', flavorsRouter) // Container flavors (language environments)
  .route('/api/addons', addonsRouter); // Container addons (optional features)

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
║  User OpenCode Config Endpoints:                              ║
║  - GET  /api/users/:id/opencode/config      Full config       ║
║  - PUT  /api/users/:id/opencode/settings    Update settings   ║
║  - PUT  /api/users/:id/opencode/agents-md   Update AGENTS.md  ║
║  - GET  /api/users/:id/opencode/files       List files        ║
║  - PUT  /api/users/:id/opencode/files/:t/:n Upsert file       ║
╠═══════════════════════════════════════════════════════════════╣
║  Sync Endpoints (per project):                                ║
║  - GET  /api/projects/:id/sync/status       Get sync status   ║
║  - POST /api/projects/:id/sync              Trigger sync      ║
║  - POST /api/projects/:id/sync/commit-config Commit config    ║
╠═══════════════════════════════════════════════════════════════╣
║  Provider Endpoints:                                          ║
║  - GET  /api/providers             List providers             ║
║  - POST /api/providers/:id/configure  Set credentials         ║
╠═══════════════════════════════════════════════════════════════╣
║  Container Tier Endpoints (Legacy):                           ║
║  - GET  /api/container-tiers         List all tiers           ║
║  - GET  /api/container-tiers/default Get default tier         ║
║  - GET  /api/container-tiers/:id     Get tier by ID           ║
╠═══════════════════════════════════════════════════════════════╣
║  Modular Container Endpoints:                                 ║
║  - GET  /api/resource-tiers          List resource tiers      ║
║  - GET  /api/resource-tiers/default  Get default tier         ║
║  - GET  /api/flavors                 List language flavors    ║
║  - GET  /api/flavors/default         Get default flavor       ║
║  - GET  /api/addons                  List all addons          ║
║  - GET  /api/addons/by-category/:c   Get addons by category   ║
║  - POST /api/addons/validate         Validate addon config    ║
╚═══════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
