/**
 * Container Flavors API Routes
 * Endpoints for listing available language/framework flavors
 */

import { Hono } from 'hono';
import { 
  getAllFlavors, 
  getFlavorById, 
  getDefaultFlavor,
  getFlavorsByLanguage,
} from '../models/container-flavor.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('flavors');

export const flavorsRouter = new Hono();

// =============================================================================
// GET /flavors
// =============================================================================
// List all available container flavors
flavorsRouter.get('/', async (c) => {
  log.info('Listing all container flavors');
  
  try {
    const flavors = await getAllFlavors();
    
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
flavorsRouter.get('/default', async (c) => {
  log.info('Getting default container flavor');
  
  try {
    const flavor = await getDefaultFlavor();
    
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
// GET /flavors/by-language/:language
// =============================================================================
// Get flavors that support a specific language
flavorsRouter.get('/by-language/:language', async (c) => {
  const language = c.req.param('language');
  log.info('Getting flavors by language', { language });
  
  try {
    const flavors = await getFlavorsByLanguage(language);
    
    if (flavors.length === 0) {
      return c.json({ 
        flavors: [],
        message: `No flavors found for language: ${language}` 
      });
    }
    
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
    log.error('Failed to get flavors by language', { language, error });
    return c.json({ error: 'Failed to get flavors by language' }, 500);
  }
});

// =============================================================================
// GET /flavors/:id
// =============================================================================
// Get a specific container flavor by ID
flavorsRouter.get('/:id', async (c) => {
  const flavorId = c.req.param('id');
  log.info('Getting container flavor', { flavorId });
  
  try {
    const flavor = await getFlavorById(flavorId);
    
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
