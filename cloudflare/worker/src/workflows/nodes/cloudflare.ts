import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";

type D1Operation = "query" | "run" | "all" | "first";

interface D1QueryParams {
  operation?: D1Operation;
  query: string;
  params?: unknown[];
  database?: string;
}

type R2Operation = "get" | "put" | "delete" | "list" | "head";

interface R2StorageParams {
  operation: R2Operation;
  key?: string;
  content?: string;
  contentType?: string;
  prefix?: string;
  limit?: number;
  bucket?: string;
}

export const d1QueryExecutor: NodeExecutor = {
  type: "d1-query",
  category: "action",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.query || typeof params.query !== "string") {
      errors.push("SQL query is required");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<D1QueryParams>;
    const operation = p.operation ?? "all";
    
    if (!p.query) {
      return createErrorResult("SQL query is required");
    }
    
    const db = params.context.env.DB;
    if (!db) {
      return createErrorResult("D1 database binding not configured");
    }
    
    try {
      const stmt = db.prepare(p.query);
      const boundStmt = p.params && p.params.length > 0 ? stmt.bind(...p.params) : stmt;
      
      let result: unknown;
      let meta: unknown;
      
      switch (operation) {
        case "run": {
          const runResult = await boundStmt.run();
          result = {
            success: runResult.success,
            changes: runResult.meta.changes,
            lastRowId: runResult.meta.last_row_id,
          };
          meta = runResult.meta;
          break;
        }
        case "first": {
          result = await boundStmt.first();
          break;
        }
        case "all":
        default: {
          const allResult = await boundStmt.all();
          result = allResult.results;
          meta = allResult.meta;
          break;
        }
      }
      
      return createStepResult({
        results: result,
        meta,
        operation,
        query: p.query,
        paramCount: p.params?.length ?? 0,
      });
    } catch (error) {
      return createErrorResult(`D1 query error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};

export const r2StorageExecutor: NodeExecutor = {
  type: "r2-storage",
  category: "action",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    const operation = params.operation as R2Operation;
    if (!operation) {
      errors.push("Operation is required");
    }
    
    if (operation && ["get", "put", "delete", "head"].includes(operation)) {
      if (!params.key || typeof params.key !== "string") {
        errors.push("Key is required for get/put/delete/head operations");
      }
    }
    
    if (operation === "put" && !params.content) {
      errors.push("Content is required for put operation");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<R2StorageParams>;
    const operation = p.operation;
    
    if (!operation) {
      return createErrorResult("Operation is required");
    }
    
    const bucket = params.context.env.WORKSPACE_BUCKET;
    if (!bucket) {
      return createErrorResult("R2 bucket binding not configured");
    }
    
    try {
      switch (operation) {
        case "get": {
          if (!p.key) return createErrorResult("Key is required");
          
          const object = await bucket.get(p.key);
          if (!object) {
            return createStepResult({
              found: false,
              key: p.key,
            });
          }
          
          const content = await object.text();
          return createStepResult({
            found: true,
            key: p.key,
            content,
            size: object.size,
            etag: object.etag,
            contentType: object.httpMetadata?.contentType,
            uploaded: object.uploaded?.toISOString(),
          });
        }
        
        case "put": {
          if (!p.key) return createErrorResult("Key is required");
          if (!p.content) return createErrorResult("Content is required");
          
          const options: R2PutOptions = {};
          if (p.contentType) {
            options.httpMetadata = { contentType: p.contentType };
          }
          
          const result = await bucket.put(p.key, p.content, options);
          
          return createStepResult({
            uploaded: true,
            key: p.key,
            size: result?.size,
            etag: result?.etag,
            version: result?.version,
          });
        }
        
        case "delete": {
          if (!p.key) return createErrorResult("Key is required");
          
          await bucket.delete(p.key);
          
          return createStepResult({
            deleted: true,
            key: p.key,
          });
        }
        
        case "head": {
          if (!p.key) return createErrorResult("Key is required");
          
          const object = await bucket.head(p.key);
          if (!object) {
            return createStepResult({
              found: false,
              key: p.key,
            });
          }
          
          return createStepResult({
            found: true,
            key: p.key,
            size: object.size,
            etag: object.etag,
            contentType: object.httpMetadata?.contentType,
            uploaded: object.uploaded?.toISOString(),
          });
        }
        
        case "list": {
          const options: R2ListOptions = {};
          if (p.prefix) options.prefix = p.prefix;
          if (p.limit) options.limit = p.limit;
          
          const result = await bucket.list(options);
          
          return createStepResult({
            objects: result.objects.map(obj => ({
              key: obj.key,
              size: obj.size,
              etag: obj.etag,
              uploaded: obj.uploaded?.toISOString(),
            })),
            truncated: result.truncated,
            cursor: result.truncated ? (result as { cursor?: string }).cursor : undefined,
            count: result.objects.length,
          });
        }
        
        default:
          return createErrorResult(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return createErrorResult(`R2 storage error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};
