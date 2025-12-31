/**
 * Unit Tests for Image Resolver Service
 * 
 * Tests the image resolution and container configuration functions.
 * These tests run against the test database with seeded data.
 */

import { describe, test, expect } from 'bun:test';
import { 
  resolveImage, 
  validateContainerConfig, 
  generateProjectUrls,
  estimateImageSize,
  generateAddonCommands,
  generateAddonEnvVars,
} from '../../../src/services/image-resolver.ts';
import type { ContainerFlavor } from '../../../src/models/container-flavor.ts';
import type { ContainerAddon } from '../../../src/models/container-addon.ts';

// Import test setup to ensure database is initialized
import '../../setup.ts';

describe('Image Resolver Service', () => {
  describe('resolveImage', () => {
    test('should resolve with default values when no options provided', async () => {
      const result = await resolveImage();
      
      // Should have resolved values
      expect(result.imageName).toBeTruthy();
      expect(result.imageTag).toBeTruthy();
      expect(result.imageRef).toBeTruthy();
      expect(result.flavor).toBeTruthy();
      expect(result.resourceTier).toBeTruthy();
      
      // Default should have no addons
      expect(result.addons).toEqual([]);
      
      // Should have base ports
      expect(result.exposedPorts).toContain(80);
      
      // Should have resource limits
      expect(result.resourceLimits).toHaveProperty('limits_memory');
      expect(result.resourceLimits).toHaveProperty('limits_cpus');
    });

    test('should resolve with specific flavor', async () => {
      const result = await resolveImage({ flavorId: 'js' });
      
      expect(result.flavor.id).toBe('js');
      expect(result.imageName).toContain('agentpod-js');
    });

    test('should add warning for non-existent flavor', async () => {
      const result = await resolveImage({ flavorId: 'non-existent-flavor' });
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('non-existent-flavor'))).toBe(true);
      // Should fall back to default
      expect(result.flavor).toBeTruthy();
    });

    test('should resolve with specific resource tier', async () => {
      const result = await resolveImage({ resourceTierId: 'builder' });
      
      expect(result.resourceTier.id).toBe('builder');
    });

    test('should add warning for non-existent resource tier', async () => {
      const result = await resolveImage({ resourceTierId: 'non-existent-tier' });
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('non-existent-tier'))).toBe(true);
    });

    test.skip('should resolve with addons', async () => {
      const result = await resolveImage({ addonIds: ['code-server'] });
      
      expect(result.addons.length).toBe(1);
      expect(result.addons[0].id).toBe('code-server');
    });

    test.skip('should add warning for non-existent addons', async () => {
      const result = await resolveImage({ addonIds: ['code-server', 'fake-addon'] });
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('fake-addon'))).toBe(true);
      // Should still include valid addon
      expect(result.addons.length).toBe(1);
    });

    test.skip('should add addon ports to exposed ports', async () => {
      const result = await resolveImage({ addonIds: ['code-server'] });
      
      // Base port 80 + code-server port 8080
      expect(result.exposedPorts).toContain(80);
      expect(result.exposedPorts).toContain(8080);
    });

    test.skip('should set requiresGpu when GPU addon is included', async () => {
      const result = await resolveImage({ addonIds: ['gpu'] });
      
      expect(result.requiresGpu).toBe(true);
    });

    test.skip('should not require GPU when no GPU addon', async () => {
      const result = await resolveImage({ addonIds: ['code-server'] });
      
      expect(result.requiresGpu).toBe(false);
    });

    test.skip('should generate addon commands', async () => {
      const result = await resolveImage({ addonIds: ['code-server'] });
      
      expect(result.addonCommands).toBeTruthy();
      expect(result.addonCommands).toContain('code-server');
    });

    test.skip('should generate addon env vars', async () => {
      const result = await resolveImage({ addonIds: ['code-server'] });
      
      expect(result.addonEnvVars['CODE_SERVER_ENABLED']).toBe('true');
      expect(result.addonEnvVars['CODE_SERVER_PORT']).toBe('8080');
    });

    test.skip('should generate portsExposes string', async () => {
      const result = await resolveImage({ addonIds: ['code-server'] });
      
      expect(result.portsExposes).toContain('80');
      expect(result.portsExposes).toContain('8080');
    });

    test('should return proper image reference format', async () => {
      const result = await resolveImage({ flavorId: 'python' });
      
      // imageRef should be imageName:imageTag
      expect(result.imageRef).toBe(`${result.imageName}:${result.imageTag}`);
    });
  });

  describe('validateContainerConfig', () => {
    test('should validate valid configuration', async () => {
      const result = await validateContainerConfig({
        flavorId: 'js',
        resourceTierId: 'starter',
        addonIds: [],
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should return error for invalid flavor', async () => {
      const result = await validateContainerConfig({
        flavorId: 'invalid-flavor',
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid-flavor'))).toBe(true);
    });

    test('should return error for invalid resource tier', async () => {
      const result = await validateContainerConfig({
        resourceTierId: 'invalid-tier',
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid-tier'))).toBe(true);
    });

    test('should return error for invalid addon', async () => {
      const result = await validateContainerConfig({
        addonIds: ['invalid-addon'],
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid-addon'))).toBe(true);
    });

    test.skip('should validate multiple addons', async () => {
      const result = await validateContainerConfig({
        addonIds: ['code-server', 'databases'],
      });
      
      expect(result.valid).toBe(true);
    });

    test('should return multiple errors for multiple invalid items', async () => {
      const result = await validateContainerConfig({
        flavorId: 'bad-flavor',
        resourceTierId: 'bad-tier',
        addonIds: ['bad-addon'],
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    test('should validate empty configuration', async () => {
      const result = await validateContainerConfig({});
      
      expect(result.valid).toBe(true);
    });

    test('should return error for GPU addon without GPU support', async () => {
      const result = await validateContainerConfig({
        flavorId: 'js',
        addonIds: ['gpu'],
      });
      
      // GPU addon requires GPU support
      expect(result.errors.some(e => e.includes('gpu') || e.includes('GPU'))).toBe(true);
    });
  });

  describe('generateProjectUrls', () => {
    test('should return null URLs when no wildcard domain configured', () => {
      // This test depends on config, which may or may not have a wildcard domain
      const result = generateProjectUrls('test-project', []);
      
      // Either all nulls or all valid URLs based on config
      if (result.opencode === null) {
        expect(result.codeServer).toBeNull();
        expect(result.vnc).toBeNull();
        expect(result.domainsConfig).toBe('');
      } else {
        expect(result.opencode).toBeTruthy();
      }
    });

    test('should generate URLs for project with addons', () => {
      const mockAddons: ContainerAddon[] = [
        {
          id: 'code-server',
          name: 'Code Server',
          description: null,
          category: 'interface',
          imageSizeMb: 100,
          port: 8080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateProjectUrls('my-project', mockAddons);
      
      // If wildcard domain is configured
      if (result.opencode !== null) {
        expect(result.codeServer).toBeTruthy();
        expect(result.codeServer).toContain('code-my-project');
      }
    });

    test('should generate URLs for GUI addon', () => {
      const mockAddons: ContainerAddon[] = [
        {
          id: 'gui',
          name: 'GUI',
          description: null,
          category: 'interface',
          imageSizeMb: 500,
          port: 6080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 5,
          sortOrder: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateProjectUrls('gui-project', mockAddons);
      
      // If wildcard domain is configured
      if (result.opencode !== null) {
        expect(result.vnc).toBeTruthy();
        expect(result.vnc).toContain('vnc-gui-project');
      }
    });

    test('should include multiple domains in domainsConfig', () => {
      const mockAddons: ContainerAddon[] = [
        {
          id: 'code-server',
          name: 'Code Server',
          description: null,
          category: 'interface',
          imageSizeMb: 100,
          port: 8080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'gui',
          name: 'GUI',
          description: null,
          category: 'interface',
          imageSizeMb: 500,
          port: 6080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 5,
          sortOrder: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateProjectUrls('multi-project', mockAddons);
      
      // If wildcard domain is configured, domainsConfig should have multiple entries
      if (result.opencode !== null) {
        const domainCount = result.domainsConfig.split(',').length;
        expect(domainCount).toBeGreaterThanOrEqual(3); // main + code-server + vnc
      }
    });
  });

  describe('estimateImageSize', () => {
    test('should estimate size with base + flavor', () => {
      const flavor: ContainerFlavor = {
        id: 'js',
        name: 'JavaScript',
        description: null,
        languages: ['javascript', 'typescript'],
        imageSizeMb: 200,
        isDefault: true,
        enabled: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const size = estimateImageSize(flavor, []);
      
      // Base (500) + flavor (200)
      expect(size).toBe(700);
    });

    test('should include addon sizes', () => {
      const flavor: ContainerFlavor = {
        id: 'js',
        name: 'JavaScript',
        description: null,
        languages: ['javascript', 'typescript'],
        imageSizeMb: 200,
        isDefault: true,
        enabled: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const addons: ContainerAddon[] = [
        {
          id: 'code-server',
          name: 'Code Server',
          description: null,
          category: 'interface',
          imageSizeMb: 100,
          port: 8080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'gui',
          name: 'GUI',
          description: null,
          category: 'interface',
          imageSizeMb: 500,
          port: 6080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 5,
          sortOrder: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const size = estimateImageSize(flavor, addons);
      
      // Base (500) + flavor (200) + code-server (100) + gui (500)
      expect(size).toBe(1300);
    });

    test('should handle null imageSizeMb', () => {
      const flavor: ContainerFlavor = {
        id: 'custom',
        name: 'Custom',
        description: null,
        languages: [],
        imageSizeMb: null,
        isDefault: false,
        enabled: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const addons: ContainerAddon[] = [
        {
          id: 'custom-addon',
          name: 'Custom Addon',
          description: null,
          category: 'interface',
          imageSizeMb: null,
          port: null,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const size = estimateImageSize(flavor, addons);
      
      // Base (500) + flavor (0) + addon (0)
      expect(size).toBe(500);
    });
  });

  describe('generateAddonCommands', () => {
    test('should return empty string for no addons', () => {
      const result = generateAddonCommands([]);
      expect(result).toBe('');
    });

    test('should generate code-server commands', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'code-server',
          name: 'Code Server',
          description: null,
          category: 'interface',
          imageSizeMb: 100,
          port: 8080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonCommands(addons);
      
      expect(result).toContain('code-server');
      expect(result).toContain('install');
    });

    test('should generate GUI commands', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'gui',
          name: 'GUI',
          description: null,
          category: 'interface',
          imageSizeMb: 500,
          port: 6080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 5,
          sortOrder: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonCommands(addons);
      
      expect(result).toContain('GUI');
      expect(result).toContain('xfce');
    });

    test('should generate database commands', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'databases',
          name: 'Databases',
          description: null,
          category: 'devops',
          imageSizeMb: 50,
          port: null,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonCommands(addons);
      
      expect(result).toContain('database');
      expect(result).toContain('postgresql-client');
    });

    test('should generate cloud commands', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'cloud',
          name: 'Cloud',
          description: null,
          category: 'devops',
          imageSizeMb: 200,
          port: null,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 4,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonCommands(addons);
      
      expect(result).toContain('cloud');
      expect(result).toContain('aws');
    });

    test('should generate GPU commands', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'gpu',
          name: 'GPU',
          description: null,
          category: 'compute',
          imageSizeMb: 0,
          port: null,
          requiresGpu: true,
          requiresFlavor: null,
          priceMonthly: 20,
          sortOrder: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonCommands(addons);
      
      expect(result).toContain('GPU');
    });

    test('should combine commands for multiple addons', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'code-server',
          name: 'Code Server',
          description: null,
          category: 'interface',
          imageSizeMb: 100,
          port: 8080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'databases',
          name: 'Databases',
          description: null,
          category: 'devops',
          imageSizeMb: 50,
          port: null,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonCommands(addons);
      
      expect(result).toContain('code-server');
      expect(result).toContain('database');
    });

    test('should return empty for unknown addons', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'unknown-addon',
          name: 'Unknown',
          description: null,
          category: 'interface',
          imageSizeMb: 0,
          port: null,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonCommands(addons);
      
      expect(result).toBe('');
    });
  });

  describe('generateAddonEnvVars', () => {
    test('should return empty object for no addons', () => {
      const result = generateAddonEnvVars([]);
      expect(Object.keys(result)).toHaveLength(0);
    });

    test('should generate code-server env vars', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'code-server',
          name: 'Code Server',
          description: null,
          category: 'interface',
          imageSizeMb: 100,
          port: 8080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonEnvVars(addons);
      
      expect(result['CODE_SERVER_ENABLED']).toBe('true');
      expect(result['CODE_SERVER_PORT']).toBe('8080');
    });

    test('should generate GUI env vars', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'gui',
          name: 'GUI',
          description: null,
          category: 'interface',
          imageSizeMb: 500,
          port: 6080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 5,
          sortOrder: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonEnvVars(addons);
      
      expect(result['GUI_ENABLED']).toBe('true');
      expect(result['VNC_PORT']).toBe('6080');
      expect(result['DISPLAY']).toBe(':1');
    });

    test('should generate database env vars', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'databases',
          name: 'Databases',
          description: null,
          category: 'devops',
          imageSizeMb: 50,
          port: null,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonEnvVars(addons);
      
      expect(result['DATABASE_TOOLS_ENABLED']).toBe('true');
    });

    test('should generate cloud env vars', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'cloud',
          name: 'Cloud',
          description: null,
          category: 'devops',
          imageSizeMb: 200,
          port: null,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 4,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonEnvVars(addons);
      
      expect(result['CLOUD_CLI_ENABLED']).toBe('true');
    });

    test('should generate GPU env vars', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'gpu',
          name: 'GPU',
          description: null,
          category: 'compute',
          imageSizeMb: 0,
          port: null,
          requiresGpu: true,
          requiresFlavor: null,
          priceMonthly: 20,
          sortOrder: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonEnvVars(addons);
      
      expect(result['GPU_ENABLED']).toBe('true');
      expect(result['NVIDIA_VISIBLE_DEVICES']).toBe('all');
    });

    test('should combine env vars for multiple addons', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'code-server',
          name: 'Code Server',
          description: null,
          category: 'interface',
          imageSizeMb: 100,
          port: 8080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'gui',
          name: 'GUI',
          description: null,
          category: 'interface',
          imageSizeMb: 500,
          port: 6080,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 5,
          sortOrder: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonEnvVars(addons);
      
      expect(result['CODE_SERVER_ENABLED']).toBe('true');
      expect(result['GUI_ENABLED']).toBe('true');
    });

    test('should return empty for unknown addons', () => {
      const addons: ContainerAddon[] = [
        {
          id: 'unknown-addon',
          name: 'Unknown',
          description: null,
          category: 'interface',
          imageSizeMb: 0,
          port: null,
          requiresGpu: false,
          requiresFlavor: null,
          priceMonthly: 0,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      const result = generateAddonEnvVars(addons);
      
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
