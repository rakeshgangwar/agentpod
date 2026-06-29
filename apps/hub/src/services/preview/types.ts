export interface DetectedPort {
  port: number;
  pid?: number;
  process?: string;
  framework?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface PreviewConfig {
  sandboxId: string;
  slug: string;
  ports: Array<{
    port: number;
    label?: string;
  }>;
}

export interface TraefikDynamicConfig {
  http: {
    routers: Record<string, {
      rule: string;
      service: string;
      entryPoints: string[];
      middlewares?: string[];
      tls?: { certresolver?: string };
    }>;
    services: Record<string, {
      loadBalancer: {
        servers: Array<{ url: string }>;
      };
    }>;
    middlewares?: Record<string, unknown>;
  };
}
