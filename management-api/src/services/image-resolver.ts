/**
 * Image Resolution Service
 * Resolves container flavor + addons to the appropriate Docker image name
 * 
 * Image naming convention:
 *   - Base flavor: codeopen-{flavor}:{version}
 *   - Flavor + single addon: codeopen-{flavor}-{addon}:{version}
 *   - Flavor + multiple addons: Build order matters, use single addon images
 * 
 * Note: For MVP, we only support single addon per flavor.
 * Multiple addon combinations would require a build matrix or runtime composition.
 */

import { config } from '../config.ts';
import { getFlavorById, getDefaultFlavor, type ContainerFlavor } from '../models/container-flavor.ts';
import { getAddonById, getAddonsByIds, addonCompatibleWithFlavor, type ContainerAddon } from '../models/container-addon.ts';
import { getResourceTierById, getDefaultResourceTier, getResourceLimitsForTier, type ResourceTier } from '../models/resource-tier.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('image-resolver');

// =============================================================================
// Types
// =============================================================================

export interface ImageResolution {
  /** Full Docker image name with registry */
  imageName: string;
  /** Image tag/version */
  imageTag: string;
  /** Full image reference (name:tag) */
  imageRef: string;
  /** Resolved flavor */
  flavor: ContainerFlavor;
  /** Resolved addons */
  addons: ContainerAddon[];
  /** Resolved resource tier */
  resourceTier: ResourceTier;
  /** Docker resource limits for Coolify */
  resourceLimits: {
    limits_memory: string;
    limits_memory_reservation: string;
    limits_cpus: string;
  };
  /** Ports to expose */
  exposedPorts: number[];
  /** Port configuration string for Coolify (e.g., "4096,6080,8080") */
  portsExposes: string;
  /** Whether this image requires GPU */
  requiresGpu: boolean;
  /** Validation warnings */
  warnings: string[];
}

export interface ResolveImageOptions {
  /** Resource tier ID (defaults to 'starter') */
  resourceTierId?: string;
  /** Container flavor ID (defaults to 'fullstack') */
  flavorId?: string;
  /** Array of addon IDs (defaults to []) */
  addonIds?: string[];
}

// =============================================================================
// Constants
// =============================================================================

/** Base OpenCode port - always exposed */
const BASE_PORT = 4096;

/** ACP Gateway port - always exposed */
const ACP_GATEWAY_PORT = 4097;

// =============================================================================
// Image Resolution
// =============================================================================

/**
 * Resolve container configuration to a Docker image
 * 
 * @param options - Resolution options
 * @returns Resolved image information
 */
export function resolveImage(options: ResolveImageOptions = {}): ImageResolution {
  const { resourceTierId, flavorId, addonIds = [] } = options;
  const warnings: string[] = [];
  
  log.info('Resolving image', { resourceTierId, flavorId, addonIds });
  
  // Resolve resource tier
  let resourceTier: ResourceTier | null = null;
  if (resourceTierId) {
    resourceTier = getResourceTierById(resourceTierId);
    if (!resourceTier) {
      warnings.push(`Resource tier '${resourceTierId}' not found, using default`);
    }
  }
  if (!resourceTier) {
    resourceTier = getDefaultResourceTier();
  }
  if (!resourceTier) {
    throw new Error('No default resource tier configured');
  }
  
  // Resolve flavor
  let flavor: ContainerFlavor | null = null;
  if (flavorId) {
    flavor = getFlavorById(flavorId);
    if (!flavor) {
      warnings.push(`Flavor '${flavorId}' not found, using default`);
    }
  }
  if (!flavor) {
    flavor = getDefaultFlavor();
  }
  if (!flavor) {
    throw new Error('No default flavor configured');
  }
  
  // Resolve addons
  const requestedAddons = getAddonsByIds(addonIds);
  const validAddons: ContainerAddon[] = [];
  
  for (const addonId of addonIds) {
    const addon = requestedAddons.find(a => a.id === addonId);
    if (!addon) {
      warnings.push(`Addon '${addonId}' not found, skipping`);
      continue;
    }
    
    // Check flavor compatibility
    if (!addonCompatibleWithFlavor(addon, flavor.id)) {
      warnings.push(`Addon '${addonId}' is not compatible with flavor '${flavor.id}', skipping`);
      continue;
    }
    
    validAddons.push(addon);
  }
  
  // Build image name
  const { imageName, imageTag } = buildImageName(flavor, validAddons);
  const imageRef = `${imageName}:${imageTag}`;
  
  // Determine exposed ports
  const exposedPorts = getExposedPorts(validAddons);
  const portsExposes = exposedPorts.join(',');
  
  // Get resource limits
  const resourceLimits = getResourceLimitsForTier(resourceTier);
  
  // Check GPU requirement
  const requiresGpu = validAddons.some(a => a.requiresGpu);
  
  const resolution: ImageResolution = {
    imageName,
    imageTag,
    imageRef,
    flavor,
    addons: validAddons,
    resourceTier,
    resourceLimits,
    exposedPorts,
    portsExposes,
    requiresGpu,
    warnings,
  };
  
  log.info('Image resolved', { 
    imageRef, 
    flavor: flavor.id, 
    addons: validAddons.map(a => a.id),
    resourceTier: resourceTier.id,
    exposedPorts,
    requiresGpu,
  });
  
  return resolution;
}

