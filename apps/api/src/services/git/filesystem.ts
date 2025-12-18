/**
 * FileSystem Git Backend
 * Implementation of GitBackend using isomorphic-git for local filesystem repositories
 */

import * as fs from "node:fs";
import * as path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type { GitBackend, GitBackendConfig } from "./index";
import type {
  Repository,
  CreateRepoOptions,
  CloneOptions,
  Commit,
  CommitOptions,
  Author,
  FileEntry,
  FileContent,
  FileStatus,
  StatusCode,
  Branch,
  Remote,
  SyncOptions,
  Diff,
  FileDiff,
  GitConfig,
  GitError,
  DiffHunk,
} from "./types";
import {
  parseUnifiedDiff,
  createAddedFileHunks,
  createDeletedFileHunks,
  countChanges,
} from "./diff-parser";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for FileSystemGitBackend
 */
export interface FileSystemGitBackendConfig extends GitBackendConfig {
  /** HTTP client for remote operations (defaults to isomorphic-git http/node) */
  http?: typeof http;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * FileSystemGitBackend
 *
 * Manages Git repositories on the local filesystem using isomorphic-git.
 * This replaces Forgejo for local development and container environments.
 */
export class FileSystemGitBackend implements GitBackend {
  private readonly reposDir: string;
  private readonly defaultAuthor: Author;
  private readonly defaultBranch: string;
  private readonly http: typeof http;

  constructor(config: FileSystemGitBackendConfig) {
    this.reposDir = path.resolve(config.reposDir);
    this.defaultAuthor = config.defaultAuthor ?? {
      name: "AgentPod",
      email: "agent@agentpod.dev",
    };
    this.defaultBranch = config.defaultBranch ?? "main";
    this.http = config.http ?? http;

    // Ensure repos directory exists
    this.ensureReposDir();
  }

  private ensureReposDir(): void {
    if (!fs.existsSync(this.reposDir)) {
      fs.mkdirSync(this.reposDir, { recursive: true });
    }
  }

  private getRepoPath(name: string): string {
    return path.join(this.reposDir, name);
  }

