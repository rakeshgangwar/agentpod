/**
 * Container Flavor Model
 * Language/framework-specific container images
 * 
 * MIGRATED: Now uses PostgreSQL via Drizzle ORM
 */

import { db } from '../db/drizzle';
import { containerFlavors } from '../db/schema/containers';
import { eq, asc, ilike } from 'drizzle-orm';

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
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Helpers
// =============================================================================

function parseLanguages(languages: string): string[] {
  try {
    return JSON.parse(languages);
  } catch {
    return [];
  }
}

function rowToContainerFlavor(row: typeof containerFlavors.$inferSelect): ContainerFlavor {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    languages: parseLanguages(row.languages),
    imageSizeMb: row.imageSizeMb,
    isDefault: row.isDefault,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// =============================================================================
// CRUD Operations (Async)
// =============================================================================

/**
 * Get all enabled container flavors, ordered by sort_order
 */
export async function getAllFlavors(): Promise<ContainerFlavor[]> {
  const rows = await db
    .select()
    .from(containerFlavors)
    .where(eq(containerFlavors.enabled, true))
    .orderBy(asc(containerFlavors.sortOrder));
  
  return rows.map(rowToContainerFlavor);
}

/**
 * Get all container flavors including disabled ones
 */
export async function getAllFlavorsIncludingDisabled(): Promise<ContainerFlavor[]> {
  const rows = await db
    .select()
    .from(containerFlavors)
    .orderBy(asc(containerFlavors.sortOrder));
  
  return rows.map(rowToContainerFlavor);
}

/**
 * Get a container flavor by ID
 */
export async function getFlavorById(id: string): Promise<ContainerFlavor | null> {
  const [row] = await db
    .select()
    .from(containerFlavors)
    .where(eq(containerFlavors.id, id));
  
  return row ? rowToContainerFlavor(row) : null;
}

/**
 * Get the default container flavor
 */
export async function getDefaultFlavor(): Promise<ContainerFlavor | null> {
  const [row] = await db
    .select()
    .from(containerFlavors)
    .where(eq(containerFlavors.isDefault, true))
    .limit(1);
  
  return row ? rowToContainerFlavor(row) : null;
}

/**
 * Get flavors that support a specific language
 */
export async function getFlavorsByLanguage(language: string): Promise<ContainerFlavor[]> {
  const rows = await db
    .select()
    .from(containerFlavors)
    .where(ilike(containerFlavors.languages, `%"${language}"%`))
    .orderBy(asc(containerFlavors.sortOrder));
  
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
  const baseName = `codeopen-${flavor.id}`;
  return registry && owner ? `${registry}/${owner}/${baseName}` : baseName;
}

/**
 * Check if a flavor supports a specific language
 */
export function flavorSupportsLanguage(flavor: ContainerFlavor, language: string): boolean {
  return flavor.languages.includes(language.toLowerCase());
}
