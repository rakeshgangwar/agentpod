/**
 * Configuration for Management API
 * Loads environment variables with sensible defaults
 */

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for environment variable: ${key}`);
  }
  return parsed;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

export const config = {
  // Server
  port: getEnvInt('PORT', 3001),
  nodeEnv: getEnv('NODE_ENV', 'development'),

  // Authentication
  auth: {
    token: getEnv('API_TOKEN', 'dev-token-change-in-production'),
  },

  // Encryption for provider credentials
  encryption: {
    // 32-byte (256-bit) key for AES-256-GCM
    // In production, this should be a secure random value stored securely
    key: getEnv('ENCRYPTION_KEY', 'dev-encryption-key-32-bytes-long!'),
  },

  // ==========================================================================
  // NEW: Docker Orchestrator Configuration
  // ==========================================================================
  docker: {
    // Docker socket path (default: /var/run/docker.sock)
    socketPath: getEnv('DOCKER_SOCKET', '/var/run/docker.sock'),
    // Docker host for TCP connection (if not using socket)
    host: getEnv('DOCKER_HOST', ''),
    // Docker port for TCP connection
    port: getEnvInt('DOCKER_PORT', 2375),
    // Container name prefix
    containerPrefix: getEnv('DOCKER_CONTAINER_PREFIX', 'agentpod'),
    // Default Docker network for containers
    network: getEnv('DOCKER_NETWORK', 'agentpod-net'),
  },

  // ==========================================================================
  // NEW: Traefik Reverse Proxy Configuration
  // ==========================================================================
  traefik: {
    // Whether Traefik is enabled
    enabled: getEnvBool('TRAEFIK_ENABLED', true),
    // Docker network Traefik is connected to
    network: getEnv('TRAEFIK_NETWORK', 'agentpod-net'),
    // Whether to enable TLS by default
    tls: getEnvBool('TRAEFIK_TLS', false),
    // Certificate resolver name (for production)
    certResolver: getEnv('TRAEFIK_CERT_RESOLVER', ''),
  },

  // ==========================================================================
  // NEW: Domain Configuration
  // ==========================================================================
  domain: {
    // Base domain for sandbox URLs (e.g., "localhost" or "agentpod.dev")
    base: getEnv('BASE_DOMAIN', 'localhost'),
    // Protocol (http or https)
    protocol: getEnv('DOMAIN_PROTOCOL', 'http'),
  },

  // ==========================================================================
  // NEW: Data Storage Configuration
  // ==========================================================================
  data: {
    // Base directory for all persistent data
    dir: getEnv('DATA_DIR', './data'),
    // Git repositories directory (container path)
    reposDir: getEnv('REPOS_DIR', './data/repos'),
    // Container volumes directory (container path)
    volumesDir: getEnv('VOLUMES_DIR', './data/volumes'),
    // Host path prefix for bind mounts (when running in Docker)
    // This is needed because bind mounts must use host paths, not container paths
    // If not set, assumes running directly on host and uses reposDir/volumesDir as-is
    hostPathPrefix: getEnv('HOST_PATH_PREFIX', ''),
  },

  // ==========================================================================
  // NEW: Better Auth Configuration (replaces Keycloak)
  // ==========================================================================
  betterAuth: {
    // GitHub OAuth provider
    github: {
      clientId: getEnv('GITHUB_CLIENT_ID', ''),
      clientSecret: getEnv('GITHUB_CLIENT_SECRET', ''),
    },
    // Session configuration
    session: {
      // Session cookie secret (for signing)
      secret: getEnv('SESSION_SECRET', 'dev-session-secret-change-in-production'),
    },
  },

  // ==========================================================================
  // LEGACY: Coolify Configuration (deprecated, kept for migration)
  // ==========================================================================
  coolify: {
    url: getEnv('COOLIFY_URL', 'http://localhost:8000'),
    token: getEnv('COOLIFY_TOKEN', ''),
    projectUuid: getEnv('COOLIFY_PROJECT_UUID', ''),
    serverUuid: getEnv('COOLIFY_SERVER_UUID', ''),
  },

  // ==========================================================================
  // LEGACY: Forgejo Configuration (deprecated, kept for migration)
  // ==========================================================================
  forgejo: {
    url: getEnv('FORGEJO_URL', 'http://localhost:3000'),
    // Public URL for clone operations (accessible from containers)
    // This should be the HTTPS URL through Traefik, without port
    publicUrl: getEnv('FORGEJO_PUBLIC_URL', getEnv('FORGEJO_URL', 'http://localhost:3000')),
    token: getEnv('FORGEJO_TOKEN', ''),
    owner: getEnv('FORGEJO_OWNER', 'admin'),
  },

  // OpenCode containers
  opencode: {
    // Legacy image setting (deprecated, use registry settings below)
    image: getEnv('OPENCODE_IMAGE', 'opencode-server:latest'),
    basePort: getEnvInt('OPENCODE_BASE_PORT', 4001),
    // Wildcard domain for OpenCode container URLs (e.g., superchotu.com -> opencode-{slug}.superchotu.com)
    wildcardDomain: getEnv('OPENCODE_WILDCARD_DOMAIN', ''),
    // OpenCode server port inside containers
    serverPort: getEnvInt('OPENCODE_SERVER_PORT', 4096),
  },
  
  // Centralized SSO Service (legacy)
  sso: {
    // URL of the central SSO service (oauth2-proxy at sso.superchotu.com)
    url: getEnv('SSO_URL', 'https://sso.superchotu.com'),
  },
  
  // Container Registry
  registry: {
    // Registry URL (without protocol, used for docker pull)
    url: getEnv('OPENCODE_REGISTRY_URL', 'forgejo.superchotu.com'),
    // Registry owner/namespace
    owner: getEnv('OPENCODE_REGISTRY_OWNER', 'rakeshgangwar'),
    // Current container version to deploy
    version: getEnv('OPENCODE_CONTAINER_VERSION', '0.4.0'),
  },

  // Database
  database: {
    path: getEnv('DATABASE_PATH', './data/database.sqlite'),
  },
  
  // Management API public URL (for containers to call back)
  publicUrl: getEnv('MANAGEMENT_API_PUBLIC_URL', 'http://localhost:3001'),
  
  // Default user ID (until we have proper authentication)
  defaultUserId: getEnv('DEFAULT_USER_ID', 'default-user'),
  
  // ==========================================================================
  // LEGACY: Keycloak Configuration (deprecated, will be replaced by Better Auth)
  // ==========================================================================
  keycloak: {
    // Keycloak realm URL (OIDC issuer)
    realmUrl: getEnv('KEYCLOAK_REALM_URL', 'https://auth.superchotu.com/realms/agentpod'),
    // Service account client for API-to-container calls
    apiClientId: getEnv('KEYCLOAK_API_CLIENT_ID', 'agentpod-api'),
    apiClientSecret: getEnv('KEYCLOAK_API_CLIENT_SECRET', ''),
    // Container client for oauth2-proxy
    containerClientId: getEnv('KEYCLOAK_CONTAINER_CLIENT_ID', 'agentpod-container'),
    containerClientSecret: getEnv('KEYCLOAK_CONTAINER_CLIENT_SECRET', ''),
    // Cookie secret for oauth2-proxy (32-byte base64)
    cookieSecret: getEnv('KEYCLOAK_COOKIE_SECRET', ''),
  },
} as const;

export type Config = typeof config;