  private async isGitRepo(repoPath: string): Promise<boolean> {
    try {
      const gitDir = path.join(repoPath, ".git");
      return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Repository Lifecycle
  // ===========================================================================

  async createRepo(name: string, options?: CreateRepoOptions): Promise<Repository> {
    const repoPath = this.getRepoPath(name);

    // Check if repo already exists
    if (fs.existsSync(repoPath)) {
      throw new Error(`Repository '${name}' already exists`) as GitError;
    }

    // Create the directory
    fs.mkdirSync(repoPath, { recursive: true });

    // Initialize the repository
    await git.init({
      fs,
      dir: repoPath,
      defaultBranch: options?.defaultBranch ?? this.defaultBranch,
    });

    // Set description if provided
    if (options?.description) {
      const descPath = path.join(repoPath, ".git", "description");
      fs.writeFileSync(descPath, options.description);
    }

    // Create template files
    if (options?.template) {
      await this.createTemplateFiles(repoPath, name, options.template);
    }

    // Create initial commit if requested
    if (options?.initialCommit !== false) {
      const author = options?.author ?? this.defaultAuthor;

      // Add all files to staging
      await this.stageAllFiles(repoPath);

      // Check if there are any files to commit
      const status = await git.statusMatrix({ fs, dir: repoPath });
      const hasChanges = status.some(
        ([, head, workdir, stage]) => head !== workdir || head !== stage
      );

      if (hasChanges || options?.template) {
        try {
          await git.commit({
            fs,
            dir: repoPath,
            message: "Initial commit",
            author: {
              name: author.name,
              email: author.email,
              timestamp: Math.floor((author.timestamp ?? new Date()).getTime() / 1000),
            },
          });
        } catch (e) {
          // Ignore if there's nothing to commit
          if (!(e instanceof Error && e.message.includes("nothing to commit"))) {
            throw e;
          }
        }
      }
    }

    return this.getRepo(name) as Promise<Repository>;
  }

  private async createTemplateFiles(
    repoPath: string,
    name: string,
    template: CreateRepoOptions["template"]
  ): Promise<void> {
    if (!template) return;

    // Create README.md
    if (template.readme) {
      const readmeContent =
        typeof template.readme === "string"
          ? template.readme
          : `# ${name}\n\nA new AgentPod project.\n`;
      fs.writeFileSync(path.join(repoPath, "README.md"), readmeContent);
    }

    // Create .gitignore
    if (template.gitignore) {
      const gitignoreContent =
        typeof template.gitignore === "string"
          ? template.gitignore
          : `# Dependencies
node_modules/

# Build outputs
dist/
build/

# Environment files
.env
.env.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;
      fs.writeFileSync(path.join(repoPath, ".gitignore"), gitignoreContent);
    }

    // Create agentpod.toml
    if (template.agentpodConfig) {
      const configContent = `# AgentPod Configuration
# https://agentpod.dev/docs/configuration

[project]
name = "${name}"

[container]
flavor = "js"

[ports]
# Add any ports you want to expose
# http = 3000
`;
      fs.writeFileSync(path.join(repoPath, "agentpod.toml"), configContent);
    }

    // Create additional files
    if (template.files) {
      for (const [filePath, content] of Object.entries(template.files)) {
        const fullPath = path.join(repoPath, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content);
      }
    }
  }

  private async stageAllFiles(repoPath: string): Promise<void> {
    const files = this.walkDir(repoPath);
    for (const file of files) {
      const relativePath = path.relative(repoPath, file);
      if (!relativePath.startsWith(".git")) {
        await git.add({ fs, dir: repoPath, filepath: relativePath });
      }
    }
  }

  private walkDir(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== ".git") {
          files.push(...this.walkDir(fullPath));
        }
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  async cloneRepo(url: string, name: string, options?: CloneOptions): Promise<Repository> {
    const repoPath = this.getRepoPath(name);

    // Check if repo already exists
    if (fs.existsSync(repoPath)) {
      throw new Error(`Repository '${name}' already exists`) as GitError;
    }

    // Create the directory
    fs.mkdirSync(repoPath, { recursive: true });

    // Build clone options
    const cloneOptions: Parameters<typeof git.clone>[0] = {
      fs,
      http: this.http,
      dir: repoPath,
      url,
      depth: options?.depth,
      singleBranch: options?.singleBranch,
      ref: options?.branch,
    };

    // Add authentication
    if (options?.auth) {
      if (options.auth.token) {
        cloneOptions.onAuth = () => ({
          username: options.auth!.token!,
          password: "x-oauth-basic",
        });
      } else if (options.auth.username && options.auth.password) {
        cloneOptions.onAuth = () => ({
          username: options.auth!.username!,
          password: options.auth!.password!,
        });
      }
    }

    // Add progress callback
    if (options?.onProgress) {
      cloneOptions.onProgress = (event) => {
        options.onProgress!({
          phase: event.phase as "counting" | "compressing" | "receiving" | "resolving" | "done",
          loaded: event.loaded,
          total: event.total ?? 0,
          percent: event.total ? Math.round((event.loaded / event.total) * 100) : 0,
        });
      };
    }

    try {
      await git.clone(cloneOptions);
    } catch (e) {
      // Clean up on failure
      fs.rmSync(repoPath, { recursive: true, force: true });
      throw e;
    }

    return this.getRepo(name) as Promise<Repository>;
  }

  async getRepo(name: string): Promise<Repository | null> {
    const repoPath = this.getRepoPath(name);

    if (!fs.existsSync(repoPath)) {
      return null;
    }

    if (!(await this.isGitRepo(repoPath))) {
      return null;
    }

    const stats = fs.statSync(repoPath);

    // Get current branch
    let currentBranch: string | undefined;
    try {
      currentBranch = await git.currentBranch({ fs, dir: repoPath }) ?? undefined;
    } catch {
      // Ignore errors (e.g., empty repo)
    }

    // Check if dirty
    let isDirty = false;
    try {
      const status = await git.statusMatrix({ fs, dir: repoPath });
      isDirty = status.some(
        ([, head, workdir, stage]) => head !== workdir || head !== stage
      );
    } catch {
      // Ignore errors
    }

    // Get remote URL
    let remoteUrl: string | undefined;
    try {
      const remotes = await git.listRemotes({ fs, dir: repoPath });
      const origin = remotes.find((r) => r.remote === "origin");
      remoteUrl = origin?.url;
    } catch {
      // Ignore errors
    }

    // Get description
    let description: string | undefined;
    try {
      const descPath = path.join(repoPath, ".git", "description");
      if (fs.existsSync(descPath)) {
        const content = fs.readFileSync(descPath, "utf8").trim();
        if (content && !content.startsWith("Unnamed repository")) {
          description = content;
        }
      }
    } catch {
      // Ignore errors
    }

    return {
      name,
      path: repoPath,
      createdAt: stats.birthtime,
      lastModified: stats.mtime,
      currentBranch,
      isDirty,
      remoteUrl,
      description,
    };
  }

  async deleteRepo(name: string): Promise<void> {
    const repoPath = this.getRepoPath(name);

    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository '${name}' not found`) as GitError;
    }

    fs.rmSync(repoPath, { recursive: true, force: true });
  }

  async listRepos(): Promise<Repository[]> {
    if (!fs.existsSync(this.reposDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.reposDir, { withFileTypes: true });
    const repos: Repository[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const repo = await this.getRepo(entry.name);
        if (repo) {
          repos.push(repo);
        }
      }
    }

    return repos;
  }

  async repoExists(name: string): Promise<boolean> {
    const repoPath = this.getRepoPath(name);
    return fs.existsSync(repoPath) && (await this.isGitRepo(repoPath));
  }

  // ===========================================================================
  // Commit Operations
  // ===========================================================================

  async commit(repoName: string, options: CommitOptions): Promise<string> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const author = options.author;
    const committer = options.committer ?? author;

    const sha = await git.commit({
      fs,
      dir: repoPath,
      message: options.message,
      author: {
        name: author.name,
        email: author.email,
        timestamp: Math.floor((author.timestamp ?? new Date()).getTime() / 1000),
      },
      committer: {
        name: committer.name,
        email: committer.email,
        timestamp: Math.floor((committer.timestamp ?? new Date()).getTime() / 1000),
      },
    });

    return sha;
  }

