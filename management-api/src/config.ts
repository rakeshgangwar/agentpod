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
    token: getEnv('FORGEJO_TOKEN', ''),
    owner: getEnv('FORGEJO_OWNER', 'admin'),
  },

  // OpenCode containers
  opencode: {
    image: getEnv('OPENCODE_IMAGE', 'opencode-server:latest'),
    basePort: getEnvInt('OPENCODE_BASE_PORT', 4001),
  },

  // Database
  database: {
    path: getEnv('DATABASE_PATH', './data/database.sqlite'),
  },
} as const;

export type Config = typeof config;
