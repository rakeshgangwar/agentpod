/**
 * Container types for resource allocation, flavors, and addons.
 */

// =============================================================================
// Legacy Container Tier Types (deprecated, use modular types below)
// =============================================================================

/** Resources allocated to a container tier (legacy) */
export interface TierResources {
  cpu: number;
  memory_gb: number;
  storage_gb: number;
}

/** Features available in a container tier (legacy) */
export interface TierFeatures {
  code_server: boolean;
  vnc_access: boolean;
  ssh_access: boolean;
  persistent_storage: boolean;
}

/** Container tier definition (legacy) */
export interface ContainerTier {
  id: string;
  name: string;
  description: string;
  resources: TierResources;
  features: TierFeatures;
  price_per_hour: number;
  is_available: boolean;
}

// =============================================================================
// Modular Container Types
// =============================================================================

/**
 * Resource tier - defines CPU, memory, and storage limits
 */
export interface ResourceTier {
  id: string;                    // 'starter', 'builder', 'creator', 'power'
  name: string;                  // Display name
  description: string | null;    // Description of the tier
  resources: {
    cpuCores: number;            // Number of CPU cores
    memoryGb: number;            // Memory in GB
    storageGb: number;           // Storage in GB
  };
  priceMonthly: number;          // Price per month in USD
  isDefault: boolean;            // Default tier for new projects
  sortOrder: number;             // Display order
}

/**
 * Container flavor - language/framework-specific image
 */
export interface ContainerFlavor {
  id: string;                    // 'js', 'python', 'go', 'rust', 'fullstack', 'polyglot'
  name: string;                  // Display name
  description: string | null;    // Description of the flavor
  languages: string[];           // Supported languages
  imageSizeMb: number | null;    // Approximate image size in MB
  isDefault: boolean;            // Default flavor for new projects
  sortOrder: number;             // Display order
}

/**
 * Addon category for grouping
 */
export type AddonCategory = 'interface' | 'compute' | 'storage' | 'devops';

/**
 * Container addon - optional feature that can be added to containers
 */
export interface ContainerAddon {
  id: string;                    // 'gui', 'code-server', 'gpu', 'databases', 'cloud'
  name: string;                  // Display name
  description: string | null;    // Description of the addon
  category: AddonCategory;       // Category for grouping
  imageSizeMb: number | null;    // Additional image size in MB
  port: number | null;           // Port exposed by the addon (if any)
  requiresGpu: boolean;          // Whether the addon requires GPU
  requiresFlavor: string | null; // Required flavor (if any)
  priceMonthly: number;          // Additional price per month in USD
  sortOrder: number;             // Display order
}

/**
 * Modular container configuration for a project
 */
export interface ModularContainerConfig {
  resourceTierId: string;        // Resource tier ID
  flavorId: string;              // Container flavor ID
  addonIds: string[];            // Array of addon IDs
}

/**
 * Resolved container image information
 */
export interface ResolvedContainerImage {
  imageName: string;             // Full image name (registry/owner/name)
  imageTag: string;              // Image tag/version
  imageRef: string;              // Full image reference (name:tag)
  exposedPorts: number[];        // Ports exposed by this configuration
  requiresGpu: boolean;          // Whether GPU is required
  estimatedSizeMb: number;       // Estimated total image size
}

/**
 * Project URLs based on addons
 */
export interface ProjectUrls {
  opencode: string | null;       // OpenCode API URL
  codeServer: string | null;     // VS Code in browser URL
  vnc: string | null;            // Desktop VNC URL
}

/**
 * API response for listing resource tiers
 */
export interface ResourceTiersResponse {
  tiers: ResourceTier[];
}

/**
 * API response for listing container flavors
 */
export interface FlavorsResponse {
  flavors: ContainerFlavor[];
}

/**
 * API response for listing container addons
 */
export interface AddonsResponse {
  addons: ContainerAddon[];
}

/**
 * API request for validating addon configuration
 */
export interface ValidateAddonsRequest {
  flavorId?: string;
  addonIds: string[];
  hasGpu?: boolean;
}

/**
 * API response for addon validation
 */
export interface ValidateAddonsResponse {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details?: {
    flavorId: string;
    flavorName: string;
    addonIds: string[];
    totalAddonPrice: number;
    exposedPorts: number[];
  };
}