  async getLog(
    repoName: string,
    options?: { limit?: number; ref?: string; path?: string }
  ): Promise<Commit[]> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    try {
      const commits = await git.log({
        fs,
        dir: repoPath,
        depth: options?.limit,
        ref: options?.ref ?? "HEAD",
      });

      return commits.map((c) => ({
        sha: c.oid,
        message: c.commit.message,
        author: {
          name: c.commit.author.name,
          email: c.commit.author.email,
          timestamp: new Date(c.commit.author.timestamp * 1000),
        },
        committer: {
          name: c.commit.committer.name,
          email: c.commit.committer.email,
          timestamp: new Date(c.commit.committer.timestamp * 1000),
        },
        parents: c.commit.parent,
        timestamp: new Date(c.commit.author.timestamp * 1000),
      }));
    } catch {
      // Return empty array if no commits yet
      return [];
    }
  }

  async getCommit(repoName: string, sha: string): Promise<Commit | null> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    try {
      const { commit, oid } = await git.readCommit({
        fs,
        dir: repoPath,
        oid: sha,
      });

      return {
        sha: oid,
        message: commit.message,
        author: {
          name: commit.author.name,
          email: commit.author.email,
          timestamp: new Date(commit.author.timestamp * 1000),
        },
        committer: {
          name: commit.committer.name,
          email: commit.committer.email,
          timestamp: new Date(commit.committer.timestamp * 1000),
        },
        parents: commit.parent,
        timestamp: new Date(commit.author.timestamp * 1000),
      };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // File Operations
  // ===========================================================================

  async listFiles(repoName: string, dirPath = "", ref = "HEAD"): Promise<FileEntry[]> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    try {
      // Get the tree for the given ref
      const sha = await git.resolveRef({ fs, dir: repoPath, ref });
      const { tree } = await git.readTree({ fs, dir: repoPath, oid: sha });

      // If we have a path, navigate to that subtree
      let currentTree = tree;
      if (dirPath) {
        const parts = dirPath.split("/").filter(Boolean);
        for (const part of parts) {
          const entry = currentTree.find((e) => e.path === part);
          if (!entry || entry.type !== "tree") {
            return [];
          }
          const subtree = await git.readTree({ fs, dir: repoPath, oid: entry.oid });
          currentTree = subtree.tree;
        }
      }

      return currentTree.map((entry) => ({
        name: entry.path,
        path: dirPath ? `${dirPath}/${entry.path}` : entry.path,
        type: entry.type === "tree" ? "directory" : entry.type === "commit" ? "submodule" : "file",
        mode: entry.mode,
        sha: entry.oid,
      }));
    } catch {
      // If no commits yet, list working directory
      const fullPath = path.join(repoPath, dirPath);
      if (!fs.existsSync(fullPath)) {
        return [];
      }

      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      return entries
        .filter((e) => e.name !== ".git")
        .map((entry) => ({
          name: entry.name,
          path: dirPath ? `${dirPath}/${entry.name}` : entry.name,
          type: entry.isDirectory()
            ? "directory"
            : entry.isSymbolicLink()
              ? "symlink"
              : "file",
          mode: entry.isDirectory() ? "040000" : "100644",
          sha: "",
        }));
    }
  }

