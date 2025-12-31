import { describe, it, expect, vi } from "vitest";
import { d1QueryExecutor, r2StorageExecutor } from "./cloudflare";
import type { NodeExecutionParams } from "../utils/context";

function createD1Params(
  parameters: Record<string, unknown>,
  mockDb?: unknown
): NodeExecutionParams {
  return {
    nodeId: "d1-1",
    nodeName: "D1 Query",
    nodeType: "d1-query",
    parameters,
    context: {
      trigger: { type: "manual", data: {}, timestamp: new Date() },
      steps: {},
      env: {
        DB: mockDb,
      } as NodeExecutionParams["context"]["env"],
    },
  };
}

function createR2Params(
  parameters: Record<string, unknown>,
  mockBucket?: unknown
): NodeExecutionParams {
  return {
    nodeId: "r2-1",
    nodeName: "R2 Storage",
    nodeType: "r2-storage",
    parameters,
    context: {
      trigger: { type: "manual", data: {}, timestamp: new Date() },
      steps: {},
      env: {
        WORKSPACE_BUCKET: mockBucket,
      } as NodeExecutionParams["context"]["env"],
    },
  };
}

describe("d1QueryExecutor", () => {
  describe("validation", () => {
    it("requires SQL query", () => {
      const errors = d1QueryExecutor.validate!({});
      expect(errors).toContain("SQL query is required");
    });

    it("passes with valid query", () => {
      const errors = d1QueryExecutor.validate!({ query: "SELECT * FROM users" });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    it("returns error for missing query", async () => {
      const result = await d1QueryExecutor.execute(createD1Params({}));
      expect(result.success).toBe(false);
      expect(result.error).toContain("SQL query is required");
    });

    it("returns error when D1 binding is not configured", async () => {
      const result = await d1QueryExecutor.execute(createD1Params(
        { query: "SELECT 1" },
        undefined
      ));
      expect(result.success).toBe(false);
      expect(result.error).toContain("D1 database binding not configured");
    });

    it("executes query with all operation", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
          meta: { duration: 5 },
        }),
      };
      const mockDb = {
        prepare: vi.fn().mockReturnValue(mockStmt),
      };

      const result = await d1QueryExecutor.execute(createD1Params(
        { query: "SELECT * FROM users", operation: "all" },
        mockDb
      ));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.results).toEqual([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
      expect(data.operation).toBe("all");
    });

    it("executes query with first operation", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 1, name: "Alice" }),
      };
      const mockDb = {
        prepare: vi.fn().mockReturnValue(mockStmt),
      };

      const result = await d1QueryExecutor.execute(createD1Params(
        { query: "SELECT * FROM users WHERE id = ?", params: [1], operation: "first" },
        mockDb
      ));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.results).toEqual({ id: 1, name: "Alice" });
      expect(mockStmt.bind).toHaveBeenCalledWith(1);
    });

    it("executes query with run operation", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({
          success: true,
          meta: { changes: 1, last_row_id: 5 },
        }),
      };
      const mockDb = {
        prepare: vi.fn().mockReturnValue(mockStmt),
      };

      const result = await d1QueryExecutor.execute(createD1Params(
        { query: "INSERT INTO users (name) VALUES (?)", params: ["Charlie"], operation: "run" },
        mockDb
      ));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const results = data.results as Record<string, unknown>;
      expect(results.success).toBe(true);
      expect(results.changes).toBe(1);
      expect(results.lastRowId).toBe(5);
    });

    it("handles database errors", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockRejectedValue(new Error("Table not found")),
      };
      const mockDb = {
        prepare: vi.fn().mockReturnValue(mockStmt),
      };

      const result = await d1QueryExecutor.execute(createD1Params(
        { query: "SELECT * FROM nonexistent" },
        mockDb
      ));

      expect(result.success).toBe(false);
      expect(result.error).toContain("D1 query error");
      expect(result.error).toContain("Table not found");
    });
  });
});

