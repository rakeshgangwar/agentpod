/**
 * Onboarding Agent Service
 *
 * Orchestrates the configuration generation for onboarding:
 * - Generates opencode.json configuration
 * - Generates AGENTS.md content
 * - Generates custom agent files
 * - Generates custom command files
 * - Queries knowledge base for templates
 */

import { knowledgeService } from "./knowledge-service";
import { createLogger } from "../utils/logger";
import type {
  ConfigGenerationInput,
  ConfigGenerationOutput,
  OpenCodeJsonConfig,
  GeneratedAgentFile,
  GeneratedCommandFile,
  OnboardingEnvVars,
  OnboardingInjectedFiles,
  ParsedAgentTemplate,
  AgentFrontmatter,
  KnowledgeDocument,
  OnboardingRequirements,
  PermissionValue,
} from "@agentpod/types";

const log = createLogger("onboarding-agent-service");

// =============================================================================
// Constants
// =============================================================================

const OPENCODE_SCHEMA_URL = "https://opencode.ai/config.json";
const MANAGEMENT_API_URL = process.env.MANAGEMENT_API_URL || "https://api.agentpod.io";

/**
 * Default project types with descriptions
 */
const DEFAULT_PROJECT_TYPES = [
  { name: "web_app", description: "Web application (React, Vue, Angular, etc.)" },
  { name: "api_service", description: "REST or GraphQL API service" },
  { name: "cli_tool", description: "Command-line interface tool" },
  { name: "library", description: "Reusable library or package" },
  { name: "mobile_app", description: "Mobile application (React Native, Flutter, etc.)" },
  { name: "desktop_app", description: "Desktop application (Electron, Tauri, etc.)" },
  { name: "data_science", description: "Data science or machine learning project" },
  { name: "devops", description: "Infrastructure and DevOps tooling" },
  { name: "monorepo", description: "Monorepo with multiple packages" },
  { name: "other", description: "Other project type" },
];

// =============================================================================
// Onboarding Agent Service Class
// =============================================================================

export class OnboardingAgentService {
  // ===========================================================================
  // Main Configuration Generation
  // ===========================================================================

  /**
   * Generate complete configuration for onboarding.
   */
  async generateConfig(input: ConfigGenerationInput): Promise<ConfigGenerationOutput> {
    log.info("Generating configuration", {
      userId: input.userId,
      sandboxId: input.sandboxId,
      projectType: input.requirements.projectType,
    });

    const opencodeJson = await this.generateOpencodeJson(input);
    const agentsMdContent = await this.generateAgentsMd(input);
    const customAgents = await this.generateCustomAgents(input);
    const customCommands = await this.generateCustomCommands(input);

    log.info("Configuration generated successfully", {
      agentsCount: customAgents.length,
      commandsCount: customCommands.length,
    });

    return {
      opencodeJson,
      agentsMdContent,
      customAgents,
      customCommands,
    };
  }

  // ===========================================================================
  // opencode.json Generation
  // ===========================================================================

  /**
   * Generate opencode.json configuration.
   */
  async generateOpencodeJson(input: ConfigGenerationInput): Promise<OpenCodeJsonConfig> {
    const { requirements, recommendation } = input;

    // Determine model - prefer user's choice over recommendation
    const model = requirements.preferredModel || 
      (recommendation.primaryProvider && recommendation.primaryModelId 
        ? `${recommendation.primaryProvider}/${recommendation.primaryModelId}` 
        : recommendation.primaryModelId) ||
      "anthropic/claude-sonnet-4-20250514";

    // Determine small model
    const smallModel = requirements.preferredSmallModel ||
      (recommendation.smallProvider && recommendation.smallModelId
        ? `${recommendation.smallProvider}/${recommendation.smallModelId}`
        : recommendation.smallModelId);

    const config: OpenCodeJsonConfig = {
      $schema: OPENCODE_SCHEMA_URL,
      model,
      default_agent: "commander-ada",
      share: "manual",
      autoupdate: true,
      mcp: {
        agentpod_knowledge: {
          type: "remote",
          url: `${MANAGEMENT_API_URL}/api/mcp/knowledge`,
          headers: {
            Authorization: "Bearer {env:AGENTPOD_API_TOKEN}",
          },
        },
      },
      permission: this.generatePermissions(requirements),
      instructions: ["AGENTS.md"],
    };

    // Add small model if available
    if (smallModel) {
      config.small_model = smallModel;
    }

    // Add formatter if specified
    if (requirements.formatter) {
      config.formatter = this.generateFormatterConfig(requirements.formatter);
    }

    return config;
  }