  async readFile(repoName: string, filePath: string, ref = "HEAD"): Promise<FileContent | null> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    try {
      // Try to read from git tree
      const sha = await git.resolveRef({ fs, dir: repoPath, ref });
      const { blob, oid } = await git.readBlob({
        fs,
        dir: repoPath,
        oid: sha,
        filepath: filePath,
      });

      const content = new TextDecoder().decode(blob);

      return {
        path: filePath,
        content,
        encoding: "utf8",
        size: blob.length,
        sha: oid,
      };
    } catch {
      // Try to read from working directory
      const fullPath = path.join(repoPath, filePath);
      if (!fs.existsSync(fullPath)) {
        return null;
      }

      const content = fs.readFileSync(fullPath, "utf8");
      return {
        path: filePath,
        content,
        encoding: "utf8",
        size: Buffer.byteLength(content),
        sha: "",
      };
    }
  }

  async writeFile(repoName: string, filePath: string, content: string): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const fullPath = path.join(repoPath, filePath);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the file
    fs.writeFileSync(fullPath, content);

    // Stage the file
    await git.add({ fs, dir: repoPath, filepath: filePath });
  }

  async deleteFile(repoName: string, filePath: string): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const fullPath = path.join(repoPath, filePath);

    // Delete the file
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    // Stage the deletion
    await git.remove({ fs, dir: repoPath, filepath: filePath });
  }

  async getStatus(repoName: string, paths?: string[]): Promise<FileStatus[]> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const matrix = await git.statusMatrix({
      fs,
      dir: repoPath,
      filepaths: paths,
    });

    return matrix.map(([filepath, head, workdir, stage]) => {
      // Interpret the status matrix
      // [HEAD, WORKDIR, STAGE]
      // 0 = absent, 1 = present & match, 2 = present & different

      let staged: StatusCode = "unmodified";
      let unstaged: StatusCode = "unmodified";
      let tracked = head !== 0;

      if (head === 0 && stage === 2) {
        staged = "added";
      } else if (head === 1 && stage === 0) {
        staged = "deleted";
      } else if (head === 1 && stage === 2) {
        staged = "modified";
      }

      if (workdir === 0 && head === 1) {
        unstaged = "deleted";
      } else if (workdir === 2 && stage === 1) {
        unstaged = "modified";
      } else if (head === 0 && workdir === 2 && stage === 0) {
        unstaged = "untracked";
        tracked = false;
      }

      return {
        path: filepath,
        staged,
        unstaged,
        tracked,
      };
    });
  }

  async stageFiles(repoName: string, paths?: string[]): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    if (paths && paths.length > 0) {
      for (const filepath of paths) {
        const fullPath = path.join(repoPath, filepath);
        if (fs.existsSync(fullPath)) {
          await git.add({ fs, dir: repoPath, filepath });
        } else {
          await git.remove({ fs, dir: repoPath, filepath });
        }
      }
    } else {
      // Stage all changes
      const status = await git.statusMatrix({ fs, dir: repoPath });
      for (const [filepath, , workdir] of status) {
        if (workdir === 0) {
          await git.remove({ fs, dir: repoPath, filepath });
        } else {
          await git.add({ fs, dir: repoPath, filepath });
        }
      }
    }
  }

  async unstageFiles(repoName: string, paths?: string[]): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    // Reset the index to HEAD for the specified paths
    const filepaths = paths ?? undefined;

    // isomorphic-git doesn't have a direct unstage, so we re-checkout from HEAD
    // This resets the index to match HEAD
    const status = await git.statusMatrix({ fs, dir: repoPath, filepaths });

    for (const [filepath, head] of status) {
      if (head === 0) {
        // File was added, remove from index
        await git.remove({ fs, dir: repoPath, filepath });
      } else {
        // Reset to HEAD
        await git.checkout({ fs, dir: repoPath, ref: "HEAD", filepaths: [filepath], force: false });
      }
    }
  }

  // ===========================================================================
  // Branch Operations
  // ===========================================================================

  async getCurrentBranch(repoName: string): Promise<string> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const branch = await git.currentBranch({ fs, dir: repoPath });
    return branch ?? this.defaultBranch;
  }

  async listBranches(repoName: string): Promise<Branch[]> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const currentBranch = await git.currentBranch({ fs, dir: repoPath });
    const branches = await git.listBranches({ fs, dir: repoPath });

    const result: Branch[] = [];

    for (const name of branches) {
      try {
        const sha = await git.resolveRef({
          fs,
          dir: repoPath,
          ref: `refs/heads/${name}`,
        });

        result.push({
          name,
          ref: `refs/heads/${name}`,
          sha,
          current: name === currentBranch,
        });
      } catch {
        // Ignore branches we can't resolve
      }
    }

    return result;
  }

  async createBranch(repoName: string, branchName: string, ref = "HEAD"): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    await git.branch({
      fs,
      dir: repoPath,
      ref: branchName,
      object: ref,
    });
  }

  async deleteBranch(repoName: string, branchName: string): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    await git.deleteBranch({
      fs,
      dir: repoPath,
      ref: branchName,
    });
  }

  async checkout(repoName: string, ref: string): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    await git.checkout({
      fs,
      dir: repoPath,
      ref,
    });
  }

  // ===========================================================================
  // Remote Operations (Optional - for future GitHub sync)
  // ===========================================================================

  async listRemotes(repoName: string): Promise<Remote[]> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const remotes = await git.listRemotes({ fs, dir: repoPath });

    return remotes.map((r) => ({
      name: r.remote,
      fetchUrl: r.url,
      pushUrl: r.url, // isomorphic-git doesn't distinguish push URL
    }));
  }

  async addRemote(repoName: string, remoteName: string, url: string): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    await git.addRemote({
      fs,
      dir: repoPath,
      remote: remoteName,
      url,
    });
  }

  async removeRemote(repoName: string, remoteName: string): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    await git.deleteRemote({
      fs,
      dir: repoPath,
      remote: remoteName,
    });
  }

  async push(repoName: string, options?: SyncOptions): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const pushOptions: Parameters<typeof git.push>[0] = {
      fs,
      http: this.http,
      dir: repoPath,
      remote: options?.remote ?? "origin",
      ref: options?.branch,
      force: options?.force,
    };

    // Add authentication
    if (options?.auth) {
      if (options.auth.token) {
        pushOptions.onAuth = () => ({
          username: options.auth!.token!,
          password: "x-oauth-basic",
        });
      } else if (options.auth.username && options.auth.password) {
        pushOptions.onAuth = () => ({
          username: options.auth!.username!,
          password: options.auth!.password!,
        });
      }
    }

    // Add progress callback
    if (options?.onProgress) {
      pushOptions.onProgress = (event) => {
        options.onProgress!({
          phase: event.phase as "counting" | "compressing" | "writing" | "done",
          loaded: event.loaded,
          total: event.total ?? 0,
          percent: event.total ? Math.round((event.loaded / event.total) * 100) : 0,
        });
      };
    }

    await git.push(pushOptions);
  }

  async pull(repoName: string, options?: SyncOptions): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const pullOptions: Parameters<typeof git.pull>[0] = {
      fs,
      http: this.http,
      dir: repoPath,
      remote: options?.remote ?? "origin",
      ref: options?.branch,
      author: {
        name: this.defaultAuthor.name,
        email: this.defaultAuthor.email,
      },
    };

    // Add authentication
    if (options?.auth) {
      if (options.auth.token) {
        pullOptions.onAuth = () => ({
          username: options.auth!.token!,
          password: "x-oauth-basic",
        });
      } else if (options.auth.username && options.auth.password) {
        pullOptions.onAuth = () => ({
          username: options.auth!.username!,
          password: options.auth!.password!,
        });
      }
    }

    // Add progress callback
    if (options?.onProgress) {
      pullOptions.onProgress = (event) => {
        options.onProgress!({
          phase: event.phase as "counting" | "compressing" | "writing" | "done",
          loaded: event.loaded,
          total: event.total ?? 0,
          percent: event.total ? Math.round((event.loaded / event.total) * 100) : 0,
        });
      };
    }

    await git.pull(pullOptions);
  }

  async fetch(repoName: string, options?: SyncOptions): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const fetchOptions: Parameters<typeof git.fetch>[0] = {
      fs,
      http: this.http,
      dir: repoPath,
      remote: options?.remote ?? "origin",
      ref: options?.branch,
    };

    // Add authentication
    if (options?.auth) {
      if (options.auth.token) {
        fetchOptions.onAuth = () => ({
          username: options.auth!.token!,
          password: "x-oauth-basic",
        });
      } else if (options.auth.username && options.auth.password) {
        fetchOptions.onAuth = () => ({
          username: options.auth!.username!,
          password: options.auth!.password!,
        });
      }
    }

    // Add progress callback
    if (options?.onProgress) {
      fetchOptions.onProgress = (event) => {
        options.onProgress!({
          phase: event.phase as "counting" | "compressing" | "writing" | "done",
          loaded: event.loaded,
          total: event.total ?? 0,
          percent: event.total ? Math.round((event.loaded / event.total) * 100) : 0,
        });
      };
    }

    await git.fetch(fetchOptions);
  }

  // ===========================================================================
  // Diff Operations
  // ===========================================================================

  async getDiff(
    repoName: string,
    options?: { from?: string; to?: string; paths?: string[] }
  ): Promise<Diff> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const from = options?.from ?? "HEAD";
    const to = options?.to; // undefined means working tree

    const diff: Diff = {
      added: [],
      modified: [],
      deleted: [],
      renamed: [],
    };

    // Use statusMatrix for working tree comparison
    if (!to) {
      const matrix = await git.statusMatrix({
        fs,
        dir: repoPath,
        filepaths: options?.paths,
      });

      for (const [filepath, head, workdir] of matrix) {
        if (head === 0 && workdir === 2) {
          diff.added.push(filepath);
        } else if (head === 1 && workdir === 0) {
          diff.deleted.push(filepath);
        } else if (head === 1 && workdir === 2) {
          diff.modified.push(filepath);
        }
      }
    } else {
      // Compare two commits
      // This is a simplified implementation - full diff would require tree walking
      const fromTree = await this.getTreeFiles(repoPath, from);
      const toTree = await this.getTreeFiles(repoPath, to);

      const fromSet = new Set(fromTree.map((f) => f.path));
      const toSet = new Set(toTree.map((f) => f.path));

      for (const file of toTree) {
        if (!fromSet.has(file.path)) {
          diff.added.push(file.path);
        } else {
          const fromFile = fromTree.find((f) => f.path === file.path);
          if (fromFile && fromFile.sha !== file.sha) {
            diff.modified.push(file.path);
          }
        }
      }

      for (const file of fromTree) {
        if (!toSet.has(file.path)) {
          diff.deleted.push(file.path);
        }
      }
    }

    return diff;
  }

  private async getTreeFiles(repoPath: string, ref: string): Promise<Array<{ path: string; sha: string }>> {
    const files: Array<{ path: string; sha: string }> = [];

    const walk = async (treeSha: string, prefix: string) => {
      const { tree } = await git.readTree({ fs, dir: repoPath, oid: treeSha });

      for (const entry of tree) {
        const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path;

        if (entry.type === "blob") {
          files.push({ path: fullPath, sha: entry.oid });
        } else if (entry.type === "tree") {
          await walk(entry.oid, fullPath);
        }
      }
    };

    try {
      const sha = await git.resolveRef({ fs, dir: repoPath, ref });
      const { commit } = await git.readCommit({ fs, dir: repoPath, oid: sha });
      await walk(commit.tree, "");
    } catch {
      // Return empty if ref doesn't exist
    }

    return files;
  }

  async getFileDiff(
    repoName: string,
    filePath: string,
    options?: { from?: string; to?: string }
  ): Promise<FileDiff | null> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const from = options?.from ?? "HEAD";
    const to = options?.to;

    let fromContent: string | null = null;
    let toContent: string | null = null;

    // Get "from" content
    try {
      const sha = await git.resolveRef({ fs, dir: repoPath, ref: from });
      const { blob } = await git.readBlob({
        fs,
        dir: repoPath,
        oid: sha,
        filepath: filePath,
      });
      fromContent = new TextDecoder().decode(blob);
    } catch {
      // File doesn't exist in "from"
    }

    // Get "to" content
    if (to) {
      try {
        const sha = await git.resolveRef({ fs, dir: repoPath, ref: to });
        const { blob } = await git.readBlob({
          fs,
          dir: repoPath,
          oid: sha,
          filepath: filePath,
        });
        toContent = new TextDecoder().decode(blob);
      } catch {
        // File doesn't exist in "to"
      }
    } else {
      // Working tree
      const fullPath = path.join(repoPath, filePath);
      if (fs.existsSync(fullPath)) {
        toContent = fs.readFileSync(fullPath, "utf8");
      }
    }

    // Determine type
    let type: FileDiff["type"];
    if (fromContent === null && toContent !== null) {
      type = "add";
    } else if (fromContent !== null && toContent === null) {
      type = "delete";
    } else if (fromContent !== null && toContent !== null) {
      type = "modify";
    } else {
      return null; // File doesn't exist in either
    }

    // Generate hunks based on file type
    let hunks: DiffHunk[] = [];
    
    if (type === "add" && toContent) {
      // New file - entire content is additions
      hunks = createAddedFileHunks(toContent);
    } else if (type === "delete" && fromContent) {
      // Deleted file - entire content is deletions
      hunks = createDeletedFileHunks(fromContent);
    } else if (type === "modify" && fromContent && toContent) {
      // Modified file - compute diff using git diff
      // Use exec to get unified diff from git
      try {
        const { execSync } = await import("child_process");
        const diffOutput = execSync(
          `git diff --no-color HEAD -- "${filePath}"`,
          { 
            cwd: repoPath, 
            encoding: "utf-8",
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          }
        );
        hunks = parseUnifiedDiff(diffOutput);
      } catch {
        // Fallback: simple line-by-line comparison
        // This creates a basic hunk showing all changes
        const fromLines = fromContent.split("\n");
        const toLines = toContent.split("\n");
        
        // Remove trailing empty lines
        while (fromLines.length > 0 && fromLines[fromLines.length - 1] === "") {
          fromLines.pop();
        }
        while (toLines.length > 0 && toLines[toLines.length - 1] === "") {
          toLines.pop();
        }
        
        hunks = [{
          oldStart: 1,
          oldLines: fromLines.length,
          newStart: 1,
          newLines: toLines.length,
          lines: [
            ...fromLines.map((line, i) => ({
              type: "deletion" as const,
              content: line,
              oldLineNumber: i + 1,
            })),
            ...toLines.map((line, i) => ({
              type: "addition" as const,
              content: line,
              newLineNumber: i + 1,
            })),
          ],
        }];
      }
    }

    // Count additions and deletions from hunks
    const { additions, deletions } = countChanges(hunks);

    return {
      path: filePath,
      type,
      additions,
      deletions,
      hunks,
    };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  async getConfig(repoName: string): Promise<GitConfig> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    const config: GitConfig = {};

    try {
      config.userName = await git.getConfig({
        fs,
        dir: repoPath,
        path: "user.name",
      });
    } catch {
      // Config not set
    }

    try {
      config.userEmail = await git.getConfig({
        fs,
        dir: repoPath,
        path: "user.email",
      });
    } catch {
      // Config not set
    }

    return config;
  }

  async setConfig(repoName: string, config: Partial<GitConfig>): Promise<void> {
    const repoPath = this.getRepoPath(repoName);

    if (!(await this.repoExists(repoName))) {
      throw new Error(`Repository '${repoName}' not found`) as GitError;
    }

    if (config.userName) {
      await git.setConfig({
        fs,
        dir: repoPath,
        path: "user.name",
        value: config.userName,
      });
    }

    if (config.userEmail) {
      await git.setConfig({
        fs,
        dir: repoPath,
        path: "user.email",
        value: config.userEmail,
      });
    }

    if (config.defaultBranch) {
      await git.setConfig({
        fs,
        dir: repoPath,
        path: "init.defaultBranch",
        value: config.defaultBranch,
      });
    }
  }
}
