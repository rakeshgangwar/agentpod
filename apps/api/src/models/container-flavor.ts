/**
 * Container Flavor Model
 * Language/framework-specific container images
 */

import { db } from '../db/index.ts';

// =============================================================================
// Types
// =============================================================================

export interface ContainerFlavor {
  id: string;                    // 'js', 'python', 'go', 'rust', 'fullstack', 'polyglot'
  name: string;                  // Display name
  description: string | null;    // Description of the flavor
  languages: string[];           // Supported languages
  imageSizeMb: number | null;    // Approximate image size in MB
  isDefault: boolean;            // Default flavor for new projects
  enabled: boolean;              // Whether the flavor is available for selection
  sortOrder: number;             // Display order
  createdAt: string;
  updatedAt: string;
}

// Database row type
interface ContainerFlavorRow {
  id: string;
  name: string;
  description: string | null;
  languages: string;             // JSON array string
  image_size_mb: number | null;
  is_default: number;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToContainerFlavor(row: ContainerFlavorRow): ContainerFlavor {
  let languages: string[] = [];
  try {
    languages = JSON.parse(row.languages);
  } catch {
    languages = [];
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    languages,
    imageSizeMb: row.image_size_mb,
    isDefault: row.is_default === 1,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get all enabled container flavors, ordered by sort_order
 */
export function getAllFlavors(): ContainerFlavor[] {
  const rows = db.query(`
    SELECT * FROM container_flavors 
    WHERE enabled = 1
    ORDER BY sort_order ASC
  `).all() as ContainerFlavorRow[];
  
  return rows.map(rowToContainerFlavor);
}

/**
 * Get all container flavors including disabled ones
 */
export function getAllFlavorsIncludingDisabled(): ContainerFlavor[] {
  const rows = db.query(`
    SELECT * FROM container_flavors 
    ORDER BY sort_order ASC
  `).all() as ContainerFlavorRow[];
  
  return rows.map(rowToContainerFlavor);
}

/**
 * Get a container flavor by ID
 */
export function getFlavorById(id: string): ContainerFlavor | null {
  const row = db.query(`
    SELECT * FROM container_flavors 
    WHERE id = $id
  `).get({ $id: id }) as ContainerFlavorRow | null;
  
  return row ? rowToContainerFlavor(row) : null;
}

/**
 * Get the default container flavor
 */
export function getDefaultFlavor(): ContainerFlavor | null {
  const row = db.query(`
    SELECT * FROM container_flavors 
    WHERE is_default = 1
    LIMIT 1
  `).get() as ContainerFlavorRow | null;
  
  return row ? rowToContainerFlavor(row) : null;
}

/**
 * Get flavors that support a specific language
 */
export function getFlavorsByLanguage(language: string): ContainerFlavor[] {
  const rows = db.query(`
    SELECT * FROM container_flavors 
    WHERE languages LIKE $pattern
    ORDER BY sort_order ASC
  `).all({ $pattern: `%"${language}"%` }) as ContainerFlavorRow[];
  
  return rows.map(rowToContainerFlavor);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the Docker image name for a flavor
 */
export function getImageNameForFlavor(
  flavor: ContainerFlavor,
  registry: string,
  owner: string
): string {
  return `${registry}/${owner}/codeopen-${flavor.id}`;
}

/**
 * Check if a flavor supports a specific language
 */
export function flavorSupportsLanguage(flavor: ContainerFlavor, language: string): boolean {
  return flavor.languages.includes(language.toLowerCase());
}
