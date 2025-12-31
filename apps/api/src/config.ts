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
  // Docker Orchestrator Configuration
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
  // Traefik Reverse Proxy Configuration
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
  // Domain Configuration
  // ==========================================================================
  domain: {
    // Base domain for sandbox URLs (e.g., "localhost" or "agentpod.dev")
    base: getEnv('BASE_DOMAIN', 'localhost'),
    // Protocol (http or https)
    protocol: getEnv('DOMAIN_PROTOCOL', 'http'),
  },

  // ==========================================================================
  // Data Storage Configuration
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
  // Better Auth Configuration
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

  // OpenCode containers
  opencode: {
    // Base port for OpenCode containers (auto-incremented per container)
    basePort: getEnvInt('OPENCODE_BASE_PORT', 4001),
    // Wildcard domain for OpenCode container URLs (e.g., superchotu.com -> opencode-{slug}.superchotu.com)
    wildcardDomain: getEnv('OPENCODE_WILDCARD_DOMAIN', ''),
    // OpenCode server port inside containers
    serverPort: getEnvInt('OPENCODE_SERVER_PORT', 4096),
  },
  
  // Container Registry
  registry: {
    url: getEnv('OPENCODE_REGISTRY_URL', 'forgejo.superchotu.com'),
    owner: getEnv('OPENCODE_REGISTRY_OWNER', 'rakeshgangwar'),
    version: getEnv('OPENCODE_CONTAINER_VERSION', '0.4.0'),
  },

  cloudflare: {
    enabled: getEnvBool('ENABLE_CLOUDFLARE_SANDBOXES', false),
    accountId: getEnv('CLOUDFLARE_ACCOUNT_ID', ''),
    apiToken: getEnv('CLOUDFLARE_API_TOKEN', ''),
    workerUrl: getEnv('CLOUDFLARE_WORKER_URL', ''),
    r2Bucket: getEnv('CLOUDFLARE_R2_BUCKET', 'agentpod-workspaces'),
    defaultProvider: getEnv('DEFAULT_SANDBOX_PROVIDER', 'docker') as 'docker' | 'cloudflare',
    autoSelect: getEnvBool('AUTO_SELECT_PROVIDER', false),
  },

  // Database
  database: {
    path: getEnv('DATABASE_PATH', './data/database.sqlite'),
  },
  
  // Management API public URL (for containers to call back)
  publicUrl: getEnv('MANAGEMENT_API_PUBLIC_URL', 'http://localhost:3001'),
  
  // Default user ID (until we have proper authentication)
  defaultUserId: getEnv('DEFAULT_USER_ID', 'default-user'),
} as const;

export type Config = typeof config;
