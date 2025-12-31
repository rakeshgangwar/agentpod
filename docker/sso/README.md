# AgentPod Central SSO Service

Centralized OAuth2 authentication service for all AgentPod containers.

## Overview

This service handles all OAuth2 authentication with Keycloak. Individual containers don't need their own oauth2-proxy - they validate sessions by calling this central service.

**Domain:** `sso.superchotu.com`

## Architecture

```
User visits https://hello.superchotu.com/
    ↓
Container's nginx calls: https://sso.superchotu.com/oauth2/auth
    ↓
If 401 (not authenticated):
    Redirect to: https://sso.superchotu.com/oauth2/start?rd=https://hello.superchotu.com/
    ↓
    SSO redirects to Keycloak (auth.superchotu.com)
    ↓
    User authenticates
    ↓
    Keycloak redirects to: https://sso.superchotu.com/oauth2/callback
    ↓
    SSO sets cookie for .superchotu.com
    ↓
    Redirects back to: https://hello.superchotu.com/
    ↓
If 202 (authenticated):
    nginx proxies to internal service
```

## Deployment to Coolify

### 1. Create Docker Compose Application

1. In Coolify, create a new **Docker Compose** application
2. Point to this directory (`docker/sso/`)
3. Set domain to `sso.superchotu.com`
4. Port mapping: `4180:4180`

### 2. Set Environment Variables

In Coolify's environment variables, add:

| Variable | Description | How to get |
|----------|-------------|------------|
| `OAUTH2_PROXY_CLIENT_SECRET` | Keycloak client secret | Keycloak Admin → Clients → agentpod-container → Credentials |
| `OAUTH2_PROXY_COOKIE_SECRET` | Cookie encryption key | Generate: `openssl rand -base64 24 \| tr -d '\n'` |

**Important:** The cookie secret must be exactly 32 characters (24 bytes base64 encoded).

### 3. Update Keycloak Client

In Keycloak Admin Console:

1. Go to **Clients** → **agentpod-container**
2. Set **Valid redirect URIs** to: `https://sso.superchotu.com/oauth2/callback`
3. Set **Web origins** to: `https://*.superchotu.com`
4. Save

### 4. Deploy

Deploy the application in Coolify. Verify it's working:

```bash
curl https://sso.superchotu.com/ping
# Should return: OK

curl -I https://sso.superchotu.com/oauth2/auth
# Should return: 401 Unauthorized (no session cookie)
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/ping` | Health check (no auth required) |
| `/oauth2/auth` | Validate session cookie (used by nginx auth_request) |
| `/oauth2/start` | Start OAuth2 flow (accepts `?rd=` for redirect) |
| `/oauth2/callback` | OAuth2 callback from Keycloak |
| `/oauth2/sign_out` | Sign out and clear session |

## Troubleshooting

### Check logs
```bash
docker logs <container-id>
```

### Verify Keycloak connectivity
```bash
curl https://auth.superchotu.com/realms/agentpod/.well-known/openid-configuration
```

### Test authentication flow manually
1. Visit `https://sso.superchotu.com/oauth2/start?rd=https://example.superchotu.com/`
2. Should redirect to Keycloak login
3. After login, should redirect back to the `rd` URL with a session cookie

## Security Notes

- Cookies are set with `Secure`, `HttpOnly`, and `SameSite=Lax` flags
- Session cookies are shared across all `*.superchotu.com` subdomains
- PKCE (S256) is used for enhanced OAuth2 security
- SSL verification is enabled for Keycloak communication