  /**
   * Generate permission configuration based on requirements.
   */
  private generatePermissions(_requirements: OnboardingRequirements): OpenCodeJsonConfig["permission"] {
    return {
      edit: "allow" as PermissionValue,
      bash: {
        "npm *": "allow" as PermissionValue,
        "pnpm *": "allow" as PermissionValue,
        "yarn *": "allow" as PermissionValue,
        "bun *": "allow" as PermissionValue,
        "git *": "allow" as PermissionValue,
        "make *": "allow" as PermissionValue,
        "rm -rf *": "deny" as PermissionValue,
        "sudo *": "deny" as PermissionValue,
        "*": "ask" as PermissionValue,
      },
      webfetch: "allow" as PermissionValue,
      doom_loop: "ask" as PermissionValue,
      external_directory: "ask" as PermissionValue,
    };
  }

  /**
   * Generate formatter configuration.
   */
  private generateFormatterConfig(formatter: string): Record<string, {
    command: string[];
    extensions: string[];
  }> {
    const formatters: Record<string, { command: string[]; extensions: string[] }> = {
      prettier: {
        command: ["npx", "prettier", "--write", "$FILE"],
        extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss"],
      },
      black: {
        command: ["black", "$FILE"],
        extensions: [".py"],
      },
      rustfmt: {
        command: ["rustfmt", "$FILE"],
        extensions: [".rs"],
      },
      gofmt: {
        command: ["gofmt", "-w", "$FILE"],
        extensions: [".go"],
      },
    };

    const formatterConfig = formatters[formatter.toLowerCase()];
    if (formatterConfig) {
      return { [formatter.toLowerCase()]: formatterConfig };
    }

    // Default to prettier for unknown formatters
    return {
      prettier: {
        command: ["npx", "prettier", "--write", "$FILE"],
        extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss"],
      },
    };
  }

  // ===========================================================================
  // AGENTS.md Generation
  // ===========================================================================

  /**
   * Generate AGENTS.md content based on project requirements.
   */
  async generateAgentsMd(input: ConfigGenerationInput): Promise<string> {
    const { requirements } = input;

    const sections: string[] = [];

    // Header
    sections.push(`# ${requirements.projectName || "Project"} - AI Assistant Instructions`);
    sections.push("");

    // Project Overview
    sections.push("## Project Overview");
    sections.push("");
    if (requirements.projectDescription) {
      sections.push(requirements.projectDescription);
      sections.push("");
    }

    // Technology Stack
    sections.push("## Technology Stack");
    sections.push("");
    
    if (requirements.primaryLanguage) {
      sections.push(`- **Primary Language:** ${requirements.primaryLanguage}`);
    }
    
    if (requirements.frameworks && requirements.frameworks.length > 0) {
      sections.push(`- **Frameworks:** ${requirements.frameworks.join(", ")}`);
    }
    
    if (requirements.buildTools && requirements.buildTools.length > 0) {
      sections.push(`- **Build Tools:** ${requirements.buildTools.join(", ")}`);
    }
    
    if (requirements.testingFramework) {
      sections.push(`- **Testing:** ${requirements.testingFramework}`);
    }
    
    if (requirements.linter) {
      sections.push(`- **Linter:** ${requirements.linter}`);
    }
    
    if (requirements.formatter) {
      sections.push(`- **Formatter:** ${requirements.formatter}`);
    }
    sections.push("");

    // Coding Guidelines
    sections.push("## Coding Guidelines");
    sections.push("");
    
    if (requirements.codingStyle) {
      sections.push(requirements.codingStyle);
      sections.push("");
    } else {
      sections.push("- Write clean, readable, and well-documented code");
      sections.push("- Follow the project's existing code style and conventions");
      sections.push("- Include appropriate error handling");
      sections.push("- Write tests for new functionality");
      sections.push("");
    }

    // Custom Instructions
    if (requirements.customInstructions) {
      sections.push("## Project-Specific Instructions");
      sections.push("");
      sections.push(requirements.customInstructions);
      sections.push("");
    }

    // Best Practices
    sections.push("## Best Practices");
    sections.push("");
    sections.push("1. Always read existing code before making changes to understand the context");
    sections.push("2. Run tests after making changes to ensure nothing is broken");
    sections.push("3. Keep commits focused and atomic");
    sections.push("4. Document complex logic with comments");
    sections.push("5. Follow the principle of least surprise in your implementations");
    sections.push("");

    return sections.join("\n");
  }

  // ===========================================================================
  // Custom Agent Generation
  // ===========================================================================

