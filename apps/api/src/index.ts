import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config.ts';
import { initDatabase } from './db/drizzle.ts';
import { auth } from './auth/drizzle-auth.ts';
import { authMiddleware } from './auth/middleware.ts';
import { healthRoutes } from './routes/health.ts';
import { userRoutes } from './routes/users.ts';
import { resourceTiersRouter } from './routes/resource-tiers.ts';
import { flavorsRouter } from './routes/flavors.ts';
import { addonsRouter } from './routes/addons.ts';
import { providerRoutes } from './routes/providers.ts';
import { preferencesRoutes } from './routes/preferences.ts';
import { activityRoutes } from './routes/activity.ts';
import { accountRoutes } from './routes/account.ts';
// v2 Routes (direct Docker orchestrator)
import { sandboxRoutes, sandboxHealthRoutes } from './routes/sandboxes.ts';
import { repoRoutes } from './routes/repos.ts';
import { chatRoutes } from './routes/chat.ts';
// Terminal WebSocket routes
import { terminalRoutes, terminalWebsocket, cleanupTerminalSessions } from './routes/terminal.ts';
// Onboarding system routes
import { knowledgeRoutes } from './routes/knowledge.ts';
import { onboardingRoutes } from './routes/onboarding.ts';
import { mcpKnowledgeRoutes } from './routes/mcp-knowledge.ts';
// Middleware
import { activityLoggerMiddleware } from './middleware/activity-logger.ts';
// Sync services
import { startSyncForRunningSandboxes, stopAllSync } from './services/sync/opencode-sync.ts';
import { startArchivalService, stopArchivalService } from './services/sync/activity-archival.ts';

// Initialize database (includes running migrations)
console.log('Initializing database...');
await initDatabase();

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
  // Activity logging middleware (logs POST/PUT/PATCH/DELETE actions)
  .use('/api/*', activityLoggerMiddleware)
  // User configuration endpoints
  .route('/api/users', userRoutes) // User OpenCode config
  .route('/api/users/me/preferences', preferencesRoutes) // User preferences (sync)
  .route('/api/users/me/activity', activityRoutes) // User activity log
  .route('/api/account', accountRoutes) // Account management (delete, export)
  // LLM Provider configuration endpoints
  .route('/api/providers', providerRoutes) // LLM provider management
  // Modular container configuration endpoints
  .route('/api/resource-tiers', resourceTiersRouter) // Resource tiers (CPU, memory, storage)
  .route('/api/flavors', flavorsRouter) // Container flavors (language environments)
  .route('/api/addons', addonsRouter) // Container addons (optional features)
  // v2 API routes (direct Docker orchestrator)
  .route('/api/v2/sandboxes', sandboxRoutes) // Sandbox management
  .route('/api/v2/sandboxes', chatRoutes) // Chat history (persisted)
  .route('/api/v2/sandboxes', terminalRoutes) // Terminal WebSocket (interactive shell)
  .route('/api/v2/repos', repoRoutes) // Git repository management
  .route('/api/v2/health', sandboxHealthRoutes) // Health checks (includes /docker)
  // Onboarding system endpoints
  .route('/api/knowledge', knowledgeRoutes) // Knowledge documents
  .route('/api/onboarding', onboardingRoutes) // Onboarding sessions
  .route('/api/mcp/knowledge', mcpKnowledgeRoutes); // MCP Knowledge server

// Export type for Hono Client (type-safe RPC from mobile app)
export type AppType = typeof app;

// Export app for testing
export { app };

// Start sync services for running sandboxes
console.log('Starting sync services for running sandboxes...');
startSyncForRunningSandboxes().catch((error) => {
  console.error('Failed to start sync services:', error);
});

