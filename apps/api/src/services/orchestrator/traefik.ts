/**
 * Traefik Label Generator
 * Generates Docker labels for Traefik reverse proxy configuration
 */

export interface TraefikRouteConfig {
  /** Service name (used as router/service identifier) */
  name: string;

  /** Container port to route to */
  port: number;

  /** Subdomain for the route (e.g., "my-project" -> "my-project.localhost") */
  subdomain: string;

  /** Base domain (e.g., "localhost" or "agentpod.dev") */
  baseDomain: string;

  /** Whether to enable HTTPS/TLS */
  tls?: boolean;

  /** TLS certificate resolver (e.g., "letsencrypt") */
  certResolver?: string;

  /** Path prefix (optional, for path-based routing) */
  pathPrefix?: string;

  /** Strip the path prefix before forwarding to the container */
  stripPrefix?: boolean;

  /** Middleware names to apply */
  middlewares?: string[];

  /** Priority for route matching (higher = more specific) */
  priority?: number;
}

export interface TraefikConfig {
  /** Whether Traefik is enabled */
  enabled: boolean;

  /** Docker network Traefik is connected to */
  network: string;

  /** Entrypoint for HTTP traffic */
  httpEntrypoint: string;

  /** Entrypoint for HTTPS traffic */
  httpsEntrypoint: string;

  /** Whether to enable TLS by default */
  defaultTls: boolean;

  /** Default certificate resolver */
  defaultCertResolver?: string;
}

/**
 * Default Traefik configuration
 */
export const DEFAULT_TRAEFIK_CONFIG: TraefikConfig = {
  enabled: true,
  network: "agentpod-net",
  httpEntrypoint: "web",
  httpsEntrypoint: "websecure",
  defaultTls: false,
  defaultCertResolver: undefined,
};

/**
 * Generate Traefik labels for a container
 */
export function generateTraefikLabels(
  routes: TraefikRouteConfig[],
  config: Partial<TraefikConfig> = {}
): Record<string, string> {
  const cfg: TraefikConfig = { ...DEFAULT_TRAEFIK_CONFIG, ...config };
  const labels: Record<string, string> = {};

  if (!cfg.enabled) {
    labels["traefik.enable"] = "false";
    return labels;
  }

  // Enable Traefik for this container
  labels["traefik.enable"] = "true";

  // Specify the Docker network
  labels["traefik.docker.network"] = cfg.network;

  // Generate labels for each route
  for (const route of routes) {
    const routeLabels = generateRouteLabels(route, cfg);
    Object.assign(labels, routeLabels);
  }

  return labels;
}

/**
 * Generate labels for a single route
 */
function generateRouteLabels(
  route: TraefikRouteConfig,
  config: TraefikConfig
): Record<string, string> {
  const labels: Record<string, string> = {};
  const routerName = sanitizeName(route.name);
  const serviceName = sanitizeName(route.name);

  // Build the host rule
  const host = `${route.subdomain}.${route.baseDomain}`;
  let rule = `Host(\`${host}\`)`;

  // Add path prefix if specified
  if (route.pathPrefix) {
    rule += ` && PathPrefix(\`${route.pathPrefix}\`)`;
  }

  // Router configuration
  const useTls = route.tls ?? config.defaultTls;
  const entrypoint = useTls ? config.httpsEntrypoint : config.httpEntrypoint;

  labels[`traefik.http.routers.${routerName}.rule`] = rule;
  labels[`traefik.http.routers.${routerName}.entrypoints`] = entrypoint;
  labels[`traefik.http.routers.${routerName}.service`] = serviceName;

  // Priority (optional)
  if (route.priority !== undefined) {
    labels[`traefik.http.routers.${routerName}.priority`] = String(
      route.priority
    );
  }

  // TLS configuration
  if (useTls) {
    labels[`traefik.http.routers.${routerName}.tls`] = "true";
    const certResolver = route.certResolver ?? config.defaultCertResolver;
    if (certResolver) {
      labels[`traefik.http.routers.${routerName}.tls.certresolver`] =
        certResolver;
    }
  }

  // Service configuration (load balancer port)
  labels[`traefik.http.services.${serviceName}.loadbalancer.server.port`] =
    String(route.port);

  // Middlewares
  const middlewares: string[] = [];

  // Strip prefix middleware
  if (route.pathPrefix && route.stripPrefix) {
    const stripMiddlewareName = `${routerName}-stripprefix`;
    labels[
      `traefik.http.middlewares.${stripMiddlewareName}.stripprefix.prefixes`
    ] = route.pathPrefix;
    middlewares.push(stripMiddlewareName);
  }

  // Additional middlewares
  if (route.middlewares) {
    middlewares.push(...route.middlewares);
  }

  // Apply middlewares
  if (middlewares.length > 0) {
    labels[`traefik.http.routers.${routerName}.middlewares`] =
      middlewares.join(",");
  }

  return labels;
}

