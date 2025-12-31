import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { httpRequestExecutor } from "./http";
import type { NodeExecutionParams, ExecutionContext } from "../utils/context";

function createMockContext(): ExecutionContext {
  return {
    trigger: {
      type: "manual",
      data: {},
      timestamp: new Date(),
    },
    steps: {},
    env: {} as ExecutionContext["env"],
  };
}

function createMockParams(
  parameters: Record<string, unknown>,
  context: ExecutionContext
): NodeExecutionParams {
  return {
    nodeId: "test-http",
    nodeName: "Test HTTP",
    nodeType: "http-request",
    parameters,
    context,
  };
}

describe("httpRequestExecutor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should have correct type and category", () => {
    expect(httpRequestExecutor.type).toBe("http-request");
    expect(httpRequestExecutor.category).toBe("action");
  });

  describe("validation", () => {
    it("should require URL", () => {
      const errors = httpRequestExecutor.validate!({});
      expect(errors).toContain("URL is required");
    });

    it("should reject non-string URL", () => {
      const errors = httpRequestExecutor.validate!({ url: 123 });
      expect(errors).toContain("URL is required");
    });

    it("should pass with valid URL", () => {
      const errors = httpRequestExecutor.validate!({ url: "https://example.com" });
      expect(errors).toHaveLength(0);
    });
  });

  describe("request methods", () => {
    it("should default to GET method", async () => {
      const mockResponse = new Response(JSON.stringify({ data: "test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams({ url: "https://api.example.com/data" }, context);

      await httpRequestExecutor.execute(params);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({ method: "GET" })
      );
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"] as const)("should use %s method", async (method) => {
      const mockResponse = new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams({ url: "https://api.example.com", method }, context);

      await httpRequestExecutor.execute(params);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({ method })
      );
    });
  });

  describe("authentication", () => {
    it("should add Bearer token header", async () => {
      const mockResponse = new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams(
        {
          url: "https://api.example.com",
          authentication: { type: "bearer", token: "my-secret-token" },
        },
        context
      );

      await httpRequestExecutor.execute(params);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-secret-token",
          }),
        })
      );
    });

    it("should add Basic auth header", async () => {
      const mockResponse = new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams(
        {
          url: "https://api.example.com",
          authentication: { type: "basic", username: "user", password: "pass" },
        },
        context
      );

      await httpRequestExecutor.execute(params);

      const expectedAuth = "Basic " + btoa("user:pass");
      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expectedAuth,
          }),
        })
      );
    });

    it("should add API key header", async () => {
      const mockResponse = new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams(
        {
          url: "https://api.example.com",
          authentication: { type: "api-key", headerName: "X-API-Key", headerValue: "secret123" },
        },
        context
      );

      await httpRequestExecutor.execute(params);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-API-Key": "secret123",
          }),
        })
      );
    });
  });

  describe("request body", () => {
    it("should send JSON body with Content-Type header", async () => {
      const mockResponse = new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const body = { name: "test", value: 123 };
      const params = createMockParams(
        { url: "https://api.example.com", method: "POST", body },
        context
      );

      await httpRequestExecutor.execute(params);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should not override existing Content-Type header", async () => {
      const mockResponse = new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams(
        {
          url: "https://api.example.com",
          method: "POST",
          body: { data: "test" },
          headers: { "Content-Type": "application/xml" },
        },
        context
      );

      await httpRequestExecutor.execute(params);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/xml",
          }),
        })
      );
    });
  });

  describe("response handling", () => {
    it("should parse JSON response", async () => {
      const responseData = { users: [{ id: 1, name: "Test" }] };
      const mockResponse = new Response(JSON.stringify(responseData), {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams({ url: "https://api.example.com/users" }, context);

      const result = await httpRequestExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        status: 200,
        statusText: "OK",
        ok: true,
        data: responseData,
      });
    });

    it("should handle text response", async () => {
      const mockResponse = new Response("Hello World", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams(
        { url: "https://example.com", responseType: "text" },
        context
      );

      const result = await httpRequestExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        status: 200,
        data: "Hello World",
      });
    });

    it("should return response headers", async () => {
      const mockResponse = new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "abc123",
          "x-rate-limit": "100",
        },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams({ url: "https://api.example.com" }, context);

      const result = await httpRequestExecutor.execute(params);

      expect(result.success).toBe(true);
      const data = result.data as { headers: Record<string, string> };
      expect(data.headers).toMatchObject({
        "content-type": "application/json",
        "x-request-id": "abc123",
        "x-rate-limit": "100",
      });
    });

    it("should handle non-2xx responses", async () => {
      const mockResponse = new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams({ url: "https://api.example.com/missing" }, context);

      const result = await httpRequestExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        status: 404,
        ok: false,
        data: { error: "Not Found" },
      });
    });

    it("should handle invalid JSON as text", async () => {
      const mockResponse = new Response("Not valid JSON", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams({ url: "https://api.example.com" }, context);

      const result = await httpRequestExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        data: "Not valid JSON",
      });
    });
  });

  describe("error handling", () => {
    it("should return error when URL is missing", async () => {
      const context = createMockContext();
      const params = createMockParams({}, context);

      const result = await httpRequestExecutor.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("URL is required");
    });

    it("should return error on network failure", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      const context = createMockContext();
      const params = createMockParams({ url: "https://api.example.com" }, context);

      const result = await httpRequestExecutor.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("should handle timeout", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      vi.mocked(fetch).mockRejectedValue(abortError);

      const context = createMockContext();
      const params = createMockParams(
        { url: "https://api.example.com", timeout: 1000 },
        context
      );

      const result = await httpRequestExecutor.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
    });
  });

  describe("custom headers", () => {
    it("should send custom headers", async () => {
      const mockResponse = new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const context = createMockContext();
      const params = createMockParams(
        {
          url: "https://api.example.com",
          headers: {
            "X-Custom-Header": "custom-value",
            Accept: "application/json",
          },
        },
        context
      );

      await httpRequestExecutor.execute(params);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Custom-Header": "custom-value",
            Accept: "application/json",
          }),
        })
      );
    });
  });
});
