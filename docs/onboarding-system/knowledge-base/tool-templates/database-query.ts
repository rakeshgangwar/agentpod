/**
 * @id tool_database_query
 * @title Database Query Tool
 * @description Executes safe, read-only SQL queries against the project database
 * @tags database, sql, query, data, analytics
 * @applicable_to api_service, web_app
 */

import { tool } from "@opencode-ai/plugin";

/**
 * Database Query Tool
 *
 * This tool allows the AI agent to safely query the project's database
 * for debugging, analysis, and development purposes.
 *
 * ## Safety Features
 * - Read-only by default (SELECT queries only)
 * - Query timeout limits
 * - Row limit enforcement
 * - Query logging for audit
 *
 * ## Installation
 *
 * 1. Place this file at `.opencode/tool/database-query.ts`
 * 2. Configure the database connection in your environment
 * 3. The tool will be automatically available to agents
 *
 * ## Configuration
 *
 * Set these environment variables:
 * - DATABASE_URL: Connection string for the database
 * - DB_QUERY_TIMEOUT: Query timeout in milliseconds (default: 5000)
 * - DB_MAX_ROWS: Maximum rows to return (default: 1000)
 */

/**
 * Database Query Tool
 * 
 * Uses the new OpenCode tool API with:
 * - tool.schema for argument definitions (Zod-compatible)
 * - execute function with (args, context) signature
 * - context provides { agent, sessionID, messageID }
 * 
 * Note: The tool name is derived from the filename (database-query)
 */