  /**
   * Generate custom agent files based on project requirements.
   * Note: manage and onboarding agents are now GLOBAL (in ~/.config/opencode/agent/)
   * and are set up by the container entrypoint, not generated per-project.
   */
  async generateCustomAgents(input: ConfigGenerationInput): Promise<GeneratedAgentFile[]> {
    const agents: GeneratedAgentFile[] = [];

    // Generate reviewer agent for projects with testing
    if (input.requirements.testingFramework) {
      agents.push({
        filename: "reviewer.md",
        content: this.generateReviewerAgentContent(input),
      });
    }

    return agents;
  }

  // Note: generateWorkspaceAgentContent removed - manage agent is now GLOBAL
  // and defined in docker/base/scripts/agents/manage.md

  /**
   * Generate code reviewer agent content.
   */
  private generateReviewerAgentContent(input: ConfigGenerationInput): string {
    return this.generateAgentMarkdown({
      description: "Reviews code for quality, best practices, and potential issues",
      mode: "subagent",
      model: "anthropic/claude-sonnet-4-20250514",
      tools: {
        read: true,
        glob: true,
        grep: true,
        write: false,
        edit: false,
        bash: false,
      },
      permission: {
        edit: "deny",
        bash: "deny",
      },
      content: `You are a code reviewer for ${input.requirements.projectName || "this project"}.

## Review Focus Areas

1. **Code Quality**
   - Clean code principles
   - Readability and maintainability
   - Proper naming conventions
   - Code organization

2. **Best Practices**
   - ${input.requirements.primaryLanguage || "Language"}-specific idioms
   - Design patterns usage
   - Error handling
   - Input validation

3. **Security**
   - Common vulnerabilities
   - Input sanitization
   - Authentication/authorization issues
   - Sensitive data handling

4. **Performance**
   - Algorithm efficiency
   - Resource usage
   - Potential bottlenecks

## Output Format

Provide your review as:
- **Summary**: Brief overview of the code quality
- **Issues**: Categorized as Critical / Warning / Info
- **Recommendations**: Specific suggestions for improvement
- **Positive Aspects**: What's done well`,
    });
  }

  // ===========================================================================
  // Custom Command Generation
  // ===========================================================================

  /**
   * Generate custom command files based on project requirements.
   */
  async generateCustomCommands(input: ConfigGenerationInput): Promise<GeneratedCommandFile[]> {
    const commands: GeneratedCommandFile[] = [];

    // Generate test command if testing framework is specified
    if (input.requirements.testingFramework) {
      commands.push({
        filename: "test.md",
        content: this.generateTestCommandContent(input),
      });
    }

    return commands;
  }

  /**
   * Generate test command content.
   */
  private generateTestCommandContent(input: ConfigGenerationInput): string {
    const framework = input.requirements.testingFramework || "default";
    
    return this.generateCommandMarkdown({
      description: `Run the ${framework} test suite and analyze results`,
      subtask: false,
      content: `Run the test suite for this project using ${framework}.

$ARGUMENTS

After running tests:
1. Analyze any failures and their root causes
2. Suggest fixes for failing tests
3. Report test coverage if available
4. Highlight any tests that are slow or flaky`,
    });
  }

  // ===========================================================================
  // Knowledge Base Queries
  // ===========================================================================

  /**
   * Load project template from knowledge base.
   */
  async loadProjectTemplate(projectType: string): Promise<KnowledgeDocument | null> {
    const results = await knowledgeService.search({
      category: "project_template",
      query: projectType,
      limit: 1,
    });

    return results.length > 0 && results[0] ? results[0] : null;
  }

  /**
   * Load agent pattern from knowledge base.
   */
  async loadAgentPattern(role: string): Promise<KnowledgeDocument | null> {
    const results = await knowledgeService.search({
      category: "agent_pattern",
      query: role,
      limit: 1,
    });

    return results.length > 0 && results[0] ? results[0] : null;
  }

  /**
   * Load command template from knowledge base.
   */
  async loadCommandTemplate(name: string): Promise<KnowledgeDocument | null> {
    const results = await knowledgeService.search({
      category: "command_template",
      query: name,
      limit: 1,
    });

    return results.length > 0 && results[0] ? results[0] : null;
  }

  /**
   * List available project types.
   */
  async listProjectTypes(): Promise<Array<{ name: string; description: string }>> {
    // First try to get from knowledge base
    const templates = await knowledgeService.getByCategory("project_template");
    
    if (templates.length > 0) {
      return templates.map((t) => ({
        name: t.title.toLowerCase().replace(/\s+/g, "_"),
        description: t.description || t.title,
      }));
    }

    // Fall back to default list
    return DEFAULT_PROJECT_TYPES;
  }

  // ===========================================================================
  // Sandbox Integration
  // ===========================================================================

