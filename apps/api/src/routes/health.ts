import { Hono } from 'hono';

export const healthRoutes = new Hono()
  .get('/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  })
  .get('/api/info', (c) => {
    return c.json({
      name: 'Management API',
      version: '0.4.0',
      description: 'Portable Command Center - Project & Container Orchestration',
      status: 'running',
    });
  })
  // Public endpoint to check signup status (for frontend to show appropriate UI)
  .get('/api/auth/signup-status', async (c) => {
    const { isSignupEnabled } = await import('../models/system-settings');
    const enabled = await isSignupEnabled();
    return c.json({
      enabled,
      message: enabled 
        ? 'Public registration is open' 
        : 'Public registration is disabled. Contact an administrator to create an account.',
    });
  });