describe("r2StorageExecutor", () => {
  describe("validation", () => {
    it("requires operation", () => {
      const errors = r2StorageExecutor.validate!({});
      expect(errors).toContain("Operation is required");
    });

    it("requires key for get/put/delete/head operations", () => {
      const errors = r2StorageExecutor.validate!({ operation: "get" });
      expect(errors).toContain("Key is required for get/put/delete/head operations");
    });

    it("requires content for put operation", () => {
      const errors = r2StorageExecutor.validate!({ operation: "put", key: "test.txt" });
      expect(errors).toContain("Content is required for put operation");
    });

    it("passes for list operation without key", () => {
      const errors = r2StorageExecutor.validate!({ operation: "list" });
      expect(errors).toHaveLength(0);
    });

    it("passes for put operation with key and content", () => {
      const errors = r2StorageExecutor.validate!({
        operation: "put",
        key: "test.txt",
        content: "Hello",
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    it("returns error for missing operation", async () => {
      const result = await r2StorageExecutor.execute(createR2Params({}));
      expect(result.success).toBe(false);
      expect(result.error).toContain("Operation is required");
    });

    it("returns error when R2 bucket is not configured", async () => {
      const result = await r2StorageExecutor.execute(createR2Params(
        { operation: "get", key: "test.txt" },
        undefined
      ));
      expect(result.success).toBe(false);
      expect(result.error).toContain("R2 bucket binding not configured");
    });

    describe("get operation", () => {
      it("gets object successfully", async () => {
        const mockObject = {
          text: vi.fn().mockResolvedValue("Hello, World!"),
          size: 13,
          etag: "abc123",
          httpMetadata: { contentType: "text/plain" },
          uploaded: new Date(),
        };
        const mockBucket = {
          get: vi.fn().mockResolvedValue(mockObject),
        };

        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "get", key: "hello.txt" },
          mockBucket
        ));

        expect(result.success).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.found).toBe(true);
        expect(data.content).toBe("Hello, World!");
        expect(data.size).toBe(13);
      });

      it("returns not found for missing object", async () => {
        const mockBucket = {
          get: vi.fn().mockResolvedValue(null),
        };

        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "get", key: "missing.txt" },
          mockBucket
        ));

        expect(result.success).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.found).toBe(false);
      });

      it("returns error for missing key", async () => {
        const mockBucket = {};
        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "get" },
          mockBucket
        ));

        expect(result.success).toBe(false);
        expect(result.error).toContain("Key is required");
      });
    });

    describe("put operation", () => {
      it("uploads object successfully", async () => {
        const mockBucket = {
          put: vi.fn().mockResolvedValue({
            size: 12,
            etag: "def456",
            version: "v1",
          }),
        };

        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "put", key: "test.txt", content: "Hello World!", contentType: "text/plain" },
          mockBucket
        ));

        expect(result.success).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.uploaded).toBe(true);
        expect(data.key).toBe("test.txt");
        expect(mockBucket.put).toHaveBeenCalledWith(
          "test.txt",
          "Hello World!",
          expect.objectContaining({
            httpMetadata: { contentType: "text/plain" },
          })
        );
      });

      it("returns error for missing content", async () => {
        const mockBucket = {};
        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "put", key: "test.txt" },
          mockBucket
        ));

        expect(result.success).toBe(false);
        expect(result.error).toContain("Content is required");
      });
    });

    describe("delete operation", () => {
      it("deletes object successfully", async () => {
        const mockBucket = {
          delete: vi.fn().mockResolvedValue(undefined),
        };

        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "delete", key: "old.txt" },
          mockBucket
        ));

        expect(result.success).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.deleted).toBe(true);
        expect(data.key).toBe("old.txt");
      });
    });

    describe("head operation", () => {
      it("gets object metadata", async () => {
        const mockObject = {
          size: 1024,
          etag: "xyz789",
          httpMetadata: { contentType: "application/json" },
          uploaded: new Date("2025-01-01"),
        };
        const mockBucket = {
          head: vi.fn().mockResolvedValue(mockObject),
        };

        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "head", key: "data.json" },
          mockBucket
        ));

        expect(result.success).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.found).toBe(true);
        expect(data.size).toBe(1024);
        expect(data.contentType).toBe("application/json");
      });

      it("returns not found for missing object", async () => {
        const mockBucket = {
          head: vi.fn().mockResolvedValue(null),
        };

        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "head", key: "missing.txt" },
          mockBucket
        ));

        expect(result.success).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.found).toBe(false);
      });
    });

    describe("list operation", () => {
      it("lists objects with prefix", async () => {
        const mockBucket = {
          list: vi.fn().mockResolvedValue({
            objects: [
              { key: "docs/a.txt", size: 100, etag: "a1", uploaded: new Date() },
              { key: "docs/b.txt", size: 200, etag: "b2", uploaded: new Date() },
            ],
            truncated: false,
          }),
        };

        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "list", prefix: "docs/", limit: 10 },
          mockBucket
        ));

        expect(result.success).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.count).toBe(2);
        expect(data.truncated).toBe(false);
        expect((data.objects as unknown[]).length).toBe(2);
      });

      it("handles truncated results", async () => {
        const mockBucket = {
          list: vi.fn().mockResolvedValue({
            objects: Array(100).fill({ key: "file.txt", size: 50, etag: "x", uploaded: new Date() }),
            truncated: true,
            cursor: "next_cursor",
          }),
        };

        const result = await r2StorageExecutor.execute(createR2Params(
          { operation: "list", limit: 100 },
          mockBucket
        ));

        expect(result.success).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.truncated).toBe(true);
        expect(data.cursor).toBe("next_cursor");
      });
    });

    it("handles R2 errors", async () => {
      const mockBucket = {
        get: vi.fn().mockRejectedValue(new Error("Bucket access denied")),
      };

      const result = await r2StorageExecutor.execute(createR2Params(
        { operation: "get", key: "test.txt" },
        mockBucket
      ));

      expect(result.success).toBe(false);
      expect(result.error).toContain("R2 storage error");
      expect(result.error).toContain("Bucket access denied");
    });

    it("returns error for unknown operation", async () => {
      const mockBucket = {};
      const result = await r2StorageExecutor.execute(createR2Params(
        { operation: "unknown" },
        mockBucket
      ));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown operation");
    });
  });
});