  /**
   * Generate environment variables for sandbox.
   */
  generateSandboxEnvVars(sessionId: string, apiToken: string): OnboardingEnvVars {
    return {
      ONBOARDING_MODE: "true",
      ONBOARDING_SESSION_ID: sessionId,
      AGENTPOD_API_TOKEN: apiToken,
      MANAGEMENT_API_URL,
    };
  }

  /**
   * Generate files to inject into sandbox.
   * Note: manage and onboarding agents are now GLOBAL and set up by the container entrypoint.
   * This function only returns project-specific files (opencode.json, AGENTS.md, custom agents).
   */
  async generateInjectedFiles(input: ConfigGenerationInput): Promise<OnboardingInjectedFiles> {
    const config = await this.generateConfig(input);

    // Custom agents go in project-level .opencode/agent/
    // Note: manage and onboarding are GLOBAL (set up by container), not included here
    const agents = config.customAgents.map((agent) => ({
      path: `.opencode/agent/${agent.filename}`,
      content: agent.content,
    }));

    return {
      opencodeJson: JSON.stringify(config.opencodeJson, null, 2),
      agentsMd: config.agentsMdContent,
      agents,
    };
  }

  // Note: generateOnboardingAgentContent removed - onboarding agent is now GLOBAL
  // and defined in docker/base/scripts/agents/onboarding.md

  // ===========================================================================
  // Markdown Parsing/Generation Helpers
  // ===========================================================================

  /**
   * Parse agent markdown file with frontmatter.
   */
  parseAgentMarkdown(markdown: string): ParsedAgentTemplate {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
    const match = markdown.match(frontmatterRegex);

    if (!match) {
      return {
        frontmatter: { description: "" },
        content: markdown,
      };
    }

    const [, frontmatterStr, content] = match;
    const frontmatter = this.parseFrontmatter(frontmatterStr || "");

    return {
      frontmatter,
      content: (content || "").trim(),
    };
  }

  /**
   * Parse YAML-like frontmatter string.
   */
  private parseFrontmatter(str: string): AgentFrontmatter {
    const lines = str.split("\n");
    const result: Record<string, unknown> = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      // Handle boolean values
      if (value === "true") value = true;
      else if (value === "false") value = false;
      // Handle numbers
      else if (!isNaN(Number(value)) && value !== "") value = Number(value);

      result[key] = value;
    }

    return {
      description: (result.description as string) || "",
      mode: result.mode as AgentFrontmatter["mode"],
      model: result.model as string | undefined,
      temperature: result.temperature as number | undefined,
      maxSteps: result.maxSteps as number | undefined,
      tools: result.tools as Record<string, boolean> | undefined,
      permission: result.permission as Record<string, PermissionValue> | undefined,
    };
  }

  /**
   * Generate agent markdown with frontmatter.
   */
  generateAgentMarkdown(options: {
    description: string;
    mode?: "primary" | "subagent" | "all";
    model?: string;
    temperature?: number;
    maxSteps?: number;
    tools?: Record<string, boolean>;
    permission?: Record<string, PermissionValue>;
    content: string;
  }): string {
    const lines: string[] = ["---"];

    lines.push(`description: ${options.description}`);

    if (options.mode) {
      lines.push(`mode: ${options.mode}`);
    }

    if (options.model) {
      lines.push(`model: ${options.model}`);
    }

    if (options.temperature !== undefined) {
      lines.push(`temperature: ${options.temperature}`);
    }

    if (options.maxSteps !== undefined) {
      lines.push(`maxSteps: ${options.maxSteps}`);
    }

    if (options.tools) {
      lines.push("tools:");
      for (const [key, value] of Object.entries(options.tools)) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    if (options.permission) {
      lines.push("permission:");
      for (const [key, value] of Object.entries(options.permission)) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    lines.push("---");
    lines.push("");
    lines.push(options.content);

    return lines.join("\n");
  }

  /**
   * Generate command markdown with frontmatter.
   */
  generateCommandMarkdown(options: {
    description: string;
    agent?: string;
    subtask?: boolean;
    model?: string;
    content: string;
  }): string {
    const lines: string[] = ["---"];

    lines.push(`description: ${options.description}`);

    if (options.agent) {
      lines.push(`agent: ${options.agent}`);
    }

    if (options.subtask !== undefined) {
      lines.push(`subtask: ${options.subtask}`);
    }

    if (options.model) {
      lines.push(`model: ${options.model}`);
    }

    lines.push("---");
    lines.push("");
    lines.push(options.content);

    return lines.join("\n");
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const onboardingAgentService = new OnboardingAgentService();
