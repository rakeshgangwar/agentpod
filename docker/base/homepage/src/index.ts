/**
 * AgentPod Homepage Service
 * 
 * Minimal dashboard for AgentPod development containers.
 * Shows project info, service links, and health status.
 */

import { Hono } from 'hono';

const app = new Hono();

// Configuration from environment
const PROJECT_NAME = process.env.PROJECT_NAME || 'AgentPod Project';
const PROJECT_SLUG = process.env.PROJECT_SLUG || 'project';
const WILDCARD_DOMAIN = process.env.WILDCARD_DOMAIN || 'superchotu.com';
const OPENCODE_PORT = process.env.OPENCODE_PORT || '4096';
const ACP_GATEWAY_PORT = process.env.ACP_GATEWAY_PORT || '4097';
const CODE_SERVER_ENABLED = process.env.ADDON_IDS?.includes('code-server') || false;

// Service health check
async function checkService(port: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Homepage route
app.get('/', async (c) => {
  const userEmail = c.req.header('X-Email') || c.req.header('X-Auth-Request-Email') || 'Unknown';
  const userName = c.req.header('X-User') || c.req.header('X-Auth-Request-User') || userEmail.split('@')[0];
  
  // Check service health in parallel
  const [opencodeHealth, acpHealth] = await Promise.all([
    checkService(OPENCODE_PORT),
    checkService(ACP_GATEWAY_PORT),
  ]);

  const baseUrl = `https://${PROJECT_SLUG}.${WILDCARD_DOMAIN}`;
  const codeServerUrl = CODE_SERVER_ENABLED ? `https://code-${PROJECT_SLUG}.${WILDCARD_DOMAIN}` : null;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${PROJECT_NAME} - AgentPod</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --surface: #141414;
      --border: #262626;
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --primary: #3b82f6;
      --success: #22c55e;
      --warning: #eab308;
      --error: #ef4444;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      flex: 1;
    }
    header {
      text-align: center;
      margin-bottom: 3rem;
      padding-top: 2rem;
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
    }
    .user-info {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.5rem;
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .user-info span {
      color: var(--text-muted);
    }
    .user-info strong {
      color: var(--text);
    }
    .services {
      display: grid;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .service {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.2s, transform 0.2s;
    }
    .service:hover {
      border-color: var(--primary);
      transform: translateY(-2px);
    }
    .service-info h3 {
      font-size: 1.25rem;
      margin-bottom: 0.25rem;
    }
    .service-info p {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .service-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .status-dot.healthy { background: var(--success); }
    .status-dot.unhealthy { background: var(--error); }
    .status-text {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .arrow {
      color: var(--text-muted);
      font-size: 1.5rem;
    }
    footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--border);
    }
    footer a {
      color: var(--primary);
      text-decoration: none;
    }
    footer a:hover {
      text-decoration: underline;
    }
    .logout-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: border-color 0.2s, color 0.2s;
    }
    .logout-btn:hover {
      border-color: var(--error);
      color: var(--error);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${PROJECT_NAME}</h1>
      <p class="subtitle">AgentPod Development Environment</p>
    </header>
    
    <div class="user-info">
      <div>
        <span>Signed in as</span>
        <strong>${userName}</strong>
      </div>
      <a href="/oauth2/sign_out?rd=https://auth.superchotu.com/realms/agentpod/protocol/openid-connect/logout" class="logout-btn">
        Sign Out
      </a>
    </div>
    
    <div class="services">
      ${codeServerUrl ? `
      <a href="${codeServerUrl}" class="service" target="_blank">
        <div class="service-info">
          <h3>Code Server</h3>
          <p>VS Code in your browser</p>
        </div>
        <div class="service-status">
          <span class="arrow">&rarr;</span>
        </div>
      </a>
      ` : ''}
      
      <a href="${baseUrl}/acp/" class="service" target="_blank">
        <div class="service-info">
          <h3>ACP Gateway</h3>
          <p>Multi-agent orchestration API</p>
        </div>
        <div class="service-status">
          <div class="status-dot ${acpHealth ? 'healthy' : 'unhealthy'}"></div>
          <span class="status-text">${acpHealth ? 'Healthy' : 'Unhealthy'}</span>
          <span class="arrow">&rarr;</span>
        </div>
      </a>
      
      <a href="${baseUrl}/opencode/" class="service" target="_blank">
        <div class="service-info">
          <h3>OpenCode API</h3>
          <p>AI coding assistant HTTP API</p>
        </div>
        <div class="service-status">
          <div class="status-dot ${opencodeHealth ? 'healthy' : 'unhealthy'}"></div>
          <span class="status-text">${opencodeHealth ? 'Healthy' : 'Unhealthy'}</span>
          <span class="arrow">&rarr;</span>
        </div>
      </a>
    </div>
  </div>
  
  <footer>
    <p>
      Powered by <a href="https://github.com/sst/opencode" target="_blank">OpenCode</a> |
      <a href="https://auth.superchotu.com/realms/agentpod/account" target="_blank">Manage Account</a>
    </p>
  </footer>
</body>
</html>`;

  return c.html(html);
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'healthy', service: 'homepage' });
});

// Start server
const PORT = parseInt(process.env.HOMEPAGE_PORT || '3000');

console.log(`[Homepage] Starting on port ${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
