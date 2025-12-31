import type { ToolDefinition, ToolResult } from "./types";

export const calculatorTool: ToolDefinition = {
  name: "calculator",
  description: "Perform mathematical calculations. Supports basic arithmetic, exponents, and common math functions.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Mathematical expression to evaluate (e.g., '2 + 2', '10 * 5', 'Math.sqrt(16)')",
      },
    },
    required: ["expression"],
  },
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const expression = params.expression as string;
    if (!expression) {
      return { success: false, error: "Expression is required" };
    }

    try {
      const sanitized = expression.replace(/[^0-9+\-*/().%\s^]/g, "");
      if (sanitized !== expression && !expression.startsWith("Math.")) {
        return { success: false, error: "Invalid characters in expression" };
      }

      const mathExpression = expression
        .replace(/\^/g, "**")
        .replace(/sqrt/g, "Math.sqrt")
        .replace(/pow/g, "Math.pow")
        .replace(/abs/g, "Math.abs")
        .replace(/round/g, "Math.round")
        .replace(/floor/g, "Math.floor")
        .replace(/ceil/g, "Math.ceil");

      const result = new Function(`return ${mathExpression}`)();
      
      if (typeof result !== "number" || !isFinite(result)) {
        return { success: false, error: "Invalid result" };
      }

      return { success: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Calculation error";
      return { success: false, error: message };
    }
  },
};

export const httpRequestTool: ToolDefinition = {
  name: "http_request",
  description: "Make HTTP requests to external APIs. Supports GET, POST, PUT, DELETE methods.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to request",
      },
      method: {
        type: "string",
        description: "HTTP method",
        enum: ["GET", "POST", "PUT", "DELETE"],
      },
      headers: {
        type: "object",
        description: "Request headers as key-value pairs",
      },
      body: {
        type: "string",
        description: "Request body (for POST/PUT)",
      },
    },
    required: ["url"],
  },
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string;
    const method = (params.method as string) || "GET";
    const headers = (params.headers as Record<string, string>) || {};
    const body = params.body as string | undefined;

    if (!url) {
      return { success: false, error: "URL is required" };
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? body : undefined,
      });

      const contentType = response.headers.get("content-type") || "";
      let data: unknown;

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        success: response.ok,
        result: {
          status: response.status,
          statusText: response.statusText,
          data,
        },
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      return { success: false, error: message };
    }
  },
};

export const codeExecutorTool: ToolDefinition = {
  name: "execute_code",
  description: "Execute JavaScript code and return the result. The code should return a value.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "JavaScript code to execute. Must return a value.",
      },
    },
    required: ["code"],
  },
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const code = params.code as string;
    if (!code) {
      return { success: false, error: "Code is required" };
    }

    try {
      const asyncFunction = new Function(`return (async () => { ${code} })();`);
      const result = await asyncFunction();
      return { success: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Code execution error";
      return { success: false, error: message };
    }
  },
};

export const currentTimeTool: ToolDefinition = {
  name: "current_time",
  description: "Get the current date and time in various formats.",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA timezone (e.g., 'America/New_York', 'UTC'). Defaults to UTC.",
      },
      format: {
        type: "string",
        description: "Output format: 'iso', 'unix', 'readable'",
        enum: ["iso", "unix", "readable"],
      },
    },
  },
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timezone = (params.timezone as string) || "UTC";
    const format = (params.format as string) || "iso";

    try {
      const now = new Date();

      let result: unknown;
      switch (format) {
        case "unix":
          result = Math.floor(now.getTime() / 1000);
          break;
        case "readable":
          result = now.toLocaleString("en-US", { timeZone: timezone });
          break;
        case "iso":
        default:
          result = now.toISOString();
          break;
      }

      return {
        success: true,
        result: {
          timestamp: result,
          timezone,
          format,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Time error";
      return { success: false, error: message };
    }
  },
};

export const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
  calculator: calculatorTool,
  http_request: httpRequestTool,
  execute_code: codeExecutorTool,
  current_time: currentTimeTool,
};

export function getBuiltinTool(name: string): ToolDefinition | undefined {
  return BUILTIN_TOOLS[name];
}

export function getAllBuiltinTools(): ToolDefinition[] {
  return Object.values(BUILTIN_TOOLS);
}
