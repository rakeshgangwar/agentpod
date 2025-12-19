export type {
  SandboxProvider,
  SandboxProviderType,
  SandboxProviderOptions,
  SandboxInfo,
  SandboxProviderStatus,
  OpenCodeConfig,
  OpenCodeClient,
  ProviderSelectionOptions,
  ProviderFactoryConfig,
  SandboxEvent,
  SandboxEventType,
  AgentTask,
  AgentTaskStatus,
  TeamAgent,
  TeamAgentResult,
  TeamTask,
} from "./types";

export { DockerSandboxProvider, getDockerProvider } from "./docker-provider";
export { CloudflareSandboxProvider, getCloudflareProvider, isCloudflareConfigured } from "./cloudflare-provider";

export {
  agentPodToCloudflareConfig,
  cloudflareToAgentPodAuth,
  openCodeConfigToCloudflare,
  cloudflareToOpenCodeConfig,
} from "./config-adapter";

import type { SandboxProvider, SandboxProviderType, ProviderSelectionOptions } from "./types";
import { getDockerProvider } from "./docker-provider";
import { config } from "../../config";
import { createLogger } from "../../utils/logger";

const log = createLogger("provider-factory");

interface ProviderRegistry {
  docker: () => SandboxProvider;
  cloudflare?: () => SandboxProvider;
}

const providers: ProviderRegistry = {
  docker: getDockerProvider,
};

export function registerProvider(type: SandboxProviderType, factory: () => SandboxProvider): void {
  if (type === "docker") {
    providers.docker = factory;
  } else if (type === "cloudflare") {
    providers.cloudflare = factory;
  }
  log.info("Registered sandbox provider", { type });
}

export function getProvider(type: SandboxProviderType): SandboxProvider {
  if (type === "cloudflare") {
    if (!providers.cloudflare) {
      throw new Error("Cloudflare provider not registered. Enable ENABLE_CLOUDFLARE_SANDBOXES=true");
    }
    return providers.cloudflare();
  }
  return providers.docker();
}

export function selectProvider(options?: ProviderSelectionOptions): SandboxProvider {
  if (options?.provider) {
    return getProvider(options.provider);
  }

  const defaultProvider = (config as { cloudflare?: { defaultProvider?: SandboxProviderType } }).cloudflare?.defaultProvider ?? "docker";
  const autoSelect = (config as { cloudflare?: { autoSelect?: boolean } }).cloudflare?.autoSelect ?? false;

  if (!autoSelect || !options?.useCase) {
    return getProvider(defaultProvider);
  }

  const providerForUseCase: Record<string, SandboxProviderType> = {
    development: "docker",
    "quick-task": "cloudflare",
    batch: "cloudflare",
    "multi-agent": "cloudflare",
  };

  const selectedType = providerForUseCase[options.useCase] ?? defaultProvider;

  if (selectedType === "cloudflare" && !providers.cloudflare) {
    log.warn("Cloudflare requested but not available, falling back to Docker", { useCase: options.useCase });
    return getProvider("docker");
  }

  return getProvider(selectedType);
}

export function isCloudflareAvailable(): boolean {
  return !!providers.cloudflare;
}

export function getAvailableProviders(): SandboxProviderType[] {
  const available: SandboxProviderType[] = ["docker"];
  if (providers.cloudflare) {
    available.push("cloudflare");
  }
  return available;
}
