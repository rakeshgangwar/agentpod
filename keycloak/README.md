# Keycloak Configuration for AgentPod

This directory contains Keycloak client configurations for the AgentPod platform.

## Realm Setup

All clients should be imported into the `agentpod` realm.

**Keycloak URL:** `https://auth.superchotu.com`  
**Realm:** `agentpod`  
**OIDC Discovery:** `https://auth.superchotu.com/realms/agentpod/.well-known/openid-configuration`

## Clients

### 1. agentpod-container

**Purpose:** OAuth2 authentication for development containers via oauth2-proxy

**Features:**
- Standard authorization code flow with PKCE
- Wildcard redirect URIs for `*.superchotu.com`
- Session sharing via cookie domain `.superchotu.com`

**Usage:**
- Used by oauth2-proxy running inside containers
- Protects homepage, OpenCode API, ACP Gateway, and Code Server

**Environment Variables for Container:**
```bash
OAUTH2_PROXY_CLIENT_ID=agentpod-container
OAUTH2_PROXY_CLIENT_SECRET=<from-keycloak>
OAUTH2_PROXY_COOKIE_SECRET=<generate-random-32-bytes>
```

### 2. agentpod-api

**Purpose:** Service account for Management API (machine-to-machine)

**Features:**
- Client credentials grant (no user interaction)
- Can call container APIs on behalf of the system
- Used for scheduled tasks, background jobs

**Usage:**
- Management API uses this to get tokens for calling container OpenCode/ACP APIs
- Tokens are valid for `agentpod-container` audience (accepted by containers)

**Environment Variables for API:**
```bash
KEYCLOAK_CLIENT_ID=agentpod-api
KEYCLOAK_CLIENT_SECRET=<from-keycloak>
KEYCLOAK_REALM_URL=https://auth.superchotu.com/realms/agentpod
```

### 3. agentpod-mobile

**Purpose:** Authentication for Tauri desktop and mobile applications

**Features:**
- Authorization code flow with PKCE (required for mobile/desktop)
- Device authorization grant (for CLI/headless scenarios)
- Custom URI schemes: `agentpod://`, `tauri://localhost`
- Offline access support for refresh tokens

**Usage:**
- Tauri app initiates login via system browser
- Receives callback at custom URI scheme
- Stores tokens securely in system keychain

**Redirect URIs:**
- `agentpod://callback` - Production desktop app
- `tauri://localhost/callback` - Tauri development
- `http://localhost:1420/callback` - Vite dev server

## Import Instructions

### Option 1: Keycloak Admin Console

1. Log in to Keycloak Admin Console
2. Select the `agentpod` realm
3. Go to **Clients** → **Import client**
4. Upload each JSON file:
   - `clients/agentpod-container.json`
   - `clients/agentpod-api.json`
   - `clients/agentpod-mobile.json`
5. After import, go to **Credentials** tab for each client
6. Click **Regenerate** to generate a new client secret
7. Copy and securely store the secrets

### Option 2: Keycloak CLI (kcadm)

```bash
# Login to Keycloak
kcadm.sh config credentials --server https://auth.superchotu.com \
  --realm master --user admin

# Import clients
kcadm.sh create clients -r agentpod -f clients/agentpod-container.json
kcadm.sh create clients -r agentpod -f clients/agentpod-api.json
kcadm.sh create clients -r agentpod -f clients/agentpod-mobile.json
```

## Security Notes

1. **Client Secrets:** Never commit client secrets to git. Use environment variables.

2. **PKCE:** All user-facing clients use PKCE (S256) for enhanced security.

3. **Audience Mappers:** Each client includes audience mappers to ensure tokens are only valid for intended recipients.

4. **Cookie Security:** Container oauth2-proxy uses:
   - `cookie_secure = true` (HTTPS only)
   - `cookie_httponly = true` (No JS access)
   - `cookie_samesite = lax` (CSRF protection)
   - `cookie_domains = [".superchotu.com"]` (Session sharing)

5. **No Self-Registration:** Users must be created by admin. Disable self-registration in realm settings.

## Generate Cookie Secret

For oauth2-proxy cookie encryption:

```bash
# Generate a 32-byte random secret (base64 encoded)
openssl rand -base64 32 | tr -- '+/' '-_'
```

## Testing

### Test Container Client (Browser Flow)
1. Navigate to `https://hello.superchotu.com/`
2. Should redirect to Keycloak login
3. After login, should redirect back to homepage

### Test API Client (Service Account)
```bash
# Get token using client credentials
curl -X POST "https://auth.superchotu.com/realms/agentpod/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=agentpod-api" \
  -d "client_secret=YOUR_SECRET"
```

### Test Mobile Client (Device Flow)
```bash
# Start device authorization
curl -X POST "https://auth.superchotu.com/realms/agentpod/protocol/openid-connect/auth/device" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=agentpod-mobile"
```

## Troubleshooting

### "Invalid redirect_uri"
- Ensure the redirect URI exactly matches what's configured in Keycloak
- Check for trailing slashes
- Wildcard `*` only works at the subdomain level

### "Invalid audience"
- Check that the audience mapper is configured correctly
- Verify the token contains the expected `aud` claim

### "Cookie not set across subdomains"
- Ensure `cookie_domains` includes the dot prefix: `.superchotu.com`
- Verify all subdomains use HTTPS
