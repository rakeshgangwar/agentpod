import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";

interface HttpRequestParams {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: unknown;
  authentication?: {
    type: "none" | "bearer" | "basic" | "api-key";
    token?: string;
    username?: string;
    password?: string;
    headerName?: string;
    headerValue?: string;
  };
  responseType?: "json" | "text" | "binary";
  timeout?: number;
}

export const httpRequestExecutor: NodeExecutor = {
  type: "http-request",
  category: "action",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    if (!params.url || typeof params.url !== "string") {
      errors.push("URL is required");
    }
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<HttpRequestParams>;
    const url = p.url;
    const method = p.method ?? "GET";
    const headers = p.headers ?? {};
    const body = p.body;
    const authentication = p.authentication;
    const responseType = p.responseType ?? "json";
    const timeout = p.timeout ?? 30000;
    
    if (!url) {
      return createErrorResult("URL is required");
    }
    
    const requestHeaders: Record<string, string> = { ...headers };
    
    if (authentication) {
      switch (authentication.type) {
        case "bearer":
          if (authentication.token) {
            requestHeaders["Authorization"] = `Bearer ${authentication.token}`;
          }
          break;
        case "basic":
          if (authentication.username && authentication.password) {
            const encoded = btoa(`${authentication.username}:${authentication.password}`);
            requestHeaders["Authorization"] = `Basic ${encoded}`;
          }
          break;
        case "api-key":
          if (authentication.headerName && authentication.headerValue) {
            requestHeaders[authentication.headerName] = authentication.headerValue;
          }
          break;
      }
    }
    
    if (body && !requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      let data: unknown;
      const contentType = response.headers.get("content-type") || "";
      
      if (responseType === "json" || contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = await response.text();
        }
      } else if (responseType === "binary") {
        const arrayBuffer = await response.arrayBuffer();
        data = {
          base64: btoa(String.fromCharCode(...new Uint8Array(arrayBuffer))),
          size: arrayBuffer.byteLength,
        };
      } else {
        data = await response.text();
      }
      
      return createStepResult({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data,
        ok: response.ok,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          return createErrorResult(`Request timeout after ${timeout}ms`);
        }
        return createErrorResult(error.message);
      }
      return createErrorResult("Unknown error occurred");
    }
  },
};
