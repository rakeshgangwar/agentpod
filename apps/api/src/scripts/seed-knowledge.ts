/**
 * Knowledge Base Seed Script
 *
 * Reads markdown and JSON files from docs/onboarding-system/knowledge-base/
 * and seeds them into the knowledge_documents table.
 *
 * Usage: bun run src/scripts/seed-knowledge.ts [--clear]
 *
 * Options:
 *   --clear    Clear all existing documents before seeding
 */

import { readdir, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { db } from "../db/drizzle";
import { knowledgeDocuments } from "../db/schema/knowledge";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { KnowledgeCategory, CreateKnowledgeDocument } from "@agentpod/types";

// =============================================================================
// Configuration
// =============================================================================

// Get the directory of this script file
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

// Navigate from apps/api/src/scripts/ to repo root, then to docs/
const KNOWLEDGE_BASE_PATH = join(
  __dirname,
  "../../../../docs/onboarding-system/knowledge-base"
);

// Map directory names to knowledge categories
const CATEGORY_MAP: Record<string, KnowledgeCategory> = {
  "project-templates": "project_template",
  "agent-patterns": "agent_pattern",
  "command-templates": "command_template",
  "tool-templates": "tool_template",
  "plugin-templates": "plugin_template",
  "mcp-templates": "mcp_template",
};

// =============================================================================
// Types
// =============================================================================

interface ParsedDocument {
  id?: string;
  title: string;
  description?: string;
  content: string;
  tags?: string[];
  applicable_to?: string[];
  applicableTo?: string[];
  metadata?: Record<string, unknown>;
}

interface SeedStats {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse a markdown file with YAML frontmatter.
 */
function parseMarkdownFile(content: string, filename: string): ParsedDocument {
  const { data, content: body } = matter(content);

  return {
    id: data.id,
    title: data.title || titleFromFilename(filename),
    description: data.description,
    content: body.trim(),
    tags: data.tags || [],
    applicable_to: data.applicable_to || data.applicableTo,
    metadata: {
      ...data.metadata,
      // Preserve any other frontmatter fields
      ...Object.fromEntries(
        Object.entries(data).filter(
          ([key]) =>
            !["id", "title", "description", "tags", "applicable_to", "applicableTo", "metadata"].includes(key)
        )
      ),
    },
  };
}

/**
 * Parse a TypeScript file (plugin/tool templates).
 * Extracts metadata from JSDoc-style comments.
 */
function parseTypeScriptFile(content: string, filename: string): ParsedDocument {
  // Extract JSDoc metadata
  const metaMatch = content.match(/\/\*\*[\s\S]*?\*\//);
  const meta: Record<string, unknown> = {};

  if (metaMatch) {
    const docBlock = metaMatch[0];

    // Extract @id
    const idMatch = docBlock.match(/@id\s+(\S+)/);
    if (idMatch?.[1]) meta.id = idMatch[1];

    // Extract @title
    const titleMatch = docBlock.match(/@title\s+(.+)/);
    if (titleMatch?.[1]) meta.title = titleMatch[1].trim();

    // Extract @description
    const descMatch = docBlock.match(/@description\s+(.+)/);
    if (descMatch?.[1]) meta.description = descMatch[1].trim();

    // Extract @tags (JSON array)
    const tagsMatch = docBlock.match(/@tags\s+(\[.+?\])/);
    if (tagsMatch?.[1]) {
      try {
        meta.tags = JSON.parse(tagsMatch[1]);
      } catch {
        meta.tags = [];
      }
    }

    // Extract @applicable_to (JSON array)
    const applicableMatch = docBlock.match(/@applicable_to\s+(\[.+?\]|null)/);
    if (applicableMatch?.[1] && applicableMatch[1] !== "null") {
      try {
        meta.applicable_to = JSON.parse(applicableMatch[1]);
      } catch {
        meta.applicable_to = null;
      }
    }

    // Extract @priority
    const priorityMatch = docBlock.match(/@priority\s+(\S+)/);
    if (priorityMatch) meta.priority = priorityMatch[1];
  }

  return {
    id: meta.id as string | undefined,
    title: (meta.title as string) || titleFromFilename(filename),
    description: meta.description as string | undefined,
    content: content,
    tags: (meta.tags as string[]) || [],
    applicable_to: meta.applicable_to as string[] | undefined,
    metadata: { priority: meta.priority },
  };
}

/**
 * Parse a JSON file (MCP templates).
 */
function parseJsonFile(content: string, filename: string): ParsedDocument {
  const data = JSON.parse(content);

  return {
    id: data.id,
    title: data.title || titleFromFilename(filename),
    description: data.description,
    content: JSON.stringify(data.config || data, null, 2),
    tags: data.tags || [],
    applicable_to: data.applicable_to || data.applicableTo,
    metadata: {
      tools_provided: data.tools_provided,
      priority: data.priority,
    },
  };
}

/**
 * Convert filename to title.
 */
function titleFromFilename(filename: string): string {
  const name = basename(filename, extname(filename));
  return name
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// =============================================================================
// Seed Functions
// =============================================================================

/**
 * Read and parse all files in a directory.
 */
async function readDirectory(
  dirPath: string,
  category: KnowledgeCategory
): Promise<CreateKnowledgeDocument[]> {
  const documents: CreateKnowledgeDocument[] = [];

  try {
    const files = await readdir(dirPath);

    for (const file of files) {
      const filePath = join(dirPath, file);
      const ext = extname(file).toLowerCase();

      // Skip directories and non-document files
      if (ext !== ".md" && ext !== ".ts" && ext !== ".json") continue;
      if (file.startsWith("_") || file === "README.md") continue;

      try {
        const content = await readFile(filePath, "utf-8");
        let parsed: ParsedDocument;

        if (ext === ".md") {
          parsed = parseMarkdownFile(content, file);
        } else if (ext === ".ts") {
          parsed = parseTypeScriptFile(content, file);
        } else {
          parsed = parseJsonFile(content, file);
        }

        documents.push({
          category,
          title: parsed.title,
          description: parsed.description,
          content: parsed.content,
          tags: parsed.tags,
          applicableTo: parsed.applicable_to || parsed.applicableTo,
          metadata: {
            ...parsed.metadata,
            sourceFile: file,
            documentId: parsed.id,
          },
        });

        console.log(`  Parsed: ${file}`);
      } catch (err) {
        console.error(`  Error parsing ${file}:`, err);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Error reading directory ${dirPath}:`, err);
    }
  }

  return documents;
}

/**
 * Seed a single document into the database.
 */
async function seedDocument(doc: CreateKnowledgeDocument): Promise<"created" | "updated" | "error"> {
  const documentId = (doc.metadata?.documentId as string) || null;

  try {
    // Check if document with same title and category exists
    const existing = await db
      .select({ id: knowledgeDocuments.id })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.title, doc.title))
      .limit(1);

    const id = existing[0]?.id || nanoid();
    const now = new Date();

    if (existing[0]) {
      // Update existing document
      await db
        .update(knowledgeDocuments)
        .set({
          category: doc.category,
          description: doc.description || null,
          content: doc.content,
          tags: JSON.stringify(doc.tags || []),
          applicableTo: doc.applicableTo ? JSON.stringify(doc.applicableTo) : null,
          metadata: JSON.stringify(doc.metadata || {}),
          embeddingStatus: "pending", // Reset for re-embedding
          updatedAt: now,
        })
        .where(eq(knowledgeDocuments.id, id));

      return "updated";
    } else {
      // Create new document
      await db.insert(knowledgeDocuments).values({
        id,
        category: doc.category,
        title: doc.title,
        description: doc.description || null,
        content: doc.content,
        tags: JSON.stringify(doc.tags || []),
        applicableTo: doc.applicableTo ? JSON.stringify(doc.applicableTo) : null,
        metadata: JSON.stringify(doc.metadata || {}),
        embeddingStatus: "pending",
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      return "created";
    }
  } catch (err) {
    console.error(`  Error seeding "${doc.title}":`, err);
    return "error";
  }
}

/**
 * Clear all knowledge documents.
 */
async function clearAllDocuments(): Promise<number> {
  const result = await db.delete(knowledgeDocuments).returning({ id: knowledgeDocuments.id });
  return result.length;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const shouldClear = args.includes("--clear");

  console.log("=".repeat(60));
  console.log("Knowledge Base Seeding Script");
  console.log("=".repeat(60));
  console.log(`Source: ${KNOWLEDGE_BASE_PATH}`);
  console.log("");

  // Clear existing documents if requested
  if (shouldClear) {
    console.log("Clearing existing documents...");
    const cleared = await clearAllDocuments();
    console.log(`  Cleared ${cleared} documents`);
    console.log("");
  }

  const stats: SeedStats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  // Process each category directory
  for (const [dirName, category] of Object.entries(CATEGORY_MAP)) {
    const dirPath = join(KNOWLEDGE_BASE_PATH, dirName);
    console.log(`\nProcessing ${dirName}/ (${category})...`);

    const documents = await readDirectory(dirPath, category);

    for (const doc of documents) {
      const result = await seedDocument(doc);
      stats[result === "error" ? "errors" : result]++;
    }
  }

  // Also process root-level reference files
  console.log("\nProcessing root-level files...");
  const rootFiles = ["project-types-reference.md"];

  for (const file of rootFiles) {
    const filePath = join(KNOWLEDGE_BASE_PATH, file);
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = parseMarkdownFile(content, file);

      const doc: CreateKnowledgeDocument = {
        category: "best_practice",
        title: parsed.title,
        description: parsed.description,
        content: parsed.content,
        tags: parsed.tags,
        applicableTo: parsed.applicable_to,
        metadata: {
          ...parsed.metadata,
          sourceFile: file,
          documentId: parsed.id,
        },
      };

      console.log(`  Parsed: ${file}`);
      const result = await seedDocument(doc);
      stats[result === "error" ? "errors" : result]++;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`  Error processing ${file}:`, err);
        stats.errors++;
      }
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("Seeding Complete");
  console.log("=".repeat(60));
  console.log(`  Created: ${stats.created}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Errors:  ${stats.errors}`);
  console.log("");

  // Exit with error code if there were errors
  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