/**
 * Sanitize a name for use in Traefik labels
 * Traefik names must be alphanumeric with hyphens/underscores
 */
function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

/**
 * Generate standard labels for an AgentPod sandbox
 */
export function generateSandboxLabels(options: {
  sandboxId: string;
  slug: string;
  baseDomain: string;
  opencodePort?: number;
  codeServerPort?: number;
  homepagePort?: number;
  vncPort?: number;
  tls?: boolean;
  certResolver?: string;
  network?: string;
}): Record<string, string> {
  const {
    sandboxId,
    slug,
    baseDomain,
    opencodePort = 4096,
    codeServerPort,
    homepagePort = 8080,
    vncPort,
    tls = baseDomain !== "localhost",
    certResolver,
    network = "agentpod-net",
  } = options;

  const routes: TraefikRouteConfig[] = [];

  // Main route (homepage or opencode)
  routes.push({
    name: `${slug}-main`,
    port: homepagePort,
    subdomain: slug,
    baseDomain,
    tls,
    certResolver,
  });

  // OpenCode API route
  routes.push({
    name: `${slug}-opencode`,
    port: opencodePort,
    subdomain: `${slug}-api`,
    baseDomain,
    tls,
    certResolver,
  });

  // Code Server route (if enabled)
  if (codeServerPort) {
    routes.push({
      name: `${slug}-code`,
      port: codeServerPort,
      subdomain: `${slug}-code`,
      baseDomain,
      tls,
      certResolver,
    });
  }

  // VNC route (if enabled)
  if (vncPort) {
    routes.push({
      name: `${slug}-vnc`,
      port: vncPort,
      subdomain: `${slug}-vnc`,
      baseDomain,
      tls,
      certResolver,
    });
  }

  // Generate Traefik labels
  const traefikLabels = generateTraefikLabels(routes, {
    network,
    defaultTls: tls,
    defaultCertResolver: certResolver,
  });

  // Build URLs for the sandbox
  const urls = buildSandboxUrls(slug, baseDomain, {
    tls,
    hasCodeServer: !!codeServerPort,
    hasVnc: !!vncPort,
  });

  // Add AgentPod metadata labels including URLs
  const labels: Record<string, string> = {
    ...traefikLabels,
    "agentpod.sandbox.id": sandboxId,
    "agentpod.sandbox.slug": slug,
    "agentpod.managed": "true",
  };

  // Add URL labels (these are parsed in containerInfoToSandbox)
  for (const [key, value] of Object.entries(urls)) {
    labels[`agentpod.url.${key}`] = value;
  }

  return labels;
}

/**
 * Build URLs for a sandbox based on its labels
 */
export function buildSandboxUrls(
  slug: string,
  baseDomain: string,
  options: {
    tls?: boolean;
    hasCodeServer?: boolean;
    hasVnc?: boolean;
  } = {}
): Record<string, string> {
  const { tls = baseDomain !== "localhost", hasCodeServer, hasVnc } = options;
  const protocol = tls ? "https" : "http";

  const urls: Record<string, string> = {
    homepage: `${protocol}://${slug}.${baseDomain}`,
    opencode: `${protocol}://${slug}-api.${baseDomain}`,
  };

  if (hasCodeServer) {
    urls.codeServer = `${protocol}://${slug}-code.${baseDomain}`;
  }

  if (hasVnc) {
    urls.vnc = `${protocol}://${slug}-vnc.${baseDomain}`;
  }

  return urls;
}