export default tool({
  description: `
Execute a read-only SQL query against the project database.

## Capabilities
- Run SELECT queries to inspect data
- Use parameterized queries for safety
- Get results in table, JSON, or CSV format
- Automatic row limiting to prevent memory issues

## Limitations
- READ-ONLY: Only SELECT queries are allowed
- Maximum 1000 rows per query
- 5 second timeout per query
- No DDL or DML operations (CREATE, INSERT, UPDATE, DELETE)

## Examples

### Simple query
database_query(query: "SELECT * FROM users LIMIT 10")

### With parameters
database_query(
  query: "SELECT * FROM orders WHERE user_id = ? AND status = ?",
  parameters: [123, "completed"]
)

### Count records
database_query(query: "SELECT COUNT(*) as total FROM products WHERE active = true")

### Join tables
database_query(query: "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id")
`,

  // Use tool.schema for argument definitions (Zod-compatible API)
  args: {
    query: tool.schema
      .string()
      .describe("The SQL query to execute (SELECT only)"),
    parameters: tool.schema
      .array(tool.schema.union([
        tool.schema.string(),
        tool.schema.number(),
        tool.schema.boolean(),
        tool.schema.null()
      ]))
      .optional()
      .describe("Optional parameters for parameterized queries"),
    limit: tool.schema
      .number()
      .max(1000)
      .optional()
      .default(100)
      .describe("Maximum number of rows to return (max: 1000)"),
    format: tool.schema
      .enum(["table", "json", "csv"])
      .optional()
      .default("table")
      .describe("Output format for the results"),
  },

  // Execute function receives typed args and context
  async execute(args, context) {
    const { query, parameters = [], limit = 100, format = "table" } = args;
    const { agent, sessionID, messageID } = context;
    
    console.log(`[database-query] Executing query for agent=${agent}, session=${sessionID}`);
    
    // Validate query is read-only
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery.startsWith("select")) {
      return {
        success: false,
        rowCount: 0,
        columns: [],
        rows: [],
        executionTime: 0,
        truncated: false,
        error: "Only SELECT queries are allowed. This tool is read-only.",
      };
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /;\s*(insert|update|delete|drop|truncate|alter|create|grant|revoke)/i,
      /into\s+outfile/i,
      /load_file/i,
      /benchmark\s*\(/i,
      /sleep\s*\(/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return {
          success: false,
          rowCount: 0,
          columns: [],
          rows: [],
          executionTime: 0,
          truncated: false,
          error: "Query contains potentially dangerous patterns.",
        };
      }
    }

    // Add LIMIT if not present
    let finalQuery = query;
    if (!/\blimit\b/i.test(query)) {
      finalQuery = `${query} LIMIT ${limit}`;
    }

    const startTime = Date.now();

    try {
      // NOTE: This is a placeholder implementation
      // In a real deployment, this would connect to the actual database
      // The implementation depends on your database type (PostgreSQL, MySQL, SQLite, etc.)

      // Example implementation for different databases:

      // PostgreSQL (using pg):
      // const { Pool } = await import('pg');
      // const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      // const result = await pool.query(finalQuery, parameters);

      // MySQL (using mysql2):
      // const mysql = await import('mysql2/promise');
      // const connection = await mysql.createConnection(process.env.DATABASE_URL);
      // const [rows] = await connection.execute(finalQuery, parameters);

      // SQLite (using better-sqlite3):
      // const Database = await import('better-sqlite3');
      // const db = new Database(process.env.DATABASE_PATH);
      // const stmt = db.prepare(finalQuery);
      // const rows = stmt.all(...parameters);

      // Placeholder response for documentation
      const mockResult = {
        columns: ["id", "name", "email", "created_at"],
        rows: [
          {
            id: 1,
            name: "Example User",
            email: "user@example.com",
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      };

      const executionTime = Date.now() - startTime;
      const truncated = mockResult.rows.length >= limit;

      // Format output based on requested format
      let formattedRows = mockResult.rows;
      if (format === "csv") {
        // CSV formatting would happen here
      } else if (format === "table") {
        // Table formatting would happen here
      }

      return {
        success: true,
        rowCount: mockResult.rows.length,
        columns: mockResult.columns,
        rows: formattedRows,
        executionTime,
        truncated,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        rowCount: 0,
        columns: [],
        rows: [],
        executionTime,
        truncated: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

/**
 * ## Customization Guide
 *
 * ### For PostgreSQL Projects
 *
 * ```typescript
 * import { tool } from "@opencode-ai/plugin";
 * import { Pool } from 'pg';
 *
 * const pool = new Pool({
 *   connectionString: process.env.DATABASE_URL,
 *   max: 5,
 *   idleTimeoutMillis: 30000,
 *   connectionTimeoutMillis: 5000,
 * });
 *
 * export default tool({
 *   description: "Execute a read-only SQL query",
 *   args: {
 *     query: tool.schema.string().describe("SQL query"),
 *     parameters: tool.schema.array(tool.schema.unknown()).optional(),
 *   },
 *   async execute(args, context) {
 *     const result = await pool.query(args.query, args.parameters);
 *     return {
 *       success: true,
 *       rowCount: result.rowCount,
 *       columns: result.fields.map(f => f.name),
 *       rows: result.rows,
 *     };
 *   },
 * });
 * ```
 *
 * ### For MySQL Projects
 *
 * ```typescript
 * import { tool } from "@opencode-ai/plugin";
 * import mysql from 'mysql2/promise';
 *
 * export default tool({
 *   description: "Execute a read-only SQL query",
 *   args: {
 *     query: tool.schema.string().describe("SQL query"),
 *     parameters: tool.schema.array(tool.schema.unknown()).optional(),
 *   },
 *   async execute(args, context) {
 *     const connection = await mysql.createConnection({
 *       uri: process.env.DATABASE_URL,
 *       connectTimeout: 5000,
 *     });
 *     const [rows, fields] = await connection.execute(args.query, args.parameters);
 *     return {
 *       success: true,
 *       rowCount: rows.length,
 *       columns: fields.map(f => f.name),
 *       rows: rows,
 *     };
 *   },
 * });
 * ```
 *
 * ### For SQLite Projects
 *
 * ```typescript
 * import { tool } from "@opencode-ai/plugin";
 * import Database from 'better-sqlite3';
 *
 * const db = new Database(process.env.DATABASE_PATH, {
 *   readonly: true,
 *   timeout: 5000,
 * });
 *
 * export default tool({
 *   description: "Execute a read-only SQL query",
 *   args: {
 *     query: tool.schema.string().describe("SQL query"),
 *     parameters: tool.schema.array(tool.schema.unknown()).optional(),
 *   },
 *   async execute(args, context) {
 *     const stmt = db.prepare(args.query);
 *     const rows = stmt.all(...(args.parameters || []));
 *     const columns = stmt.columns().map(c => c.name);
 *     return {
 *       success: true,
 *       rowCount: rows.length,
 *       columns,
 *       rows,
 *     };
 *   },
 * });
 * ```
 *
 * ### Adding Write Capabilities (Use with Caution!)
 *
 * If you need write capabilities, create a separate tool with additional safeguards:
 *
 * ```typescript
 * import { tool } from "@opencode-ai/plugin";
 *
 * export default tool({
 *   description: "Execute write operations (requires confirmation)",
 *   args: {
 *     query: tool.schema.string().describe("SQL query"),
 *     parameters: tool.schema.array(tool.schema.unknown()).optional(),
 *     confirmed: tool.schema.boolean().describe("Must be true to execute"),
 *   },
 *   async execute(args, context) {
 *     if (!args.confirmed) {
 *       return { success: false, error: "Write operations require confirmation" };
 *     }
 *     // Implement with extreme caution
 *   },
 * });
 * ```
 *
 * ### Schema Introspection Tool
 *
 * Consider adding a companion tool for schema inspection:
 *
 * ```typescript
 * import { tool } from "@opencode-ai/plugin";
 *
 * export default tool({
 *   description: "Get database schema information",
 *   args: {
 *     table: tool.schema.string().optional().describe("Specific table to inspect"),
 *   },
 *   async execute(args, context) {
 *     // PostgreSQL:
 *     // SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1
 *
 *     // MySQL:
 *     // DESCRIBE table_name
 *
 *     // SQLite:
 *     // PRAGMA table_info(table_name)
 *   },
 * });
 * ```
 */
