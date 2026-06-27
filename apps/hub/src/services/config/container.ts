/**
 * AgentPod Configuration to Container Specification
 *
 * Converts AgentPodConfig into a SandboxConfig that can be used
 * by the container orchestrator to create containers.
 */

import { config } from "../../config.ts";
import type {
  SandboxConfig,
  VolumeMount,
  PortMapping,
  ResourceLimits,
} from "../orchestrator/types.ts";
import { getResourceTier } from "../orchestrator/types.ts";
import {
  generateSandboxLabels,
  type TraefikRouteConfig,
  generateTraefikLabels,
} from "../orchestrator/traefik.ts";
import type {
  AgentPodConfig,
  FlavorId,
  AddonId,
  ResourceTierId,
  PortsConfig,
  AddonsConfig,
} from "./schema.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for container specification generation
 */
export interface ContainerSpecOptions {
  /** Unique sandbox ID */
  sandboxId: string;

  /** User ID (for ownership) */
  userId: string;

  /** Repository path on host filesystem */
  repoPath: string;

  /** Custom hostname (if not auto-generated) */
  hostname?: string;
}

/**
 * Addon configuration for container
 */
interface AddonSpec {
  id: AddonId;
  enabled: boolean;
  port?: number;
  env?: Record<string, string>;
  labels?: Record<string, string>;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Docker image names for each flavor
 */
const FLAVOR_IMAGES: Record<FlavorId, string> = {
  bare: "agentpod-bare",
  js: "agentpod-js",
  python: "agentpod-python",
  go: "agentpod-go",
  rust: "agentpod-rust",
  fullstack: "agentpod-fullstack",
  polyglot: "agentpod-polyglot",
};

/**
 * Addon port mappings (container port for each addon)
 */
const ADDON_PORTS: Partial<Record<AddonId, number>> = {
  "code-server": 8080,
  gui: 6080, // noVNC port
};

/**
 * Default environment variables for all containers
 */
const DEFAULT_ENV: Record<string, string> = {
  TERM: "xterm-256color",
  LANG: "en_US.UTF-8",
  WORKSPACE_DIR: "/home/workspace",
};

/**
 * OpenCode server port
 */
const OPENCODE_PORT = 4096;

/**
 * Homepage port
 */
const HOMEPAGE_PORT = 4000;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the full Docker image name for a flavor
 */
export function getFlavorImage(flavor: FlavorId): string {
  const imageName = FLAVOR_IMAGES[flavor] ?? FLAVOR_IMAGES.js;
  const hasRegistry = config.registry.url && config.registry.owner;
  return hasRegistry
    ? `${config.registry.url}/${config.registry.owner}/${imageName}:${config.registry.version}`
    : `${imageName}:${config.registry.version}`;
}

/**
 * Get resource limits for a tier
 */
export function getTierResources(tier: ResourceTierId): ResourceLimits {
  return getResourceTier(tier);
}

/**
 * Convert PortsConfig to PortMapping array
 */
function convertPorts(portsConfig: PortsConfig | undefined): PortMapping[] {
  const ports: PortMapping[] = [];

  // Always add OpenCode and Homepage ports
  ports.push({
    container: OPENCODE_PORT,
    label: "OpenCode",
    public: true,
    protocol: "tcp",
  });

  ports.push({
    container: HOMEPAGE_PORT,
    label: "Homepage",
    public: true,
    protocol: "tcp",
  });

  // Add user-defined ports
  if (portsConfig) {
    for (const [portKey, portValue] of Object.entries(portsConfig)) {
      const containerPort = parseInt(portKey, 10);
      if (isNaN(containerPort)) continue;

      if (typeof portValue === "number") {
        ports.push({
          container: containerPort,
          label: `Port ${containerPort}`,
          public: false,
          protocol: "tcp",
        });
      } else {
        ports.push({
          container: portValue.port ?? containerPort,
          label: portValue.label ?? `Port ${containerPort}`,
          public: portValue.public ?? false,
          protocol: portValue.protocol === "tcp" ? "tcp" : "tcp",
        });
      }
    }
  }

  return ports;
}

/**
 * Process addons configuration and return addon specs
 */
function processAddons(addonsConfig: AddonsConfig | undefined): AddonSpec[] {
  const addons: AddonSpec[] = [];

  if (!addonsConfig) return addons;

  const addonIds: AddonId[] = ["code-server", "gui", "gpu", "databases", "cloud"];

  for (const id of addonIds) {
    const addonConfig = addonsConfig[id];
    if (!addonConfig) continue;

    const enabled =
      typeof addonConfig === "boolean" ? addonConfig : addonConfig.enabled;

    if (enabled) {
      addons.push({
        id,
        enabled: true,
        port: ADDON_PORTS[id],
      });
    }
  }

  return addons;
}

/**
 * Generate environment variables from config
 */
function generateEnv(
  agentConfig: AgentPodConfig,
  options: ContainerSpecOptions,
  addons: AddonSpec[]
): Record<string, string> {
  const env: Record<string, string> = {
    ...DEFAULT_ENV,

    // Sandbox identification
    SANDBOX_ID: options.sandboxId,
    SANDBOX_USER_ID: options.userId,
    
    // Management API URL for fetching config on container restart
    // Container can fetch fresh config from this URL
    MANAGEMENT_API_URL: `http://${config.docker.network === 'host' ? 'localhost' : 'agentpod-api'}:${config.port}`,
    USER_ID: options.userId,

    // Project info
    PROJECT_NAME: agentConfig.project.name,

    // Git configuration
    GIT_AUTHOR_NAME: agentConfig.git?.userName ?? "AgentPod User",
    GIT_AUTHOR_EMAIL: agentConfig.git?.userEmail ?? "user@agentpod.dev",
    GIT_COMMITTER_NAME: agentConfig.git?.userName ?? "AgentPod User",
    GIT_COMMITTER_EMAIL: agentConfig.git?.userEmail ?? "user@agentpod.dev",
  };

  // Add user-defined environment variables
  if (agentConfig.environment?.variables) {
    Object.assign(env, agentConfig.environment.variables);
  }

  // Add OpenCode configuration
  if (agentConfig.opencode) {
    if (agentConfig.opencode.provider) {
      env.OPENCODE_PROVIDER = agentConfig.opencode.provider;
    }
    if (agentConfig.opencode.model) {
      env.OPENCODE_MODEL = agentConfig.opencode.model;
    }
  }

  // Add addon-specific environment variables
  for (const addon of addons) {
    if (addon.id === "code-server") {
      env.CODE_SERVER_ENABLED = "true";
    }
    if (addon.id === "gui") {
      env.GUI_ENABLED = "true";
    }
    if (addon.env) {
      Object.assign(env, addon.env);
    }
  }

  // Add database connection strings if services are enabled
  if (agentConfig.services) {
    if (agentConfig.services.postgres) {
      env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/app";
    }
    if (agentConfig.services.mysql) {
      env.MYSQL_URL = "mysql://root:root@localhost:3306/app";
    }
    if (agentConfig.services.redis) {
      env.REDIS_URL = "redis://localhost:6379";
    }
    if (agentConfig.services.mongodb) {
      env.MONGODB_URL = "mongodb://localhost:27017/app";
    }
  }

  return env;
}

/**
 * Generate volume mounts
 */
function generateVolumes(options: ContainerSpecOptions): VolumeMount[] {
  const volumes: VolumeMount[] = [];

  // Mount the repository to /home/workspace (matches container WORKSPACE env)
  volumes.push({
    host: options.repoPath,
    container: "/home/workspace",
    mode: "rw",
    type: "bind",
  });

  return volumes;
}

/**
 * Generate container labels (including Traefik labels)
 */
function generateLabels(
  agentConfig: AgentPodConfig,
  options: ContainerSpecOptions,
  addons: AddonSpec[]
): Record<string, string> {
  // Use the generateSandboxLabels helper for Traefik routing
  const slug = options.sandboxId;

  // Determine which addon ports are enabled
  const hasCodeServer = addons.some((a) => a.id === "code-server");
  const hasVnc = addons.some((a) => a.id === "gui");

  // Generate base labels with Traefik routing
  const labels = generateSandboxLabels({
    sandboxId: options.sandboxId,
    slug,
    baseDomain: config.domain.base,
    opencodePort: OPENCODE_PORT,
    homepagePort: HOMEPAGE_PORT,
    codeServerPort: hasCodeServer ? ADDON_PORTS["code-server"] : undefined,
    vncPort: hasVnc ? ADDON_PORTS["gui"] : undefined,
    tls: config.traefik.tls,
    certResolver: config.traefik.certResolver || undefined,
    network: config.traefik.network,
  });

  // Add additional metadata labels
  labels["agentpod.sandbox.user"] = options.userId;
  labels["agentpod.project.name"] = agentConfig.project.name;
  labels["agentpod.flavor"] = agentConfig.environment?.base ?? "js";
  labels["agentpod.tier"] = agentConfig.resources?.tier ?? "builder";

  // Add addon labels
  for (const addon of addons) {
    labels[`agentpod.addon.${addon.id}`] = "true";
  }

  // Add Traefik labels for user-defined public ports
  if (agentConfig.ports) {
    const userRoutes: TraefikRouteConfig[] = [];

    for (const [portKey, portValue] of Object.entries(agentConfig.ports)) {
      const containerPort = parseInt(portKey, 10);
      if (isNaN(containerPort)) continue;

      const isPublic = typeof portValue === "object" && portValue.public;
      if (isPublic) {
        userRoutes.push({
          name: `${slug}-port-${containerPort}`,
          port: containerPort,
          subdomain: `${slug}-${containerPort}`,
          baseDomain: config.domain.base,
          tls: config.traefik.tls,
          certResolver: config.traefik.certResolver || undefined,
        });
      }
    }

    if (userRoutes.length > 0) {
      const userPortLabels = generateTraefikLabels(userRoutes, {
        network: config.traefik.network,
        defaultTls: config.traefik.tls,
        defaultCertResolver: config.traefik.certResolver || undefined,
      });
      Object.assign(labels, userPortLabels);
    }
  }

  return labels;
}

// =============================================================================
// Main Conversion Function
// =============================================================================

/**
 * Convert AgentPodConfig to SandboxConfig
 *
 * This is the main function that transforms a parsed configuration file
 * into a specification that can be used to create a container.
 *
 * @param agentConfig - Parsed AgentPod configuration
 * @param options - Container specification options
 * @returns SandboxConfig ready for container creation
 */
export function configToContainerSpec(
  agentConfig: AgentPodConfig,
  options: ContainerSpecOptions
): SandboxConfig {
  // Determine flavor and get image
  const flavor = agentConfig.environment?.base ?? "js";
  const image = getFlavorImage(flavor);

  // Get resource limits
  const tier = agentConfig.resources?.tier ?? "builder";
  const resources = getTierResources(tier);

  // Override resources if specified
  if (agentConfig.resources?.cpuCores) {
    resources.cpus = String(agentConfig.resources.cpuCores);
  }
  if (agentConfig.resources?.memoryGb) {
    resources.memory = `${agentConfig.resources.memoryGb}g`;
  }

  // Process addons
  const addons = processAddons(agentConfig.addons);

  // Convert ports
  const ports = convertPorts(agentConfig.ports);

  // Add addon ports
  for (const addon of addons) {
    if (addon.port) {
      ports.push({
        container: addon.port,
        label: addon.id,
        public: true,
        protocol: "tcp",
      });
    }
  }

  // Generate environment variables
  const env = generateEnv(agentConfig, options, addons);

  // Generate volumes
  const volumes = generateVolumes(options);

  // Generate labels
  const labels = generateLabels(agentConfig, options, addons);

  // Build sandbox config
  const sandboxConfig: SandboxConfig = {
    id: options.sandboxId,
    name: agentConfig.project.name,
    image,
    env,
    volumes,
    ports,
    labels,
    resources,
    network: config.docker.network,
    workingDir: "/workspace",
  };

  // Add startup command if lifecycle.init is defined
  if (agentConfig.lifecycle?.init) {
    sandboxConfig.command = ["/bin/sh", "-c", agentConfig.lifecycle.init];
  } else {
    // Default command to keep container running for development/testing
    // This runs a simple sleep loop that can be interrupted
    sandboxConfig.command = ["/bin/sh", "-c", "echo 'Container started. Waiting...' && tail -f /dev/null"];
  }

  return sandboxConfig;
}

/**
 * Generate a minimal container spec for quick testing
 *
 * @param sandboxId - Unique sandbox ID
 * @param projectName - Project name
 * @param repoPath - Repository path
 * @param userId - User ID
 * @returns Minimal SandboxConfig
 */
export function createMinimalContainerSpec(
  sandboxId: string,
  projectName: string,
  repoPath: string,
  userId: string
): SandboxConfig {
  const minimalConfig: AgentPodConfig = {
    project: {
      name: projectName,
    },
    environment: {
      base: "js",
    },
  };

  return configToContainerSpec(minimalConfig, {
    sandboxId,
    userId,
    repoPath,
  });
}

/**
 * Validate that a container spec is valid for deployment
 *
 * @param spec - Container specification to validate
 * @returns Validation result with errors if any
 */
export function validateContainerSpec(spec: SandboxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required fields
  if (!spec.id) errors.push("Missing sandbox ID");
  if (!spec.name) errors.push("Missing sandbox name");
  if (!spec.image) errors.push("Missing Docker image");

  // Image format validation
  if (spec.image && !spec.image.includes(":")) {
    errors.push("Docker image should include a tag (e.g., image:tag)");
  }

  // Volume validation
  for (const volume of spec.volumes) {
    if (!volume.host) errors.push("Volume missing host path");
    if (!volume.container) errors.push("Volume missing container path");
  }

  // Port validation
  for (const port of spec.ports) {
    if (!port.container || port.container < 1 || port.container > 65535) {
      errors.push(`Invalid container port: ${port.container}`);
    }
    if (port.host && (port.host < 1 || port.host > 65535)) {
      errors.push(`Invalid host port: ${port.host}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
