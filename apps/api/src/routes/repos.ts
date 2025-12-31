/**
 * Repository Routes (v2)
 *
 * Standalone API routes for Git repository management using FileSystemGitBackend.
 * These routes provide direct repository operations independent of sandboxes.
 *
 * Endpoints:
 * - GET    /api/v2/repos              List all repositories
 * - POST   /api/v2/repos              Create a new repository
 * - GET    /api/v2/repos/:name        Get repository by name
 * - DELETE /api/v2/repos/:name        Delete a repository
 * - GET    /api/v2/repos/:name/files  List files in a directory
 * - GET    /api/v2/repos/:name/file   Read a file
 * - PUT    /api/v2/repos/:name/file   Write a file
 * - DELETE /api/v2/repos/:name/file   Delete a file
 * - GET    /api/v2/repos/:name/status Get git status
 * - POST   /api/v2/repos/:name/commit Create a commit
 * - GET    /api/v2/repos/:name/log    Get commit history
 * - GET    /api/v2/repos/:name/branches List branches
 * - POST   /api/v2/repos/:name/branches Create a branch
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { FileSystemGitBackend } from "../services/git/filesystem.ts";
import { config } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("repo-routes");

// =============================================================================
// Git Backend Singleton
// =============================================================================

let gitBackend: FileSystemGitBackend | null = null;

function getGitBackend(): FileSystemGitBackend {
  if (!gitBackend) {
    gitBackend = new FileSystemGitBackend({
      reposDir: config.data.reposDir,
      defaultAuthor: {
        name: "AgentPod",
        email: "agent@agentpod.dev",
      },
      defaultBranch: "main",
    });
  }
  return gitBackend;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const createRepoSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Name can only contain letters, numbers, underscores, and hyphens"),
  description: z.string().max(500).optional(),
  defaultBranch: z.string().optional(),
  template: z.object({
    readme: z.boolean().optional(),
    gitignore: z.boolean().optional(),
    agentpodConfig: z.boolean().optional(),
  }).optional(),
});

const cloneRepoSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(100),
  branch: z.string().optional(),
  depth: z.number().int().positive().optional(),
  auth: z.object({
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  }).optional(),
});

const writeFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const deleteFileSchema = z.object({
  path: z.string().min(1),
});

const commitSchema = z.object({
  message: z.string().min(1).max(500),
  author: z.object({
    name: z.string(),
    email: z.string().email(),
  }).optional(),
});

const createBranchSchema = z.object({
  name: z.string().min(1).max(100),
  ref: z.string().optional(),
});

const checkoutSchema = z.object({
  ref: z.string().min(1),
});

const stageFilesSchema = z.object({
  paths: z.array(z.string()).optional(),
});

// =============================================================================
// Routes
// =============================================================================

export const repoRoutes = new Hono()
  // ===========================================================================
  // List Repositories
  // ===========================================================================
  .get("/", async (c) => {
    try {
      const backend = getGitBackend();
      const repos = await backend.listRepos();

      return c.json({
        repositories: repos,
        count: repos.length,
      });
    } catch (error) {
      log.error("Failed to list repositories", { error });
      return c.json(
        { error: "Failed to list repositories", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Create Repository
  // ===========================================================================
  .post("/", zValidator("json", createRepoSchema), async (c) => {
    const { name, description, defaultBranch, template } = c.req.valid("json");

    log.info("Creating repository", { name });

    try {
      const backend = getGitBackend();
      const repo = await backend.createRepo(name, {
        description,
        defaultBranch,
        template: template ? {
          readme: template.readme,
          gitignore: template.gitignore,
          agentpodConfig: template.agentpodConfig,
        } : undefined,
        initialCommit: true,
      });

      log.info("Repository created", { name: repo.name, path: repo.path });

      return c.json({ repository: repo }, 201);
    } catch (error) {
      log.error("Failed to create repository", { name, error });
      return c.json(
        { error: "Failed to create repository", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Clone Repository
  // ===========================================================================
  .post("/clone", zValidator("json", cloneRepoSchema), async (c) => {
    const { url, name, branch, depth, auth } = c.req.valid("json");

    log.info("Cloning repository", { url, name });

    try {
      const backend = getGitBackend();
      const repo = await backend.cloneRepo(url, name, {
        branch,
        depth,
        auth,
      });

      log.info("Repository cloned", { name: repo.name, path: repo.path });

      return c.json({ repository: repo }, 201);
    } catch (error) {
      log.error("Failed to clone repository", { url, name, error });
      return c.json(
        { error: "Failed to clone repository", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Repository
  // ===========================================================================
  .get("/:name", async (c) => {
    const name = c.req.param("name");

    try {
      const backend = getGitBackend();
      const repo = await backend.getRepo(name);

      if (!repo) {
        return c.json({ error: "Repository not found" }, 404);
      }

      return c.json({ repository: repo });
    } catch (error) {
      log.error("Failed to get repository", { name, error });
      return c.json(
        { error: "Failed to get repository", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Delete Repository
  // ===========================================================================
  .delete("/:name", async (c) => {
    const name = c.req.param("name");

    log.info("Deleting repository", { name });

    try {
      const backend = getGitBackend();
      await backend.deleteRepo(name);

      return c.json({ success: true, message: "Repository deleted" });
    } catch (error) {
      log.error("Failed to delete repository", { name, error });
      return c.json(
        { error: "Failed to delete repository", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // List Files
  // ===========================================================================
  .get("/:name/files", async (c) => {
    const name = c.req.param("name");
    const path = c.req.query("path") ?? "";
    const ref = c.req.query("ref") ?? "HEAD";

    try {
      const backend = getGitBackend();
      const files = await backend.listFiles(name, path, ref);

      return c.json({ files, path, ref });
    } catch (error) {
      log.error("Failed to list files", { name, path, error });
      return c.json(
        { error: "Failed to list files", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Read File
  // ===========================================================================
  .get("/:name/file", async (c) => {
    const name = c.req.param("name");
    const path = c.req.query("path");
    const ref = c.req.query("ref") ?? "HEAD";

    if (!path) {
      return c.json({ error: "Missing path query parameter" }, 400);
    }

    try {
      const backend = getGitBackend();
      const file = await backend.readFile(name, path, ref);

      if (!file) {
        return c.json({ error: "File not found" }, 404);
      }

      return c.json({ file });
    } catch (error) {
      log.error("Failed to read file", { name, path, error });
      return c.json(
        { error: "Failed to read file", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Write File
  // ===========================================================================
  .put("/:name/file", zValidator("json", writeFileSchema), async (c) => {
    const name = c.req.param("name");
    const { path, content } = c.req.valid("json");

    log.info("Writing file", { name, path });

    try {
      const backend = getGitBackend();
      await backend.writeFile(name, path, content);

      return c.json({ success: true, message: "File written and staged" });
    } catch (error) {
      log.error("Failed to write file", { name, path, error });
      return c.json(
        { error: "Failed to write file", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Delete File
  // ===========================================================================
  .delete("/:name/file", zValidator("json", deleteFileSchema), async (c) => {
    const name = c.req.param("name");
    const { path } = c.req.valid("json");

    log.info("Deleting file", { name, path });

    try {
      const backend = getGitBackend();
      await backend.deleteFile(name, path);

      return c.json({ success: true, message: "File deleted and staged" });
    } catch (error) {
      log.error("Failed to delete file", { name, path, error });
      return c.json(
        { error: "Failed to delete file", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Git Status
  // ===========================================================================
  .get("/:name/status", async (c) => {
    const name = c.req.param("name");

    try {
      const backend = getGitBackend();
      const status = await backend.getStatus(name);

      return c.json({ files: status });
    } catch (error) {
      log.error("Failed to get status", { name, error });
      return c.json(
        { error: "Failed to get status", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Stage Files
  // ===========================================================================
  .post("/:name/stage", zValidator("json", stageFilesSchema.optional()), async (c) => {
    const name = c.req.param("name");
    let paths: string[] | undefined;

    try {
      const body = await c.req.json();
      paths = body?.paths;
    } catch {
      // No body, stage all
    }

    log.info("Staging files", { name, paths: paths?.length ?? "all" });

    try {
      const backend = getGitBackend();
      await backend.stageFiles(name, paths);

      return c.json({ success: true, message: "Files staged" });
    } catch (error) {
      log.error("Failed to stage files", { name, error });
      return c.json(
        { error: "Failed to stage files", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Commit
  // ===========================================================================
  .post("/:name/commit", zValidator("json", commitSchema), async (c) => {
    const name = c.req.param("name");
    const { message, author } = c.req.valid("json");

    log.info("Creating commit", { name, message });

    try {
      const backend = getGitBackend();
      const sha = await backend.commit(name, {
        message,
        author: author ?? {
          name: "AgentPod User",
          email: "user@agentpod.dev",
          timestamp: new Date(),
        },
      });

      return c.json({ sha, message: "Commit created" });
    } catch (error) {
      log.error("Failed to create commit", { name, error });
      return c.json(
        { error: "Failed to create commit", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Commit Log
  // ===========================================================================
  .get("/:name/log", async (c) => {
    const name = c.req.param("name");
    const limit = parseInt(c.req.query("limit") ?? "20", 10);
    const ref = c.req.query("ref");

    try {
      const backend = getGitBackend();
      const commits = await backend.getLog(name, { limit, ref });

      return c.json({ commits });
    } catch (error) {
      log.error("Failed to get log", { name, error });
      return c.json(
        { error: "Failed to get log", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Specific Commit
  // ===========================================================================
  .get("/:name/commit/:sha", async (c) => {
    const name = c.req.param("name");
    const sha = c.req.param("sha");

    try {
      const backend = getGitBackend();
      const commit = await backend.getCommit(name, sha);

      if (!commit) {
        return c.json({ error: "Commit not found" }, 404);
      }

      return c.json({ commit });
    } catch (error) {
      log.error("Failed to get commit", { name, sha, error });
      return c.json(
        { error: "Failed to get commit", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // List Branches
  // ===========================================================================
  .get("/:name/branches", async (c) => {
    const name = c.req.param("name");

    try {
      const backend = getGitBackend();
      const branches = await backend.listBranches(name);
      const current = await backend.getCurrentBranch(name);

      return c.json({ branches, current });
    } catch (error) {
      log.error("Failed to list branches", { name, error });
      return c.json(
        { error: "Failed to list branches", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Create Branch
  // ===========================================================================
  .post("/:name/branches", zValidator("json", createBranchSchema), async (c) => {
    const name = c.req.param("name");
    const { name: branchName, ref } = c.req.valid("json");

    log.info("Creating branch", { repo: name, branch: branchName });

    try {
      const backend = getGitBackend();
      await backend.createBranch(name, branchName, ref);

      return c.json({ success: true, message: `Branch '${branchName}' created` });
    } catch (error) {
      log.error("Failed to create branch", { name, branchName, error });
      return c.json(
        { error: "Failed to create branch", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Delete Branch
  // ===========================================================================
  .delete("/:name/branches/:branch", async (c) => {
    const name = c.req.param("name");
    const branch = c.req.param("branch");

    log.info("Deleting branch", { repo: name, branch });

    try {
      const backend = getGitBackend();
      await backend.deleteBranch(name, branch);

      return c.json({ success: true, message: `Branch '${branch}' deleted` });
    } catch (error) {
      log.error("Failed to delete branch", { name, branch, error });
      return c.json(
        { error: "Failed to delete branch", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Checkout
  // ===========================================================================
  .post("/:name/checkout", zValidator("json", checkoutSchema), async (c) => {
    const name = c.req.param("name");
    const { ref } = c.req.valid("json");

    log.info("Checking out", { repo: name, ref });

    try {
      const backend = getGitBackend();
      await backend.checkout(name, ref);

      return c.json({ success: true, message: `Checked out '${ref}'` });
    } catch (error) {
      log.error("Failed to checkout", { name, ref, error });
      return c.json(
        { error: "Failed to checkout", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  // ===========================================================================
  // Get Diff
  // ===========================================================================
  .get("/:name/diff", async (c) => {
    const name = c.req.param("name");
    const from = c.req.query("from");
    const to = c.req.query("to");

    try {
      const backend = getGitBackend();
      const diff = await backend.getDiff(name, { from, to });

      return c.json({ diff });
    } catch (error) {
      log.error("Failed to get diff", { name, error });
      return c.json(
        { error: "Failed to get diff", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });
