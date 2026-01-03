import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  discoverOAuthForServer,
  initiateOAuthFlow,
  handleOAuthCallback,
  getOAuthSessionForServer,
  revokeOAuthSession,
} from "../services/mcp-oauth.service";
import { config } from "../config";

const mcpOauthRoutes = new Hono();

function getUser(c: { get: (key: string) => unknown }): { id: string } | null {
  const user = c.get("user") as { id?: string } | undefined;
  if (!user?.id || user.id === "anonymous") {
    return null;
  }
  return { id: user.id };
}

const discoverParamsSchema = z.object({
  serverId: z.string().min(1),
});

mcpOauthRoutes.get(
  "/discover/:serverId",
  zValidator("param", discoverParamsSchema),
  async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { serverId } = c.req.valid("param");

    try {
      const discovery = await discoverOAuthForServer(serverId, user.id);
      return c.json(discovery);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  }
);

mcpOauthRoutes.post(
  "/initiate/:serverId",
  zValidator("param", discoverParamsSchema),
  async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { serverId } = c.req.valid("param");

    const baseUrl = config.publicUrl || `http://localhost:${config.port}`;
    const redirectUri = `${baseUrl}/api/mcp/oauth/callback`;

    try {
      const result = await initiateOAuthFlow(serverId, user.id, redirectUri);
      return c.json({
        authorizationUrl: result.authorizationUrl,
        state: result.state,
        session: result.session,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  }
);

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

mcpOauthRoutes.get(
  "/callback",
  zValidator("query", callbackQuerySchema),
  async (c) => {
    const { code, state } = c.req.valid("query");

    const baseUrl = config.publicUrl || `http://localhost:${config.port}`;
    const redirectUri = `${baseUrl}/api/mcp/oauth/callback`;

    const result = await handleOAuthCallback(code, state, redirectUri);

    if (result.success) {
      const successHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authorization Successful</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
              h1 { color: #22c55e; margin: 0 0 1rem; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Authorization Successful</h1>
              <p>You can close this window and return to AgentPod.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth_callback', success: true, mcpServerId: '${result.mcpServerId}' }, '*');
                setTimeout(() => window.close(), 1500);
              }
            </script>
          </body>
        </html>
      `;
      return c.html(successHtml);
    } else {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authorization Failed</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
              h1 { color: #ef4444; margin: 0 0 1rem; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Authorization Failed</h1>
              <p>${result.error || "Unknown error occurred"}</p>
              <p>Please close this window and try again.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth_callback', success: false, error: '${result.error}' }, '*');
              }
            </script>
          </body>
        </html>
      `;
      return c.html(errorHtml);
    }
  }
);

mcpOauthRoutes.get(
  "/status/:serverId",
  zValidator("param", discoverParamsSchema),
  async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { serverId } = c.req.valid("param");

    try {
      const [oauthSession, discovery] = await Promise.all([
        getOAuthSessionForServer(serverId, user.id),
        discoverOAuthForServer(serverId, user.id),
      ]);
      
      return c.json({
        hasSession: !!oauthSession,
        session: oauthSession || undefined,
        discovery,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  }
);

mcpOauthRoutes.delete(
  "/revoke/:serverId",
  zValidator("param", discoverParamsSchema),
  async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { serverId } = c.req.valid("param");

    try {
      await revokeOAuthSession(serverId, user.id);
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  }
);

export { mcpOauthRoutes };
