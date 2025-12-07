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

  // Coolify
  coolify: {
    url: getEnv('COOLIFY_URL', 'http://localhost:8000'),
    token: getEnv('COOLIFY_TOKEN', ''),
    projectUuid: getEnv('COOLIFY_PROJECT_UUID', ''),
    serverUuid: getEnv('COOLIFY_SERVER_UUID', ''),
  },

  // Forgejo
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
  },
  
  // Container Registry (Forgejo Package Registry)
  registry: {
    // Registry URL (without protocol, used for docker pull)
    url: getEnv('OPENCODE_REGISTRY_URL', 'forgejo.superchotu.com'),
    // Registry owner/namespace
    owner: getEnv('OPENCODE_REGISTRY_OWNER', 'rakeshgangwar'),
    // Current container version to deploy
    version: getEnv('OPENCODE_CONTAINER_VERSION', '0.0.1'),
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