/**
 * Build Docker image name from flavor and addons
 */
function buildImageName(flavor: ContainerFlavor, addons: ContainerAddon[]): { imageName: string; imageTag: string } {
  const registry = config.registry.url;
  const owner = config.registry.owner;
  const version = config.registry.version;
  
  // Base image name
  let baseName = `codeopen-${flavor.id}`;
  
  // Add addon suffix if present (single addon only for MVP)
  // For multiple addons, we use the first one (sorted by sort_order)
  if (addons.length > 0) {
    // Sort by sort_order to ensure consistent naming
    const sortedAddons = [...addons].sort((a, b) => a.sortOrder - b.sortOrder);
    const primaryAddon = sortedAddons[0]!;
    baseName = `${baseName}-${primaryAddon.id}`;
    
    if (addons.length > 1) {
      // Log warning but proceed with first addon
      log.warn('Multiple addons requested, using only first addon for image name', {
        requested: addons.map(a => a.id),
        using: primaryAddon.id,
      });
    }
  }
  
  const imageName = `${registry}/${owner}/${baseName}`;
  const imageTag = version;
  
  return { imageName, imageTag };
}

/**
 * Get exposed ports for a configuration
 */
function getExposedPorts(addons: ContainerAddon[]): number[] {
  const ports = new Set<number>();
  
  // Base ports always exposed
  ports.add(BASE_PORT);       // OpenCode
  ports.add(ACP_GATEWAY_PORT); // ACP Gateway
  
  // Add addon ports
  for (const addon of addons) {
    if (addon.port) {
      ports.add(addon.port);
    }
  }
  
  return Array.from(ports).sort((a, b) => a - b);
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a container configuration before deployment
 * 
 * @param options - Configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateContainerConfig(options: ResolveImageOptions): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const { resourceTierId, flavorId, addonIds = [] } = options;
  
  // Validate resource tier
  if (resourceTierId) {
    const tier = getResourceTierById(resourceTierId);
    if (!tier) {
      errors.push(`Resource tier '${resourceTierId}' not found`);
    }
  }
  
  // Validate flavor
  let flavor: ContainerFlavor | null = null;
  if (flavorId) {
    flavor = getFlavorById(flavorId);
    if (!flavor) {
      errors.push(`Flavor '${flavorId}' not found`);
    }
  } else {
    flavor = getDefaultFlavor();
  }
  
  // Validate addons
  if (flavor) {
    for (const addonId of addonIds) {
      const addon = getAddonById(addonId);
      if (!addon) {
        errors.push(`Addon '${addonId}' not found`);
        continue;
      }
      
      if (!addonCompatibleWithFlavor(addon, flavor.id)) {
        errors.push(`Addon '${addonId}' is not compatible with flavor '${flavor.id}'`);
      }
      
      if (addon.requiresGpu) {
        warnings.push(`Addon '${addonId}' requires GPU - ensure deployment target has GPU support`);
      }
    }
  }
  
  // Warn about multiple addons
  if (addonIds.length > 1) {
    warnings.push('Multiple addons requested - only the first addon will be applied to the image name');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a specific image exists in the registry
 * (For future implementation - currently returns true)
 */
export async function imageExists(imageRef: string): Promise<boolean> {
  // TODO: Implement registry check
  // For now, assume all resolved images exist
  log.debug('Image existence check (not implemented)', { imageRef });
  return true;
}

// =============================================================================
// URL Generation
// =============================================================================

/**
 * Generate FQDNs for a project based on its configuration
 */
export function generateProjectUrls(
  projectSlug: string, 
  addons: ContainerAddon[]
): {
  fqdnUrl: string | null;
  codeServerUrl: string | null;
  vncUrl: string | null;
  domainsConfig: string | null;
} {
  if (!config.opencode.wildcardDomain) {
    return {
      fqdnUrl: null,
      codeServerUrl: null,
      vncUrl: null,
      domainsConfig: null,
    };
  }
  
  const domain = config.opencode.wildcardDomain;
  
  // Main OpenCode API domain (always created)
  const fqdnUrl = `https://opencode-${projectSlug}.${domain}`;
  
  // Code Server domain (check if addon is included)
  const hasCodeServer = addons.some(a => a.id === 'code-server');
  const codeServerUrl = hasCodeServer ? `https://code-${projectSlug}.${domain}` : null;
  
  // VNC domain (check if GUI addon is included)
  const hasGui = addons.some(a => a.id === 'gui');
  const vncUrl = hasGui ? `https://vnc-${projectSlug}.${domain}` : null;
  
  // Build Coolify domains config
  // Format: "https://domain1.com:port1,https://domain2.com:port2"
  const domainParts: string[] = [`${fqdnUrl}:${BASE_PORT}`];
  
  if (codeServerUrl) {
    domainParts.push(`${codeServerUrl}:8080`);
  }
  
  if (vncUrl) {
    domainParts.push(`${vncUrl}:6080`);
  }
  
  const domainsConfig = domainParts.join(',');
  
  return {
    fqdnUrl,
    codeServerUrl,
    vncUrl,
    domainsConfig,
  };
}
