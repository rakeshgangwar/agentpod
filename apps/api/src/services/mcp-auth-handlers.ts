import { createLogger } from '../utils/logger.ts';
import { config } from '../config.ts';
import type { McpAuthConfig } from './mcp-credentials.ts';

const log = createLogger('mcp-auth-handlers');

export interface AuthHeaders {
  [key: string]: string;
}

export interface AuthEnvironment {
  [key: string]: string;
}

export interface PreparedAuth {
  headers: AuthHeaders;
  environment: AuthEnvironment;
}

export function prepareAuthForConnection(authConfig: McpAuthConfig): PreparedAuth {
  const headers: AuthHeaders = {};
  const environment: AuthEnvironment = {};

  switch (authConfig.type) {
    case 'none':
      break;

    case 'api_key':
      if (authConfig.apiKey) {
        headers['X-API-Key'] = authConfig.apiKey;
      }
      break;

    case 'bearer_token':
      if (authConfig.bearerToken) {
        headers['Authorization'] = `Bearer ${authConfig.bearerToken}`;
      }
      break;

    case 'oauth2':
      if (authConfig.oauth2?.accessToken) {
        headers['Authorization'] = `Bearer ${authConfig.oauth2.accessToken}`;
      }
      break;

    case 'env_vars':
      if (authConfig.envVars) {
        Object.assign(environment, authConfig.envVars);
      }
      break;
  }

  if (authConfig.headers) {
    Object.assign(headers, authConfig.headers);
  }

  return { headers, environment };
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export async function exchangeOAuth2Code(
  tokenUrl: string,
  clientId: string,
  clientSecret: string | undefined,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<OAuth2TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
  });

  if (clientSecret) {
    params.set('client_secret', clientSecret);
  }

  if (codeVerifier) {
    params.set('code_verifier', codeVerifier);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    log.error('OAuth2 token exchange failed', { tokenUrl, status: response.status, error });
    throw new Error(`OAuth2 token exchange failed: ${response.status}`);
  }

  return response.json() as Promise<OAuth2TokenResponse>;
}

export async function refreshOAuth2Token(
  tokenUrl: string,
  clientId: string,
  clientSecret: string | undefined,
  refreshToken: string
): Promise<OAuth2TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });

  if (clientSecret) {
    params.set('client_secret', clientSecret);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    log.error('OAuth2 token refresh failed', { tokenUrl, status: response.status, error });
    throw new Error(`OAuth2 token refresh failed: ${response.status}`);
  }

  return response.json() as Promise<OAuth2TokenResponse>;
}

export function isTokenExpired(expiresAt: string | undefined, bufferSeconds = 300): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const buffer = bufferSeconds * 1000;

  return now >= expiryTime - buffer;
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

async function sha256(message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export async function generatePKCEChallenge(): Promise<PKCEChallenge> {
  const codeVerifier = generateRandomString(128);
  const hash = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hash);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

export function buildAuthorizationUrl(
  authorizationUrl: string,
  clientId: string,
  redirectUri: string,
  scope: string | undefined,
  state: string,
  pkce?: PKCEChallenge
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  if (scope) {
    params.set('scope', scope);
  }

  if (pkce) {
    params.set('code_challenge', pkce.codeChallenge);
    params.set('code_challenge_method', pkce.codeChallengeMethod);
  }

  return `${authorizationUrl}?${params.toString()}`;
}

export interface OAuth2ProviderConfig {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  defaultScopes?: string;
  usePKCE?: boolean;
}

export const KNOWN_OAUTH2_PROVIDERS: Record<string, OAuth2ProviderConfig> = {
  github: {
    name: 'GitHub',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    defaultScopes: 'repo read:user',
    usePKCE: false,
  },
  google: {
    name: 'Google',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    defaultScopes: 'openid profile email',
    usePKCE: true,
  },
  microsoft: {
    name: 'Microsoft',
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    defaultScopes: 'openid profile email',
    usePKCE: true,
  },
  slack: {
    name: 'Slack',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    defaultScopes: 'chat:write channels:read',
    usePKCE: false,
  },
};

export function getOAuth2ProviderConfig(provider: string): OAuth2ProviderConfig | undefined {
  return KNOWN_OAUTH2_PROVIDERS[provider.toLowerCase()];
}

export function getOAuthCallbackUrl(serverId: string): string {
  return `${config.publicUrl}/api/mcp/servers/${serverId}/oauth/callback`;
}
