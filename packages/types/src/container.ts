/**
 * Container tier types for resource allocation.
 */

/** Resources allocated to a container tier */
export interface TierResources {
  cpu: number;
  memory_gb: number;
  storage_gb: number;
}

/** Features available in a container tier */
export interface TierFeatures {
  code_server: boolean;
  vnc_access: boolean;
  ssh_access: boolean;
  persistent_storage: boolean;
}

/** Container tier definition */
export interface ContainerTier {
  id: string;
  name: string;
  description: string;
  resources: TierResources;
  features: TierFeatures;
  price_per_hour: number;
  is_available: boolean;
}
