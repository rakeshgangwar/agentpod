import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config.ts';
import { initDatabase } from './db/index.ts';
import { runMigrations, migrations } from './db/migrations.ts';
import { auth } from './auth/index.ts';
import { authMiddleware } from './auth/middleware.ts';
import { healthRoutes } from './routes/health.ts';
import { userRoutes } from './routes/users.ts';
import { resourceTiersRouter } from './routes/resource-tiers.ts';
import { flavorsRouter } from './routes/flavors.ts';
import { addonsRouter } from './routes/addons.ts';
import { providerRoutes } from './routes/providers.ts';
// v2 Routes (direct Docker orchestrator)
import { sandboxRoutes, sandboxHealthRoutes } from './routes/sandboxes.ts';
import { repoRoutes } from './routes/repos.ts';

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
  // CORS configuration - allow credentials for Better Auth cookies
  .use('*', cors({
    origin: (origin) => {
      // Allow requests from frontend (localhost in dev, production domain)
      const allowedOrigins = [
        'http://localhost:1420',  // Tauri dev
        'http://localhost:5173',  // Vite dev
        'tauri://localhost',      // Tauri production
        config.publicUrl,
      ];
      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }))
  // Health routes are public (no auth required)
  .route('/', healthRoutes)
  // Better Auth routes - handle authentication (public, no auth middleware)
  .on(['GET', 'POST'], '/api/auth/*', (c) => {
    return auth.handler(c.req.raw);
  })
  // Protected API routes require authentication (Better Auth session or API key)
  .use('/api/*', authMiddleware)
  // User configuration endpoints
  .route('/api/users', userRoutes) // User OpenCode config
  // LLM Provider configuration endpoints
  .route('/api/providers', providerRoutes) // LLM provider management
  // Modular container configuration endpoints
  .route('/api/resource-tiers', resourceTiersRouter) // Resource tiers (CPU, memory, storage)
  .route('/api/flavors', flavorsRouter) // Container flavors (language environments)
  .route('/api/addons', addonsRouter) // Container addons (optional features)
  // v2 API routes (direct Docker orchestrator)
  .route('/api/v2/sandboxes', sandboxRoutes) // Sandbox management
  .route('/api/v2/repos', repoRoutes) // Git repository management
  .route('/api/v2/health', sandboxHealthRoutes); // Health checks (includes /docker)

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
║  Auth Endpoints (Better Auth):                                ║
║  - POST /api/auth/sign-in/email       Email/password sign-in  ║
║  - POST /api/auth/sign-up/email       Email/password sign-up  ║
║  - POST /api/auth/sign-in/social      GitHub OAuth sign-in    ║
║  - GET  /api/auth/callback/github     OAuth callback          ║
║  - GET  /api/auth/session             Get current session     ║
║  - POST /api/auth/sign-out            Sign out                ║
╠═══════════════════════════════════════════════════════════════╣
║  LLM Provider Endpoints:                                      ║
║  - GET  /api/providers                List all providers      ║
║  - GET  /api/providers/configured     Configured providers    ║
║  - GET  /api/providers/default        Get default provider    ║
║  - POST /api/providers/:id/configure  Configure API key       ║
║  - POST /api/providers/:id/oauth/init Start OAuth device flow ║
║  - POST /api/providers/:id/set-default Set as default         ║
║  - DELETE /api/providers/:id          Remove credentials      ║
╠═══════════════════════════════════════════════════════════════╣
║  Modular Container Endpoints:                                 ║
║  - GET  /api/resource-tiers           List resource tiers     ║
║  - GET  /api/resource-tiers/default   Get default tier        ║
║  - GET  /api/flavors                  List language flavors   ║
║  - GET  /api/flavors/default          Get default flavor      ║
║  - GET  /api/addons                   List all addons         ║
║  - GET  /api/addons/by-category/:c    Get addons by category  ║
║  - POST /api/addons/validate          Validate addon config   ║
╠═══════════════════════════════════════════════════════════════╣
║  v2 Sandbox Endpoints (Direct Docker):                        ║
║  - GET  /api/v2/sandboxes             List sandboxes          ║
║  - POST /api/v2/sandboxes             Create sandbox          ║
║  - GET  /api/v2/sandboxes/:id         Get sandbox             ║
║  - DELETE /api/v2/sandboxes/:id       Delete sandbox          ║
║  - POST /api/v2/sandboxes/:id/start   Start sandbox           ║
║  - POST /api/v2/sandboxes/:id/stop    Stop sandbox            ║
║  - POST /api/v2/sandboxes/:id/exec    Execute command         ║
║  - GET  /api/v2/sandboxes/:id/logs    Get logs                ║
║  - GET  /api/v2/sandboxes/:id/stats   Get resource stats      ║
╠═══════════════════════════════════════════════════════════════╣
║  v2 OpenCode Endpoints (per sandbox):                         ║
║  - GET  /api/v2/sandboxes/:id/opencode/session   List sessions║
║  - POST /api/v2/sandboxes/:id/opencode/session   Create       ║
║  - POST .../session/:sid/message                 Send message ║
║  - GET  /api/v2/sandboxes/:id/opencode/event     SSE stream   ║
║  - GET  /api/v2/sandboxes/:id/opencode/file      List files   ║
╠═══════════════════════════════════════════════════════════════╣
║  v2 Repository Endpoints:                                     ║
║  - GET  /api/v2/repos                 List repositories       ║
║  - POST /api/v2/repos                 Create repository       ║
║  - POST /api/v2/repos/clone           Clone from URL          ║
║  - GET  /api/v2/repos/:name/files     List files              ║
║  - GET  /api/v2/repos/:name/status    Git status              ║
║  - POST /api/v2/repos/:name/commit    Create commit           ║
║  - GET  /api/v2/health/docker         Docker health check     ║
╚═══════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
