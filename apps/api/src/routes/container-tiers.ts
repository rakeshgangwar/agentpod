/**
 * Container Tiers API Routes
 * Endpoints for listing available container tiers
 */

import { Hono } from 'hono';
import { 
  getAllTiers, 
  getTierById, 
  getDefaultTier,
  getResourceLimitsForTier,
  getExposedPortsForTier,
} from '../models/container-tier.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('container-tiers');

export const containerTiersRouter = new Hono();

// =============================================================================
// GET /container-tiers
// =============================================================================
// List all available container tiers
containerTiersRouter.get('/', (c) => {
  log.info('Listing all container tiers');
  
  try {
    const tiers = getAllTiers();
    
    // Transform for API response (add computed fields)
    const response = tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      imageType: tier.image_type,
      resources: {
        cpu: tier.cpu_limit,
        memory: tier.memory_limit,
        storage: `${tier.storage_gb}GB`,
      },
      features: {
        hasDesktopAccess: tier.has_desktop_access,
        exposedPorts: getExposedPortsForTier(tier).split(','),
      },
      isDefault: tier.is_default,
      sortOrder: tier.sort_order,
    }));
    
    return c.json({ tiers: response });
  } catch (error) {
    log.error('Failed to list container tiers', { error });
    return c.json({ error: 'Failed to list container tiers' }, 500);
  }
});

// =============================================================================
// GET /container-tiers/default
// =============================================================================
// Get the default container tier
containerTiersRouter.get('/default', (c) => {
  log.info('Getting default container tier');
  
  try {
    const tier = getDefaultTier();
    
    if (!tier) {
      return c.json({ error: 'No default tier configured' }, 404);
    }
    
    return c.json({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      imageType: tier.image_type,
      resources: {
        cpu: tier.cpu_limit,
        memory: tier.memory_limit,
        storage: `${tier.storage_gb}GB`,
      },
      features: {
        hasDesktopAccess: tier.has_desktop_access,
        exposedPorts: getExposedPortsForTier(tier).split(','),
      },
      isDefault: tier.is_default,
    });
  } catch (error) {
    log.error('Failed to get default tier', { error });
    return c.json({ error: 'Failed to get default tier' }, 500);
  }
});

// =============================================================================
// GET /container-tiers/:id
// =============================================================================
// Get a specific container tier by ID
containerTiersRouter.get('/:id', (c) => {
  const tierId = c.req.param('id');
  log.info('Getting container tier', { tierId });
  
  try {
    const tier = getTierById(tierId);
    
    if (!tier) {
      return c.json({ error: 'Container tier not found' }, 404);
    }
    
    return c.json({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      imageType: tier.image_type,
      resources: {
        cpu: tier.cpu_limit,
        memory: tier.memory_limit,
        memoryReservation: tier.memory_reservation,
        storage: `${tier.storage_gb}GB`,
      },
      features: {
        hasDesktopAccess: tier.has_desktop_access,
        exposedPorts: getExposedPortsForTier(tier).split(','),
      },
      isDefault: tier.is_default,
      sortOrder: tier.sort_order,
      // Include raw resource limits for internal use
      _resourceLimits: getResourceLimitsForTier(tier),
    });
  } catch (error) {
    log.error('Failed to get container tier', { tierId, error });
    return c.json({ error: 'Failed to get container tier' }, 500);
  }
});
