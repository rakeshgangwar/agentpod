import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { config } from '../../config.ts';
import { createLogger } from '../../utils/logger.ts';
import { listPreviewPortsBySandbox } from '../../models/preview-port.ts';
import { getSandboxById } from '../../models/sandbox.ts';
import type { PreviewConfig, TraefikDynamicConfig } from './types.ts';

const log = createLogger('preview-service');

const TRAEFIK_DYNAMIC_DIR = process.env.TRAEFIK_DYNAMIC_DIR || './config/traefik/dynamic';

export { detectOpenPorts, detectAndRegisterPorts } from './detector.ts';
export * from './types.ts';

export function buildPreviewUrl(slug: string, port: number): string {
  const protocol = config.domain.protocol;
  const baseDomain = config.domain.base;
  return `${protocol}://preview-${slug}-${port}.${baseDomain}`;
}

export async function generateTraefikConfig(sandboxId: string): Promise<TraefikDynamicConfig | null> {
  const sandbox = await getSandboxById(sandboxId);
  if (!sandbox) {
    log.warn('Sandbox not found for Traefik config generation', { sandboxId });
    return null;
  }

  const ports = await listPreviewPortsBySandbox(sandboxId);
  if (ports.length === 0) {
    return null;
  }

  const containerName = `agentpod-${sandbox.id}`;
  const baseDomain = config.domain.base;
  const useTls = config.traefik.tls;
  const certResolver = config.traefik.certResolver;

  const traefikConfig: TraefikDynamicConfig = {
    http: {
      routers: {},
      services: {},
    },
  };

  for (const port of ports) {
    const routerName = `${sandbox.slug}-preview-${port.port}`;
    const serviceName = routerName;
    const host = `preview-${sandbox.slug}-${port.port}.${baseDomain}`;

    traefikConfig.http.routers[routerName] = {
      rule: `Host(\`${host}\`)`,
      service: serviceName,
      entryPoints: useTls ? ['websecure'] : ['web'],
    };

    if (useTls) {
      traefikConfig.http.routers[routerName].tls = certResolver ? { certresolver: certResolver } : {};
    }

    traefikConfig.http.services[serviceName] = {
      loadBalancer: {
        servers: [{ url: `http://${containerName}:${port.port}` }],
      },
    };
  }

  return traefikConfig;
}

export async function writeTraefikConfigFile(sandboxId: string): Promise<string | null> {
  const traefikConfig = await generateTraefikConfig(sandboxId);
  
  if (!traefikConfig) {
    await removeTraefikConfigFile(sandboxId);
    return null;
  }

  const sandbox = await getSandboxById(sandboxId);
  if (!sandbox) return null;

  const configDir = TRAEFIK_DYNAMIC_DIR;
  await fs.mkdir(configDir, { recursive: true });

  const configFile = path.join(configDir, `preview-${sandbox.slug}.yml`);
  const yamlContent = yaml.stringify(traefikConfig);

  await fs.writeFile(configFile, yamlContent, 'utf-8');
  log.info('Wrote Traefik preview config', { sandboxId, file: configFile });

  return configFile;
}

export async function removeTraefikConfigFile(sandboxId: string): Promise<void> {
  const sandbox = await getSandboxById(sandboxId);
  if (!sandbox) return;

  const configFile = path.join(TRAEFIK_DYNAMIC_DIR, `preview-${sandbox.slug}.yml`);

  try {
    await fs.unlink(configFile);
    log.info('Removed Traefik preview config', { sandboxId, file: configFile });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('Failed to remove Traefik config file', { sandboxId, error });
    }
  }
}

export async function syncAllPreviewConfigs(): Promise<void> {
  const { listAllSandboxes } = await import('../../models/sandbox.ts');
  const sandboxes = await listAllSandboxes();

  for (const sandbox of sandboxes) {
    if (sandbox.status === 'running') {
      try {
        await writeTraefikConfigFile(sandbox.id);
      } catch (error) {
        log.warn('Failed to sync preview config for sandbox', { sandboxId: sandbox.id, error });
      }
    }
  }

  log.info('Synced all preview configs');
}

export async function onPreviewPortRegistered(sandboxId: string, port: number): Promise<void> {
  await writeTraefikConfigFile(sandboxId);
  log.debug('Updated Traefik config after port registration', { sandboxId, port });
}

export async function onPreviewPortDeleted(sandboxId: string, port: number): Promise<void> {
  const ports = await listPreviewPortsBySandbox(sandboxId);
  
  if (ports.length === 0) {
    await removeTraefikConfigFile(sandboxId);
  } else {
    await writeTraefikConfigFile(sandboxId);
  }
  
  log.debug('Updated Traefik config after port deletion', { sandboxId, port });
}

export async function onSandboxDeleted(sandboxId: string): Promise<void> {
  await removeTraefikConfigFile(sandboxId);
}
