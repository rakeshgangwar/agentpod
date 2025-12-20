import { getSandboxManager } from '../sandbox-manager.ts';
import { createLogger } from '../../utils/logger.ts';
import type { DetectedPort } from './types.ts';

const log = createLogger('port-detector');

const SYSTEM_PORTS = new Set([80, 443, 4096, 4097, 8080]);
const COMMON_DEV_PORTS = [3000, 3001, 4000, 4321, 5000, 5173, 5174, 8000, 8080, 8888];

const FRAMEWORK_PATTERNS: Record<string, RegExp[]> = {
  'vite': [/vite/, /node.*vite/],
  'next': [/next/, /node.*next/],
  'react': [/react-scripts/],
  'vue': [/vue-cli-service/, /vite/],
  'angular': [/ng serve/, /angular/],
  'astro': [/astro/, /node.*astro/],
  'express': [/node.*express/],
  'fastapi': [/uvicorn/, /python.*fastapi/],
  'flask': [/flask/],
  'django': [/python.*manage.py/],
  'jupyter': [/jupyter/],
  'streamlit': [/streamlit/],
};

const PORT_FRAMEWORKS: Record<number, string> = {
  3000: 'react/next',
  3001: 'next',
  4000: 'graphql',
  4321: 'astro',
  5173: 'vite',
  5174: 'vite',
  8000: 'django/fastapi',
  8080: 'spring/general',
  8888: 'jupyter',
  8501: 'streamlit',
};

function detectFramework(process: string, port: number): string | undefined {
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (patterns.some(p => p.test(process))) {
      return framework;
    }
  }
  return undefined;
}

function guessFrameworkByPort(port: number): string | undefined {
  return PORT_FRAMEWORKS[port];
}

export async function detectOpenPorts(sandboxId: string): Promise<DetectedPort[]> {
  const results: DetectedPort[] = [];
  const manager = getSandboxManager();

  try {
    const { stdout } = await manager.exec(sandboxId, ['ss', '-tlnp']);
    
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/:(\d+)\s.*users:\(\("([^"]+)",pid=(\d+)/);
      if (match) {
        const port = parseInt(match[1], 10);
        const process = match[2];
        
        if (port < 1024 || SYSTEM_PORTS.has(port)) continue;
        
        results.push({
          port,
          process,
          pid: parseInt(match[3], 10),
          framework: detectFramework(process, port),
          confidence: 'high',
        });
      }
    }
  } catch (error) {
    log.warn('ss command failed, falling back to port probe', { sandboxId, error });
  }

  for (const port of COMMON_DEV_PORTS) {
    if (results.some(r => r.port === port)) continue;
    if (SYSTEM_PORTS.has(port)) continue;

    try {
      const isOpen = await probePort(sandboxId, port);
      if (isOpen) {
        results.push({
          port,
          framework: guessFrameworkByPort(port),
          confidence: 'medium',
        });
      }
    } catch {
    }
  }

  return results;
}

async function probePort(sandboxId: string, port: number): Promise<boolean> {
  const manager = getSandboxManager();
  
  try {
    const { exitCode } = await manager.exec(sandboxId, [
      'sh', '-c',
      `timeout 1 bash -c "echo >/dev/tcp/localhost/${port}" 2>/dev/null || ` +
      `timeout 1 nc -z localhost ${port} 2>/dev/null || ` +
      `curl -s --connect-timeout 1 http://localhost:${port} >/dev/null 2>&1`
    ]);
    return exitCode === 0;
  } catch {
    return false;
  }
}

export async function detectAndRegisterPorts(sandboxId: string): Promise<DetectedPort[]> {
  const detected = await detectOpenPorts(sandboxId);
  
  const { upsertPreviewPort } = await import('../../models/preview-port.ts');
  
  for (const port of detected) {
    await upsertPreviewPort({
      sandboxId,
      port: port.port,
      detectedFramework: port.framework,
      detectedProcess: port.process,
    });
  }
  
  log.info('Detected and registered ports', { sandboxId, count: detected.length });
  return detected;
}
