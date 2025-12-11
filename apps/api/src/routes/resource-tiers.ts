/**
 * Resource Tiers API Routes
 * Endpoints for listing available resource tiers (CPU, memory, storage)
 */

import { Hono } from 'hono';
import { 
  getAllResourceTiers, 
  getResourceTierById, 
  getDefaultResourceTier,
  getResourceLimits,
} from '../models/resource-tier.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('resource-tiers');

export const resourceTiersRouter = new Hono();

// =============================================================================
// GET /resource-tiers
// =============================================================================
// List all available resource tiers
resourceTiersRouter.get('/', (c) => {
  log.info('Listing all resource tiers');
  
  try {
    const tiers = getAllResourceTiers();
    
    // Transform for API response
    const response = tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      resources: {
        cpuCores: tier.cpuCores,
        memoryGb: tier.memoryGb,
        storageGb: tier.storageGb,
      },
      priceMonthly: tier.priceMonthly,
      isDefault: tier.isDefault,
      sortOrder: tier.sortOrder,
    }));
    
    return c.json({ tiers: response });
  } catch (error) {
    log.error('Failed to list resource tiers', { error });
    return c.json({ error: 'Failed to list resource tiers' }, 500);
  }
});

// =============================================================================
// GET /resource-tiers/default
// =============================================================================
// Get the default resource tier
resourceTiersRouter.get('/default', (c) => {
  log.info('Getting default resource tier');
  
  try {
    const tier = getDefaultResourceTier();
    
    if (!tier) {
      return c.json({ error: 'No default tier configured' }, 404);
    }
    
    return c.json({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      resources: {
        cpuCores: tier.cpuCores,
        memoryGb: tier.memoryGb,
        storageGb: tier.storageGb,
      },
      priceMonthly: tier.priceMonthly,
      isDefault: tier.isDefault,
    });
  } catch (error) {
    log.error('Failed to get default tier', { error });
    return c.json({ error: 'Failed to get default tier' }, 500);
  }
});

// =============================================================================
// GET /resource-tiers/:id
// =============================================================================
// Get a specific resource tier by ID
resourceTiersRouter.get('/:id', (c) => {
  const tierId = c.req.param('id');
  log.info('Getting resource tier', { tierId });
  
  try {
    const tier = getResourceTierById(tierId);
    
    if (!tier) {
      return c.json({ error: 'Resource tier not found' }, 404);
    }
    
    return c.json({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      resources: {
        cpuCores: tier.cpuCores,
        memoryGb: tier.memoryGb,
        storageGb: tier.storageGb,
      },
      priceMonthly: tier.priceMonthly,
      isDefault: tier.isDefault,
      sortOrder: tier.sortOrder,
      // Include raw resource limits for internal use
      _resourceLimits: getResourceLimits(tier),
    });
  } catch (error) {
    log.error('Failed to get resource tier', { tierId, error });
    return c.json({ error: 'Failed to get resource tier' }, 500);
  }
});
