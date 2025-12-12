/**
 * AgentPod Project Auto-Detection
 *
 * Automatically detects project type and generates a partial configuration
 * based on files found in the repository.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
  AgentPodConfig,
  FlavorId,
  LifecycleConfig,
  EnvironmentConfig,
  ServicesConfig,
  PortsConfig,
} from "./schema.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of project auto-detection
 */
export interface AutoDetectResult {
  /** Detected project type/flavor */
  flavor: FlavorId;

  /** Confidence level of detection (0-1) */
  confidence: number;

  /** Detected features */
  features: DetectedFeatures;

  /** Generated partial configuration */
  config: Partial<AgentPodConfig>;

  /** Detection messages (what was detected and why) */
  messages: string[];
}

/**
 * Detected project features
 */
export interface DetectedFeatures {
  /** Detected languages */
  languages: string[];

  /** Detected frameworks */
  frameworks: string[];

  /** Detected package managers */
  packageManagers: string[];

  /** Detected databases */
  databases: string[];

  /** Is this a monorepo? */
  isMonorepo: boolean;

  /** Does it have Docker support? */
  hasDocker: boolean;
}

/**
 * File detection rule
 */
interface DetectionRule {
  /** File(s) to check for */
  files: string[];
  /** Language/tool this indicates */
  indicator: string;
  /** Type of indicator */
  type: "language" | "framework" | "packageManager" | "database" | "tool";
  /** Additional action to take */
  action?: (repoPath: string, features: DetectedFeatures) => Promise<void>;
}

// =============================================================================
// Detection Rules
// =============================================================================

