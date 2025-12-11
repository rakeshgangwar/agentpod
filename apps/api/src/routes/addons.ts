/**
 * Container Addons API Routes
 * Endpoints for listing available container addons
 */

import { Hono } from 'hono';
import { 
  getAllAddons, 
  getAddonById, 
  getAddonsByCategory,
  getAddonsByIds,
  getNonGpuAddons,
  getExposedPorts,
  calculateAddonsPrice,
  validateAddons,
  type AddonCategory,
} from '../models/container-addon.ts';
import { getFlavorById, getDefaultFlavor } from '../models/container-flavor.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('addons');

export const addonsRouter = new Hono();

// =============================================================================
// GET /addons
// =============================================================================
// List all available container addons
addonsRouter.get('/', (c) => {
  log.info('Listing all container addons');
  
  try {
    const addons = getAllAddons();
    
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
// GET /addons/non-gpu
// =============================================================================
// Get addons that don't require GPU
addonsRouter.get('/non-gpu', (c) => {
  log.info('Getting non-GPU addons');
  
  try {
    const addons = getNonGpuAddons();
    
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
    log.error('Failed to get non-GPU addons', { error });
    return c.json({ error: 'Failed to get non-GPU addons' }, 500);
  }
});

// =============================================================================
// GET /addons/by-category/:category
// =============================================================================
// Get addons by category
addonsRouter.get('/by-category/:category', (c) => {
  const category = c.req.param('category') as AddonCategory;
  log.info('Getting addons by category', { category });
  
  // Validate category
  const validCategories: AddonCategory[] = ['interface', 'compute', 'storage', 'devops'];
  if (!validCategories.includes(category)) {
    return c.json({ 
      error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
    }, 400);
  }
  
  try {
    const addons = getAddonsByCategory(category);
    
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
    log.error('Failed to get addons by category', { category, error });
    return c.json({ error: 'Failed to get addons by category' }, 500);
  }
});

// =============================================================================
// POST /addons/validate
// =============================================================================
// Validate a combination of addons with a flavor
addonsRouter.post('/validate', async (c) => {
  log.info('Validating addon configuration');
  
  try {
    const body = await c.req.json<{ 
      flavorId?: string; 
      addonIds: string[];
      hasGpu?: boolean;
    }>();
    
    const { flavorId, addonIds, hasGpu = false } = body;
    
    // Get flavor (default if not specified)
    let flavor = flavorId ? getFlavorById(flavorId) : getDefaultFlavor();
    if (!flavor) {
      return c.json({ 
        valid: false,
        errors: [`Flavor '${flavorId || 'default'}' not found`],
        warnings: [],
      });
    }
    
    // Get addons
    const addons = getAddonsByIds(addonIds || []);
    
    // Check for missing addons
    const foundIds = addons.map(a => a.id);
    const missingIds = (addonIds || []).filter(id => !foundIds.includes(id));
    
    if (missingIds.length > 0) {
      return c.json({
        valid: false,
        errors: missingIds.map(id => `Addon '${id}' not found`),
        warnings: [],
      });
    }
    
    // Validate addon compatibility
    const validation = validateAddons(addons, flavor.id, hasGpu);
    
    // Calculate price
    const totalAddonPrice = calculateAddonsPrice(addons);
    
    // Get exposed ports
    const exposedPorts = getExposedPorts(addons);
    
    return c.json({
      valid: validation.valid,
      errors: validation.errors,
      warnings: [],
      details: {
        flavorId: flavor.id,
        flavorName: flavor.name,
        addonIds: foundIds,
        totalAddonPrice,
        exposedPorts,
      },
    });
  } catch (error) {
    log.error('Failed to validate addon configuration', { error });
    return c.json({ error: 'Failed to validate addon configuration' }, 500);
  }
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
