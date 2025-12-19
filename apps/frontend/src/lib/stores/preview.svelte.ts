import * as api from "$lib/api/tauri";

export interface PreviewPort {
  id: string;
  sandboxId: string;
  port: number;
  label?: string;
  isPublic: boolean;
  publicToken?: string;
  publicExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DetectPortsResponse {
  ports: PreviewPort[];
}

let portsMap = $state<Record<string, PreviewPort[]>>({});
let selectedPorts = $state<Record<string, number | null>>({});
let isLoading = $state(false);
let error = $state<string | null>(null);

export const previewStore = {
  get isLoading() { return isLoading; },
  get error() { return error; },
  
  getPorts(sandboxId: string): PreviewPort[] {
    return portsMap[sandboxId] || [];
  },
  
  getSelectedPort(sandboxId: string): number | null {
    if (selectedPorts[sandboxId] !== undefined) {
      return selectedPorts[sandboxId];
    }
    const ports = portsMap[sandboxId] || [];
    return ports.length > 0 ? ports[0].port : null;
  },
  
  getPreviewUrl(sandboxId: string, port: number, sandboxSlug?: string): string {
    if (!sandboxSlug) {
      console.warn("getPreviewUrl called without sandboxSlug, URL might be incorrect");
      return `http://preview-unknown-${port}.localhost`;
    }
    return `http://preview-${sandboxSlug}-${port}.localhost`;
  }
};

export async function fetchPorts(sandboxId: string): Promise<PreviewPort[]> {
  isLoading = true;
  error = null;
  try {
    const ports = await api.invoke<PreviewPort[]>("get_sandbox_preview_ports", { sandboxId });
    portsMap[sandboxId] = ports;
    
    if (ports.length > 0 && selectedPorts[sandboxId] === undefined) {
      selectedPorts[sandboxId] = ports[0].port;
    }
    
    return ports;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch preview ports";
    console.error("Fetch ports error:", e);
    return [];
  } finally {
    isLoading = false;
  }
}

export async function detectPorts(sandboxId: string): Promise<PreviewPort[]> {
  isLoading = true;
  error = null;
  try {
    const result = await api.invoke<DetectPortsResponse>("detect_sandbox_preview_ports", { sandboxId });
    portsMap[sandboxId] = result.ports;
    
    if (result.ports.length > 0 && (selectedPorts[sandboxId] === undefined || selectedPorts[sandboxId] === null)) {
      selectedPorts[sandboxId] = result.ports[0].port;
    }
    
    return result.ports;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to detect preview ports";
    console.error("Detect ports error:", e);
    return [];
  } finally {
    isLoading = false;
  }
}

export async function registerPort(sandboxId: string, port: number, label?: string): Promise<PreviewPort | null> {
  isLoading = true;
  error = null;
  try {
    const newPort = await api.invoke<PreviewPort>("register_sandbox_preview_port", { 
      sandboxId, 
      port, 
      label 
    });
    
    const currentPorts = portsMap[sandboxId] || [];
    const exists = currentPorts.some(p => p.port === port);
    
    if (exists) {
      portsMap[sandboxId] = currentPorts.map(p => p.port === port ? newPort : p);
    } else {
      portsMap[sandboxId] = [...currentPorts, newPort].sort((a, b) => a.port - b.port);
    }
    
    selectedPorts[sandboxId] = port;
    
    return newPort;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to register port";
    console.error("Register port error:", e);
    return null;
  } finally {
    isLoading = false;
  }
}

export async function deletePort(sandboxId: string, port: number): Promise<boolean> {
  isLoading = true;
  error = null;
  try {
    await api.invoke("delete_sandbox_preview_port", { sandboxId, port });
    
    const currentPorts = portsMap[sandboxId] || [];
    portsMap[sandboxId] = currentPorts.filter(p => p.port !== port);
    
    if (selectedPorts[sandboxId] === port) {
      const remaining = portsMap[sandboxId];
      selectedPorts[sandboxId] = remaining.length > 0 ? remaining[0].port : null;
    }
    
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete port";
    console.error("Delete port error:", e);
    return false;
  } finally {
    isLoading = false;
  }
}

export function selectPort(sandboxId: string, port: number | null): void {
  selectedPorts[sandboxId] = port;
}

export function clearError(): void {
  error = null;
}