const DETECTION_RULES: DetectionRule[] = [
  // JavaScript/TypeScript
  { files: ["package.json"], indicator: "javascript", type: "language" },
  { files: ["tsconfig.json"], indicator: "typescript", type: "language" },
  { files: ["pnpm-lock.yaml", "pnpm-workspace.yaml"], indicator: "pnpm", type: "packageManager" },
  { files: ["yarn.lock"], indicator: "yarn", type: "packageManager" },
  { files: ["package-lock.json"], indicator: "npm", type: "packageManager" },
  { files: ["bun.lockb", "bun.lock"], indicator: "bun", type: "packageManager" },

  // JavaScript Frameworks
  { files: ["next.config.js", "next.config.mjs", "next.config.ts"], indicator: "nextjs", type: "framework" },
  { files: ["svelte.config.js"], indicator: "svelte", type: "framework" },
  { files: ["nuxt.config.js", "nuxt.config.ts"], indicator: "nuxt", type: "framework" },
  { files: ["vite.config.js", "vite.config.ts"], indicator: "vite", type: "framework" },
  { files: ["angular.json"], indicator: "angular", type: "framework" },
  { files: ["remix.config.js"], indicator: "remix", type: "framework" },
  { files: ["astro.config.mjs", "astro.config.js"], indicator: "astro", type: "framework" },

  // Python
  { files: ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"], indicator: "python", type: "language" },
  { files: ["poetry.lock"], indicator: "poetry", type: "packageManager" },
  { files: ["Pipfile.lock"], indicator: "pipenv", type: "packageManager" },
  { files: ["uv.lock"], indicator: "uv", type: "packageManager" },

  // Python Frameworks
  { files: ["manage.py", "django.conf"], indicator: "django", type: "framework" },
  { files: ["app.py", "wsgi.py"], indicator: "flask", type: "framework" },
  { files: ["fastapi"], indicator: "fastapi", type: "framework" },

  // Go
  { files: ["go.mod"], indicator: "go", type: "language" },

  // Rust
  { files: ["Cargo.toml"], indicator: "rust", type: "language" },

  // Ruby
  { files: ["Gemfile"], indicator: "ruby", type: "language" },
  { files: ["config/routes.rb"], indicator: "rails", type: "framework" },

  // Java/Kotlin
  { files: ["pom.xml"], indicator: "java", type: "language" },
  { files: ["build.gradle", "build.gradle.kts"], indicator: "java", type: "language" },

  // PHP
  { files: ["composer.json"], indicator: "php", type: "language" },
  { files: ["artisan"], indicator: "laravel", type: "framework" },

  // Databases (usually in docker-compose or similar)
  { files: ["docker-compose.yml", "docker-compose.yaml", "compose.yml"], indicator: "docker", type: "tool" },

  // Monorepo indicators
  { files: ["turbo.json"], indicator: "turborepo", type: "tool" },
  { files: ["lerna.json"], indicator: "lerna", type: "tool" },
  { files: ["nx.json"], indicator: "nx", type: "tool" },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if any of the files exist in the repository
 */
function hasAnyFile(repoPath: string, files: string[]): boolean {
  return files.some((file) => existsSync(`${repoPath}/${file}`));
}

/**
 * Determine flavor based on detected features
 */
function determineFlavor(features: DetectedFeatures): FlavorId {
  const { languages, frameworks } = features;

  // Monorepo or multiple languages -> polyglot
  if (
    features.isMonorepo ||
    languages.filter((l) => ["javascript", "python", "go", "rust"].includes(l)).length > 1
  ) {
    return "polyglot";
  }

  // Fullstack JS frameworks
  if (
    frameworks.some((f) =>
      ["nextjs", "nuxt", "remix", "svelte", "astro"].includes(f)
    )
  ) {
    return "fullstack";
  }

  // Pure JavaScript/TypeScript
  if (languages.includes("javascript") || languages.includes("typescript")) {
    return "js";
  }

  // Python
  if (languages.includes("python")) {
    return "python";
  }

  // Go
  if (languages.includes("go")) {
    return "go";
  }

  // Rust
  if (languages.includes("rust")) {
    return "rust";
  }

  // Default to fullstack
  return "fullstack";
}

/**
 * Calculate detection confidence
 */
function calculateConfidence(features: DetectedFeatures): number {
  let confidence = 0.5; // Base confidence

  // Increase confidence for each detected feature
  if (features.languages.length > 0) confidence += 0.2;
  if (features.frameworks.length > 0) confidence += 0.15;
  if (features.packageManagers.length > 0) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

/**
 * Try to read and parse package.json for more info
 */
async function parsePackageJson(
  repoPath: string
): Promise<{
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} | null> {
  try {
    const content = await readFile(`${repoPath}/package.json`, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Try to read and parse pyproject.toml for Python projects
 */
async function parsePyProjectToml(
  repoPath: string
): Promise<{ name?: string; description?: string } | null> {
  try {
    const TOML = await import("@iarna/toml");
    const content = await readFile(`${repoPath}/pyproject.toml`, "utf-8");
    const parsed = TOML.parse(content) as Record<string, unknown>;
    const project = parsed.project as Record<string, unknown> | undefined;
    return {
      name: project?.name as string | undefined,
      description: project?.description as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Detect lifecycle commands based on package.json scripts
 */
function detectLifecycleFromPackageJson(
  scripts: Record<string, string>
): Partial<LifecycleConfig> {
  const lifecycle: Partial<LifecycleConfig> = {};

  // Map common script names to lifecycle commands
  const scriptMappings: [string[], keyof LifecycleConfig][] = [
    [["dev", "start:dev", "develop"], "dev"],
    [["build", "compile"], "build"],
    [["test", "test:unit"], "test"],
    [["lint", "eslint"], "lint"],
    [["format", "prettier"], "format"],
    [["setup", "postinstall"], "setup"],
  ];

  for (const [scriptNames, lifecycleKey] of scriptMappings) {
    for (const scriptName of scriptNames) {
      if (scripts[scriptName]) {
        lifecycle[lifecycleKey] = `npm run ${scriptName}`;
        break;
      }
    }
  }

  return lifecycle;
}

/**
 * Detect databases from docker-compose file
 */
async function detectDatabasesFromCompose(
  repoPath: string
): Promise<Partial<ServicesConfig>> {
  const services: Partial<ServicesConfig> = {};
  const composeFiles = ["docker-compose.yml", "docker-compose.yaml", "compose.yml"];

  for (const file of composeFiles) {
    const filePath = `${repoPath}/${file}`;
    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, "utf-8");
        const contentLower = content.toLowerCase();

        if (contentLower.includes("postgres")) services.postgres = true;
        if (contentLower.includes("mysql") || contentLower.includes("mariadb"))
          services.mysql = true;
        if (contentLower.includes("redis")) services.redis = true;
        if (contentLower.includes("mongo")) services.mongodb = true;

        break;
      } catch {
        // Continue to next file
      }
    }
  }

  return services;
}

/**
 * Detect common ports based on framework
 */
function detectPorts(features: DetectedFeatures): PortsConfig {
  const ports: PortsConfig = {};

  // Helper to create port config
  const makePort = (port: number, label: string) => ({
    port,
    label,
    public: true,
    protocol: "http" as const,
  });

  // Add common development ports based on framework
  if (features.frameworks.includes("nextjs")) {
    ports["3000"] = makePort(3000, "Next.js Dev Server");
  } else if (features.frameworks.includes("vite")) {
    ports["5173"] = makePort(5173, "Vite Dev Server");
  } else if (features.frameworks.includes("svelte")) {
    ports["5173"] = makePort(5173, "SvelteKit Dev Server");
  } else if (features.frameworks.includes("nuxt")) {
    ports["3000"] = makePort(3000, "Nuxt Dev Server");
  } else if (features.frameworks.includes("django")) {
    ports["8000"] = makePort(8000, "Django Dev Server");
  } else if (features.frameworks.includes("flask")) {
    ports["5000"] = makePort(5000, "Flask Dev Server");
  } else if (features.frameworks.includes("rails")) {
    ports["3000"] = makePort(3000, "Rails Dev Server");
  } else if (features.languages.includes("go")) {
    ports["8080"] = makePort(8080, "Go Server");
  } else if (features.languages.includes("javascript")) {
    // Generic Node.js
    ports["3000"] = makePort(3000, "Node.js Server");
  }

  return ports;
}

// =============================================================================
// Main Detection Function
// =============================================================================

/**
 * Auto-detect project type and generate configuration
 *
 * @param repoPath - Path to the repository root
 * @returns Detection result with partial configuration
 */
export async function detectProjectType(
  repoPath: string
): Promise<AutoDetectResult> {
  const messages: string[] = [];
  const features: DetectedFeatures = {
    languages: [],
    frameworks: [],
    packageManagers: [],
    databases: [],
    isMonorepo: false,
    hasDocker: false,
  };

  // Run all detection rules
  for (const rule of DETECTION_RULES) {
    if (hasAnyFile(repoPath, rule.files)) {
      switch (rule.type) {
        case "language":
          if (!features.languages.includes(rule.indicator)) {
            features.languages.push(rule.indicator);
            messages.push(`Detected language: ${rule.indicator}`);
          }
          break;
        case "framework":
          if (!features.frameworks.includes(rule.indicator)) {
            features.frameworks.push(rule.indicator);
            messages.push(`Detected framework: ${rule.indicator}`);
          }
          break;
        case "packageManager":
          if (!features.packageManagers.includes(rule.indicator)) {
            features.packageManagers.push(rule.indicator);
            messages.push(`Detected package manager: ${rule.indicator}`);
          }
          break;
        case "database":
          if (!features.databases.includes(rule.indicator)) {
            features.databases.push(rule.indicator);
          }
          break;
        case "tool":
          if (["turborepo", "lerna", "nx"].includes(rule.indicator)) {
            features.isMonorepo = true;
            messages.push(`Detected monorepo tool: ${rule.indicator}`);
          }
          if (rule.indicator === "docker") {
            features.hasDocker = true;
            messages.push("Detected Docker support");
          }
          break;
      }

      // Run additional action if defined
      if (rule.action) {
        await rule.action(repoPath, features);
      }
    }
  }

  // Determine flavor
  const flavor = determineFlavor(features);
  messages.push(`Selected flavor: ${flavor}`);

  // Build partial config
  const config: Partial<AgentPodConfig> = {
    environment: {
      base: flavor,
    } as EnvironmentConfig,
  };

  // Try to get project name and description
  if (existsSync(`${repoPath}/package.json`)) {
    const pkg = await parsePackageJson(repoPath);
    if (pkg) {
      config.project = {
        name: pkg.name ?? "untitled",
        description: pkg.description,
      };

      // Detect lifecycle commands from scripts
      if (pkg.scripts) {
        config.lifecycle = detectLifecycleFromPackageJson(pkg.scripts);
      }
    }
  } else if (existsSync(`${repoPath}/pyproject.toml`)) {
    const pyproject = await parsePyProjectToml(repoPath);
    if (pyproject) {
      config.project = {
        name: pyproject.name ?? "untitled",
        description: pyproject.description,
      };
    }
  }

  // Set default project name if not found
  if (!config.project) {
    const dirName = repoPath.split("/").pop() ?? "untitled";
    config.project = { name: dirName };
  }

  // Detect databases from docker-compose
  if (features.hasDocker) {
    const services = await detectDatabasesFromCompose(repoPath);
    if (Object.keys(services).length > 0) {
      config.services = services;
    }
  }

  // Detect ports
  const ports = detectPorts(features);
  if (Object.keys(ports).length > 0) {
    config.ports = ports;
  }

  // Calculate confidence
  const confidence = calculateConfidence(features);

  return {
    flavor,
    confidence,
    features,
    config,
    messages,
  };
}

/**
 * Generate a sample agentpod.toml based on detection
 *
 * @param result - Auto-detection result
 * @returns TOML string for agentpod.toml
 */
export function generateSampleConfig(result: AutoDetectResult): string {
  const lines: string[] = [
    "# AgentPod Configuration",
    "# Auto-generated based on project detection",
    "",
    "[project]",
    `name = "${result.config.project?.name ?? "my-project"}"`,
  ];

  if (result.config.project?.description) {
    lines.push(`description = "${result.config.project.description}"`);
  }

  lines.push("", "[environment]", `base = "${result.flavor}"`);

  if (result.config.lifecycle) {
    lines.push("", "[lifecycle]");
    for (const [key, value] of Object.entries(result.config.lifecycle)) {
      if (value) {
        lines.push(`${key} = "${value}"`);
      }
    }
  }

  if (result.config.services && Object.keys(result.config.services).length > 0) {
    lines.push("", "[services]");
    for (const [key, value] of Object.entries(result.config.services)) {
      if (value === true) {
        lines.push(`${key} = true`);
      }
    }
  }

  if (result.config.ports && Object.keys(result.config.ports).length > 0) {
    lines.push("", "[ports]");
    for (const [port, config] of Object.entries(result.config.ports)) {
      if (typeof config === "number") {
        lines.push(`${port} = ${config}`);
      } else if (typeof config === "object" && config !== null) {
        const label = config.label ?? `Port ${port}`;
        lines.push(`${port} = { label = "${label}", public = ${config.public ?? false} }`);
      }
    }
  }

  lines.push("");

  return lines.join("\n");
}
