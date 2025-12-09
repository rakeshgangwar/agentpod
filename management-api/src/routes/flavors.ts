/**
 * Container Flavors API Routes
 * Endpoints for listing available container flavors (language/framework images)
 */

import { Hono } from 'hono';
import {
  getAllFlavors,
  getFlavorById,
  getDefaultFlavor,
  getFlavorsByLanguage,
  getImageNameForFlavor,
} from '../models/container-flavor.ts';
import { config } from '../config.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('flavors');

export const flavorsRouter = new Hono();

// =============================================================================
// GET /flavors
// =============================================================================
// List all available container flavors
// Optional query param: ?language=python
flavorsRouter.get('/', (c) => {
  const language = c.req.query('language');
  log.info('Listing container flavors', { language });
  
  try {
    let flavors;
    
    if (language) {
      flavors = getFlavorsByLanguage(language);
    } else {
      flavors = getAllFlavors();
    }
    
    // Transform for API response
    const response = flavors.map(flavor => ({
      id: flavor.id,
      name: flavor.name,
      description: flavor.description,
      languages: flavor.languages,
      imageSizeMb: flavor.imageSizeMb,
      isDefault: flavor.isDefault,
      sortOrder: flavor.sortOrder,
    }));
    
    return c.json({ flavors: response });
  } catch (error) {
    log.error('Failed to list container flavors', { error });
    return c.json({ error: 'Failed to list container flavors' }, 500);
  }
});

// =============================================================================
// GET /flavors/default
// =============================================================================
// Get the default container flavor
flavorsRouter.get('/default', (c) => {
  log.info('Getting default container flavor');
  
  try {
    const flavor = getDefaultFlavor();
    
    if (!flavor) {
      return c.json({ error: 'No default flavor configured' }, 404);
    }
    
    return c.json({
      id: flavor.id,
      name: flavor.name,
      description: flavor.description,
      languages: flavor.languages,
      imageSizeMb: flavor.imageSizeMb,
      isDefault: flavor.isDefault,
    });
  } catch (error) {
    log.error('Failed to get default flavor', { error });
    return c.json({ error: 'Failed to get default flavor' }, 500);
  }
});

// =============================================================================
// GET /flavors/:id
// =============================================================================
// Get a specific container flavor by ID
flavorsRouter.get('/:id', (c) => {
  const flavorId = c.req.param('id');
  log.info('Getting container flavor', { flavorId });
  
  try {
    const flavor = getFlavorById(flavorId);
    
    if (!flavor) {
      return c.json({ error: 'Container flavor not found' }, 404);
    }
    
    return c.json({
      id: flavor.id,
      name: flavor.name,
      description: flavor.description,
      languages: flavor.languages,
      imageSizeMb: flavor.imageSizeMb,
      isDefault: flavor.isDefault,
      sortOrder: flavor.sortOrder,
    });
  } catch (error) {
    log.error('Failed to get container flavor', { flavorId, error });
    return c.json({ error: 'Failed to get container flavor' }, 500);
  }
});

// =============================================================================
// GET /flavors/:id/image
// =============================================================================
// Get Docker image name for a flavor
flavorsRouter.get('/:id/image', (c) => {
  const flavorId = c.req.param('id');
  log.info('Getting image name for flavor', { flavorId });
  
  try {
    const flavor = getFlavorById(flavorId);
    
    if (!flavor) {
      return c.json({ error: 'Container flavor not found' }, 404);
    }
    
    const imageName = getImageNameForFlavor(
      flavor,
      config.registry.url,
      config.registry.owner
    );
    
    return c.json({
      flavorId: flavor.id,
      image: imageName,
      imageLatest: `${imageName}:latest`,
      imageVersioned: `${imageName}:${config.registry.version}`,
    });
  } catch (error) {
    log.error('Failed to get image name', { flavorId, error });
    return c.json({ error: 'Failed to get image name' }, 500);
  }
});
