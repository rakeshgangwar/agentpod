/**
 * Container Addons API Routes
 * Endpoints for listing available container add-ons
 */

import { Hono } from 'hono';
import {
  getAllAddons,
  getAddonById,
  getAddonsByCategory,
  getAddonsByIds,
  getImageNameForFlavorWithAddon,
  addonCompatibleWithFlavor,
  getExposedPortsForAddons,
  getTotalAddonSize,
  getTotalAddonPrice,
  type AddonCategory,
} from '../models/container-addon.ts';
import { getFlavorById } from '../models/container-flavor.ts';
import { config } from '../config.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('addons');

export const addonsRouter = new Hono();

// =============================================================================
// GET /addons
// =============================================================================
// List all available container addons
// Optional query param: ?category=interface
addonsRouter.get('/', (c) => {
  const category = c.req.query('category');
  log.info('Listing container addons', { category });
  
  try {
    let addons;
    
    if (category) {
      addons = getAddonsByCategory(category as AddonCategory);
    } else {
      addons = getAllAddons();
    }
    
    // Transform for API response
    const response = addons.map(addon => ({
      id: addon.id,
      name: addon.name,
      description: addon.description,
      category: addon.category,
      imageSizeMb: addon.imageSizeMb,
      port: addon.port,
      requiresGpu: addon.requiresGpu,
      requiresFlavor: addon.requiresFlavor,
      priceMonthly: addon.priceMonthly,
      sortOrder: addon.sortOrder,
    }));
    
    return c.json({ addons: response });
  } catch (error) {
    log.error('Failed to list container addons', { error });
    return c.json({ error: 'Failed to list container addons' }, 500);
  }
});

// =============================================================================
// GET /addons/categories
// =============================================================================
// Get list of addon categories
addonsRouter.get('/categories', (c) => {
  log.info('Listing addon categories');
  
  return c.json({
    categories: [
      { id: 'interface', name: 'Interface', description: 'User interface add-ons (GUI, Code Server)' },
      { id: 'compute', name: 'Compute', description: 'Compute add-ons (GPU support)' },
      { id: 'storage', name: 'Storage', description: 'Storage add-ons (databases)' },
      { id: 'devops', name: 'DevOps', description: 'DevOps tools (cloud CLIs, Terraform)' },
    ],
  });
});

// =============================================================================
// GET /addons/:id
// =============================================================================
// Get a specific container addon by ID
addonsRouter.get('/:id', (c) => {
  const addonId = c.req.param('id');
  log.info('Getting container addon', { addonId });
  
  try {
    const addon = getAddonById(addonId);
    
    if (!addon) {
      return c.json({ error: 'Container addon not found' }, 404);
    }
    
    return c.json({
      id: addon.id,
      name: addon.name,
      description: addon.description,
      category: addon.category,
      imageSizeMb: addon.imageSizeMb,
      port: addon.port,
      requiresGpu: addon.requiresGpu,
      requiresFlavor: addon.requiresFlavor,
      priceMonthly: addon.priceMonthly,
      sortOrder: addon.sortOrder,
    });
  } catch (error) {
    log.error('Failed to get container addon', { addonId, error });
    return c.json({ error: 'Failed to get container addon' }, 500);
  }
});

// =============================================================================
// GET /addons/:id/compatible/:flavorId
// =============================================================================
// Check if an addon is compatible with a flavor
addonsRouter.get('/:id/compatible/:flavorId', (c) => {
  const addonId = c.req.param('id');
  const flavorId = c.req.param('flavorId');
  log.info('Checking addon compatibility', { addonId, flavorId });
  
  try {
    const addon = getAddonById(addonId);
    if (!addon) {
      return c.json({ error: 'Container addon not found' }, 404);
    }
    
    const flavor = getFlavorById(flavorId);
    if (!flavor) {
      return c.json({ error: 'Container flavor not found' }, 404);
    }
    
    const compatible = addonCompatibleWithFlavor(addon, flavorId);
    
    return c.json({
      addonId: addon.id,
      flavorId: flavor.id,
      compatible,
      reason: compatible ? null : `Addon requires one of: ${addon.requiresFlavor}`,
    });
  } catch (error) {
    log.error('Failed to check addon compatibility', { addonId, flavorId, error });
    return c.json({ error: 'Failed to check addon compatibility' }, 500);
  }
});

// =============================================================================
// POST /addons/calculate
// =============================================================================
// Calculate total size and price for a set of addons
addonsRouter.post('/calculate', async (c) => {
  log.info('Calculating addon totals');
  
  try {
    const body = await c.req.json();
    const addonIds: string[] = body.addon_ids || [];
    const flavorId: string | undefined = body.flavor_id;
    
    const addons = getAddonsByIds(addonIds);
    
    // Check for incompatible addons if flavor is specified
    let incompatible: string[] = [];
    if (flavorId) {
      incompatible = addons
        .filter(a => !addonCompatibleWithFlavor(a, flavorId))
        .map(a => a.id);
    }
    
    const totalSize = getTotalAddonSize(addons);
    const totalPrice = getTotalAddonPrice(addons);
    const ports = getExposedPortsForAddons(addons);
    
    return c.json({
      addonIds: addons.map(a => a.id),
      totalSizeMb: totalSize,
      totalPriceMonthly: totalPrice,
      exposedPorts: ports,
      incompatibleWithFlavor: incompatible,
    });
  } catch (error) {
    log.error('Failed to calculate addon totals', { error });
    return c.json({ error: 'Failed to calculate addon totals' }, 500);
  }
});

// =============================================================================
// GET /addons/:id/image/:flavorId
// =============================================================================
// Get Docker image name for a flavor with addon
addonsRouter.get('/:id/image/:flavorId', (c) => {
  const addonId = c.req.param('id');
  const flavorId = c.req.param('flavorId');
  log.info('Getting image name for flavor with addon', { addonId, flavorId });
  
  try {
    const addon = getAddonById(addonId);
    if (!addon) {
      return c.json({ error: 'Container addon not found' }, 404);
    }
    
    const flavor = getFlavorById(flavorId);
    if (!flavor) {
      return c.json({ error: 'Container flavor not found' }, 404);
    }
    
    if (!addonCompatibleWithFlavor(addon, flavorId)) {
      return c.json({ 
        error: 'Addon not compatible with flavor',
        requiredFlavors: addon.requiresFlavor,
      }, 400);
    }
    
    const imageName = getImageNameForFlavorWithAddon(
      flavorId,
      addonId,
      config.registry.url,
      config.registry.owner
    );
    
    return c.json({
      flavorId: flavor.id,
      addonId: addon.id,
      image: imageName,
      imageLatest: `${imageName}:latest`,
      imageVersioned: `${imageName}:${config.registry.version}`,
    });
  } catch (error) {
    log.error('Failed to get image name', { addonId, flavorId, error });
    return c.json({ error: 'Failed to get image name' }, 500);
  }
});