// Start activity archival service (runs daily at 3 AM)
console.log('Starting activity archival service...');
startArchivalService();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  cleanupTerminalSessions();
  stopAllSync();
  stopArchivalService();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  cleanupTerminalSessions();
  stopAllSync();
  stopArchivalService();
  process.exit(0);
});

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
║  - WS   /api/v2/sandboxes/:id/terminal  Interactive terminal  ║
╠═══════════════════════════════════════════════════════════════╣
║  v2 OpenCode Endpoints (per sandbox):                         ║
║  - GET  /api/v2/sandboxes/:id/opencode/session   List sessions║
║  - POST /api/v2/sandboxes/:id/opencode/session   Create       ║
║  - POST .../session/:sid/message                 Send message ║
║  - GET  /api/v2/sandboxes/:id/opencode/event     SSE stream   ║
║  - GET  /api/v2/sandboxes/:id/opencode/file      List files   ║
╠═══════════════════════════════════════════════════════════════╣
║  v2 Chat History Endpoints (persisted):                       ║
║  - GET  .../chat/sessions             List sessions           ║
║  - GET  .../chat/sessions/:sid        Get session + messages  ║
║  - GET  .../chat/sessions/:sid/messages  Paginated messages   ║
║  - POST .../chat/sessions/:sid/sync   Force sync              ║
║  - DELETE .../chat/sessions/:sid      Archive session         ║
║  - POST /api/v2/sandboxes/:id/chat/sync  Full sync            ║
╠═══════════════════════════════════════════════════════════════╣
║  v2 Repository Endpoints:                                     ║
║  - GET  /api/v2/repos                 List repositories       ║
║  - POST /api/v2/repos                 Create repository       ║
║  - POST /api/v2/repos/clone           Clone from URL          ║
║  - GET  /api/v2/repos/:name/files     List files              ║
║  - GET  /api/v2/repos/:name/status    Git status              ║
║  - POST /api/v2/repos/:name/commit    Create commit           ║
║  - GET  /api/v2/health/docker         Docker health check     ║
╠═══════════════════════════════════════════════════════════════╣
║  User Preferences Endpoints:                                  ║
║  - GET  /api/users/me/preferences     Get preferences         ║
║  - PUT  /api/users/me/preferences     Replace preferences     ║
║  - PATCH /api/users/me/preferences    Partial update          ║
║  - GET  /api/users/me/preferences/version  Get version        ║
║  - GET  /api/users/me/preferences/sync     Check sync status  ║
║  - DELETE /api/users/me/preferences   Reset to defaults       ║
╠═══════════════════════════════════════════════════════════════╣
║  User Activity Endpoints:                                     ║
║  - GET  /api/users/me/activity        List activity logs      ║
║  - GET  /api/users/me/activity/stats  Get activity stats      ║
║  - GET  /api/users/me/activity/export Export as JSON/CSV      ║
╠═══════════════════════════════════════════════════════════════╣
║  Account Management Endpoints:                                ║
║  - GET  /api/account                  Get account info        ║
║  - DELETE /api/account                Delete account          ║
║  - GET  /api/account/data-export      Export all user data    ║
╠═══════════════════════════════════════════════════════════════╣
║  Onboarding System Endpoints:                                 ║
║  - GET  /api/knowledge                Search knowledge docs   ║
║  - GET  /api/knowledge/:id            Get document            ║
║  - GET  /api/knowledge/categories     List categories         ║
║  - GET  /api/knowledge/stats          Get statistics          ║
║  - POST /api/knowledge/search         Advanced search         ║
║  - GET  /api/onboarding               List sessions           ║
║  - POST /api/onboarding               Create session          ║
║  - GET  /api/onboarding/:id           Get session             ║
║  - POST /api/onboarding/:id/start     Start onboarding        ║
║  - POST /api/onboarding/:id/complete  Complete onboarding     ║
║  - GET  /api/onboarding/models/recommend  Model recommendations║
╠═══════════════════════════════════════════════════════════════╣
║  MCP Knowledge Server (for onboarding agent):                 ║
║  - POST /api/mcp/knowledge              MCP tool endpoint     ║
║    - tools/list: List available tools                         ║
║    - tools/call: search_knowledge, get_project_template,      ║
║                  get_agent_pattern, list_project_types, etc.  ║
╚═══════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
  websocket: terminalWebsocket,
};
