/**
 * Auth Validator Service
 * 
 * A lightweight service that validates requests for nginx auth_request.
 * Checks for valid X-Container-Token header OR valid SSO session cookie.
 * 
 * Returns:
 * - 200: Request is authenticated (valid token or SSO session)
 * - 401: Request is not authenticated (redirect to SSO)
 */

import { Hono } from 'hono';

// Configuration
const PORT = parseInt(process.env.AUTH_VALIDATOR_PORT || '4098');
const CONTAINER_API_TOKEN = process.env.CONTAINER_API_TOKEN || '';
const SSO_URL = process.env.SSO_URL || 'https://sso.superchotu.com';

const app = new Hono();

/**
 * Validate auth for API routes (/opencode/, /acp/)
 * 
 * nginx calls this endpoint via auth_request.
 * We check for valid token first (for server-to-server calls),
 * then fall back to SSO auth check (for browser access).
 */
app.get('/validate', async (c) => {
  // 1. Check for valid X-Container-Token header
  const token = c.req.header('X-Container-Token');
  
  if (token && CONTAINER_API_TOKEN && token === CONTAINER_API_TOKEN) {
    // Valid token - allow access
    console.log('[Auth Validator] Token validated successfully');
    return c.text('OK', 200);
  }

  // 2. No valid token - check SSO session by proxying to SSO auth endpoint
  // Forward the cookie to SSO to validate the session
  const cookie = c.req.header('Cookie') || '';
  
  if (!cookie) {
    // No cookie - must authenticate
    console.log('[Auth Validator] No token or cookie - returning 401');
    return c.text('Unauthorized', 401);
  }

  try {
    // Call SSO auth endpoint to validate session
    const ssoAuthUrl = `${SSO_URL}/oauth2/auth`;
    const response = await fetch(ssoAuthUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'X-Original-URL': c.req.header('X-Original-URL') || '',
      },
    });

    if (response.ok) {
      // Valid SSO session - forward user info headers
      const email = response.headers.get('X-Auth-Request-Email') || '';
      const user = response.headers.get('X-Auth-Request-User') || '';
      
      console.log(`[Auth Validator] SSO session valid for user: ${email || user}`);
      
      return new Response('OK', {
        status: 200,
        headers: {
          'X-Auth-Request-Email': email,
          'X-Auth-Request-User': user,
        },
      });
    } else {
      console.log(`[Auth Validator] SSO session invalid - status ${response.status}`);
      return c.text('Unauthorized', 401);
    }
  } catch (error) {
    console.error('[Auth Validator] Error checking SSO:', error);
    // On error, deny access
    return c.text('Unauthorized', 401);
  }
});

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    hasToken: !!CONTAINER_API_TOKEN,
    ssoUrl: SSO_URL,
  });
});

// Start server
console.log(`[Auth Validator] Starting on port ${PORT}`);
console.log(`[Auth Validator] Token configured: ${CONTAINER_API_TOKEN ? 'yes' : 'no'}`);
console.log(`[Auth Validator] SSO URL: ${SSO_URL}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
