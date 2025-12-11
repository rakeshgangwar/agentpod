/**
 * Image Resolution Service
 * Resolves flavor + addons to Docker image name and configuration
 */

import { config } from '../config.ts';
import { 
  getResourceTierById, 
  getDefaultResourceTier, 
  getResourceLimits,
  type ResourceTier 
} from '../models/resource-tier.ts';
import { 
  getFlavorById, 
  getDefaultFlavor,
  type ContainerFlavor 
} from '../models/container-flavor.ts';
import { 
  getAddonsByIds, 
  getExposedPorts,
  validateAddons,
  type ContainerAddon 
} from '../models/container-addon.ts';

// =============================================================================
// Types
// =============================================================================

export interface ResolveImageOptions {
  resourceTierId?: string;
  flavorId?: string;
  addonIds?: string[];
}

export interface ImageResolution {
  imageName: string;
  imageTag: string;
  imageRef: string;
  flavor: ContainerFlavor;
  addons: ContainerAddon[];
  resourceTier: ResourceTier;
  resourceLimits: {
    limits_memory: string;
    limits_memory_reservation: string;
    limits_cpus: string;
  };
  exposedPorts: number[];
  portsExposes: string;
  requiresGpu: boolean;
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProjectUrls {
  opencode: string | null;
  codeServer: string | null;
  vnc: string | null;
  domainsConfig: string;
}

// =============================================================================
// Constants
// =============================================================================

// Base ports always exposed
const BASE_PORTS = [4096, 4097]; // OpenCode + ACP Gateway

// =============================================================================
// Image Resolution
// =============================================================================

/**
 * Resolve container configuration to a specific Docker image
 */
export function resolveImage(options: ResolveImageOptions = {}): ImageResolution {
  const warnings: string[] = [];
  
  // Get resource tier
  let resourceTier: ResourceTier | null = null;
  if (options.resourceTierId) {
    resourceTier = getResourceTierById(options.resourceTierId);
    if (!resourceTier) {
      warnings.push(`Resource tier '${options.resourceTierId}' not found, using default`);
    }
  }
  if (!resourceTier) {
    resourceTier = getDefaultResourceTier();
  }
  if (!resourceTier) {
    throw new Error('No default resource tier configured');
  }
  
  // Get flavor
  let flavor: ContainerFlavor | null = null;
  if (options.flavorId) {
    flavor = getFlavorById(options.flavorId);
    if (!flavor) {
      warnings.push(`Flavor '${options.flavorId}' not found, using default`);
    }
  }
  if (!flavor) {
    flavor = getDefaultFlavor();
  }
  if (!flavor) {
    throw new Error('No default flavor configured');
  }
  
  // Get addons
  const addonIds = options.addonIds || [];
  const addons = getAddonsByIds(addonIds);
  
  if (addons.length !== addonIds.length) {
    const foundIds = addons.map(a => a.id);
    const missingIds = addonIds.filter(id => !foundIds.includes(id));
    warnings.push(`Addons not found: ${missingIds.join(', ')}`);
  }
  
  // Build image name
  const { imageName, imageTag, imageRef } = buildImageName(flavor, addons);
  
  // Get resource limits
  const resourceLimits = getResourceLimits(resourceTier);
  
  // Get exposed ports
  const addonPorts = getExposedPorts(addons);
  const exposedPorts = [...BASE_PORTS, ...addonPorts];
  const portsExposes = exposedPorts.join(',');
  
  // Check if GPU is required
  const requiresGpu = addons.some(addon => addon.requiresGpu);
  
  return {
    imageName,
    imageTag,
    imageRef,
    flavor,
    addons,
    resourceTier,
    resourceLimits,
    exposedPorts,
    portsExposes,
    requiresGpu,
    warnings,
  };
}

/**
 * Validate container configuration
 */
export function validateContainerConfig(options: ResolveImageOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate resource tier
  if (options.resourceTierId) {
    const tier = getResourceTierById(options.resourceTierId);
    if (!tier) {
      errors.push(`Resource tier '${options.resourceTierId}' not found`);
    }
  }
  
  // Validate flavor
  let flavor: ContainerFlavor | null = null;
  if (options.flavorId) {
    flavor = getFlavorById(options.flavorId);
    if (!flavor) {
      errors.push(`Flavor '${options.flavorId}' not found`);
    }
  } else {
    flavor = getDefaultFlavor();
  }
  
  // Validate addons
  if (options.addonIds && options.addonIds.length > 0) {
    const addons = getAddonsByIds(options.addonIds);
    
    // Check for missing addons
    const foundIds = addons.map(a => a.id);
    const missingIds = options.addonIds.filter(id => !foundIds.includes(id));
    for (const id of missingIds) {
      errors.push(`Addon '${id}' not found`);
    }
    
    // Check addon compatibility
    if (flavor) {
      const hasGpu = false; // Default to no GPU, can be enhanced
      const validation = validateAddons(addons, flavor.id, hasGpu);
      errors.push(...validation.errors);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate project URLs based on addons
 */
export function generateProjectUrls(
  projectSlug: string,
  addons: ContainerAddon[]
): ProjectUrls {
  const wildcardDomain = config.opencode.wildcardDomain;
  
  if (!wildcardDomain) {
    return {
      opencode: null,
      codeServer: null,
      vnc: null,
      domainsConfig: '',
    };
  }
  
  // Build URLs based on installed addons
  const urls: ProjectUrls = {
    opencode: `https://${projectSlug}.${wildcardDomain}`,
    codeServer: null,
    vnc: null,
    domainsConfig: '',
  };
  
  const domains: string[] = [];
  
  // Base OpenCode domain (port 4096)
  domains.push(`${projectSlug}.${wildcardDomain}:4096`);
  
  // ACP Gateway domain (port 4097)
  domains.push(`acp-${projectSlug}.${wildcardDomain}:4097`);
  
  // Check for code-server addon
  const hasCodeServer = addons.some(a => a.id === 'code-server');
  if (hasCodeServer) {
    urls.codeServer = `https://code-${projectSlug}.${wildcardDomain}`;
    domains.push(`code-${projectSlug}.${wildcardDomain}:8080`);
  }
  
  // Check for GUI addon
  const hasGui = addons.some(a => a.id === 'gui');
  if (hasGui) {
    urls.vnc = `https://vnc-${projectSlug}.${wildcardDomain}`;
    domains.push(`vnc-${projectSlug}.${wildcardDomain}:6080`);
  }
  
  urls.domainsConfig = domains.join(',');
  
  return urls;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build the Docker image name from flavor and addons
 * Pattern: codeopen-{flavor}[-addon1][-addon2]:{version}
 */
function buildImageName(
  flavor: ContainerFlavor,
  addons: ContainerAddon[]
): { imageName: string; imageTag: string; imageRef: string } {
  const registry = config.registry.url;
  const owner = config.registry.owner;
  const version = config.registry.version;
  
  // Build image name
  let imageName = `codeopen-${flavor.id}`;
  
  // Add addon suffixes (sorted for consistency)
  const addonIds = addons.map(a => a.id).sort();
  for (const addonId of addonIds) {
    imageName += `-${addonId}`;
  }
  
  const fullImageName = `${registry}/${owner}/${imageName}`;
  const imageRef = `${fullImageName}:${version}`;
  
  return {
    imageName: fullImageName,
    imageTag: version,
    imageRef,
  };
}

/**
 * Get the estimated total image size
 */
export function estimateImageSize(
  flavor: ContainerFlavor,
  addons: ContainerAddon[]
): number {
  const baseSize = 500; // Base image ~500MB
  const flavorSize = flavor.imageSizeMb || 0;
  const addonsSize = addons.reduce((total, addon) => total + (addon.imageSizeMb || 0), 0);
  
  return baseSize + flavorSize + addonsSize;
}
