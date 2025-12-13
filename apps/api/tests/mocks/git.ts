/**
 * Git Service Mock
 *
 * Provides a mock implementation of the Git backend for testing.
 * Uses in-memory data structures instead of actual filesystem operations.
 */

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
  Branch,
} from '../../src/services/git/types';
import type { GitBackend } from '../../src/services/git/index';

// =============================================================================
// Types
// =============================================================================

export interface MockRepoData {
  name: string;
  path: string;
  created: Date;
  currentBranch: string;
  branches: string[];
  commits: MockCommitData[];
  files: Map<string, string>; // path -> content
  stagedFiles: Set<string>;
  modifiedFiles: Set<string>;
  deletedFiles: Set<string>;
}

export interface MockCommitData {
  sha: string;
  message: string;
  author: Author;
  date: Date;
  parent?: string;
}

// =============================================================================
// Mock State
// =============================================================================

let mockRepos: Map<string, MockRepoData> = new Map();
let nextCommitId = 1;

// Track method calls for assertions
export const mockCalls = {
  createRepo: [] as Array<{ name: string; options?: CreateRepoOptions }>,
  cloneRepo: [] as Array<{ url: string; name: string; options?: CloneOptions }>,
  getRepo: [] as string[],
  deleteRepo: [] as string[],
  listRepos: [] as number[],
  commit: [] as Array<{ repoName: string; options: CommitOptions }>,
  getLog: [] as Array<{ repoName: string; options?: { limit?: number; ref?: string } }>,
  listFiles: [] as Array<{ repoName: string; path?: string }>,
  readFile: [] as Array<{ repoName: string; path: string }>,
  writeFile: [] as Array<{ repoName: string; path: string; content: string }>,
  deleteFile: [] as Array<{ repoName: string; path: string }>,
  getStatus: [] as Array<{ repoName: string; paths?: string[] }>,
  stageFiles: [] as Array<{ repoName: string; paths?: string[] }>,
  createBranch: [] as Array<{ repoName: string; branchName: string }>,
  checkout: [] as Array<{ repoName: string; ref: string }>,
};

// =============================================================================
// Reset Function
// =============================================================================

/**
 * Reset all mock state - call this in beforeEach
 */
export function resetGitMock(): void {
  mockRepos = new Map();
  nextCommitId = 1;

  // Reset call tracking
  Object.keys(mockCalls).forEach((key) => {
    (mockCalls as Record<string, unknown[]>)[key] = [];
  });
}

// =============================================================================
// Mock Configuration Functions
// =============================================================================

/**
 * Add a mock repository
 */
export function addMockRepo(data: Partial<MockRepoData> & { name: string }): MockRepoData {
  const repo: MockRepoData = {
    name: data.name,
    path: data.path ?? `/data/repos/${data.name}`,
    created: data.created ?? new Date(),
    currentBranch: data.currentBranch ?? 'main',
    branches: data.branches ?? ['main'],
    commits: data.commits ?? [],
    files: data.files ?? new Map(),
    stagedFiles: data.stagedFiles ?? new Set(),
    modifiedFiles: data.modifiedFiles ?? new Set(),
    deletedFiles: data.deletedFiles ?? new Set(),
  };
  mockRepos.set(data.name, repo);
  return repo;
}

/**
 * Add a file to a mock repository
 */
export function addMockRepoFile(repoName: string, path: string, content: string): void {
  const repo = mockRepos.get(repoName);
  if (repo) {
    repo.files.set(path, content);
  }
}

/**
 * Get a mock repository
 */
export function getMockRepo(name: string): MockRepoData | undefined {
  return mockRepos.get(name);
}

/**
 * Generate a mock commit SHA
 */
function generateCommitSha(): string {
  const sha = `commit-${nextCommitId.toString().padStart(8, '0')}`;
  nextCommitId++;
  return sha;
}

// =============================================================================
// Mock Git Backend Implementation
// =============================================================================

export class MockGitBackend implements GitBackend {
  private reposDir: string;
  private defaultAuthor: Author;

  constructor(config?: { reposDir?: string; defaultAuthor?: Author }) {
    this.reposDir = config?.reposDir ?? '/data/repos';
    this.defaultAuthor = config?.defaultAuthor ?? {
      name: 'Test User',
      email: 'test@example.com',
    };
  }

  // ===========================================================================
  // Repository Lifecycle
  // ===========================================================================

  async createRepo(name: string, options?: CreateRepoOptions): Promise<Repository> {
    mockCalls.createRepo.push({ name, options });

    if (mockRepos.has(name)) {
      throw new Error(`Repository already exists: ${name}`);
    }

    const repo = addMockRepo({
      name,
      currentBranch: options?.defaultBranch ?? 'main',
    });

    // Create initial commit if requested
    if (options?.initialCommit !== false) {
      repo.commits.push({
        sha: generateCommitSha(),
        message: 'Initial commit',
        author: this.defaultAuthor,
        date: new Date(),
      });
    }

    return this.toRepository(repo);
  }

  async cloneRepo(url: string, name: string, options?: CloneOptions): Promise<Repository> {
    mockCalls.cloneRepo.push({ url, name, options });

    if (mockRepos.has(name)) {
      throw new Error(`Repository already exists: ${name}`);
    }

    // Simulate cloning by creating a repo with some files
    const repo = addMockRepo({
      name,
      currentBranch: options?.branch ?? 'main',
    });

    // Add mock README
    repo.files.set('README.md', `# ${name}\n\nCloned from ${url}`);

    // Add initial commit
    repo.commits.push({
      sha: generateCommitSha(),
      message: 'Initial commit from clone',
      author: this.defaultAuthor,
      date: new Date(),
    });

    return this.toRepository(repo);
  }

  async getRepo(name: string): Promise<Repository | null> {
    mockCalls.getRepo.push(name);
    const repo = mockRepos.get(name);
    return repo ? this.toRepository(repo) : null;
  }

  async deleteRepo(name: string): Promise<void> {
    mockCalls.deleteRepo.push(name);
    if (!mockRepos.has(name)) {
      throw new Error(`Repository not found: ${name}`);
    }
    mockRepos.delete(name);
  }

  async listRepos(): Promise<Repository[]> {
    mockCalls.listRepos.push(1);
    return Array.from(mockRepos.values()).map((r) => this.toRepository(r));
  }

  async repoExists(name: string): Promise<boolean> {
    return mockRepos.has(name);
  }

  // ===========================================================================
  // Commit Operations
  // ===========================================================================

  async commit(repoName: string, options: CommitOptions): Promise<string> {
    mockCalls.commit.push({ repoName, options });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    const sha = generateCommitSha();
    const lastCommit = repo.commits[repo.commits.length - 1];

    repo.commits.push({
      sha,
      message: options.message,
      author: options.author ?? this.defaultAuthor,
      date: new Date(),
      parent: lastCommit?.sha,
    });

    // Clear staged files
    repo.stagedFiles.clear();
    repo.modifiedFiles.clear();
    repo.deletedFiles.clear();

    return sha;
  }

  async getLog(
    repoName: string,
    options?: { limit?: number; ref?: string; path?: string }
  ): Promise<Commit[]> {
    mockCalls.getLog.push({ repoName, options });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    let commits = [...repo.commits].reverse(); // newest first

    if (options?.limit) {
      commits = commits.slice(0, options.limit);
    }

    return commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      date: c.date,
      parents: c.parent ? [c.parent] : [],
    }));
  }

  async getCommit(repoName: string, sha: string): Promise<Commit | null> {
    const repo = mockRepos.get(repoName);
    if (!repo) {
      return null;
    }

    const commit = repo.commits.find((c) => c.sha === sha);
    if (!commit) {
      return null;
    }

    return {
      sha: commit.sha,
      message: commit.message,
      author: commit.author,
      date: commit.date,
      parents: commit.parent ? [commit.parent] : [],
    };
  }

  // ===========================================================================
  // File Operations
  // ===========================================================================

  async listFiles(repoName: string, path?: string, _ref?: string): Promise<FileEntry[]> {
    mockCalls.listFiles.push({ repoName, path });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    const basePath = path ?? '';
    const entries: FileEntry[] = [];
    const seenDirs = new Set<string>();

    for (const filePath of repo.files.keys()) {
      if (basePath && !filePath.startsWith(basePath)) {
        continue;
      }

      const relativePath = basePath ? filePath.slice(basePath.length + 1) : filePath;
      const parts = relativePath.split('/');

      if (parts.length === 1) {
        // Direct file
        entries.push({
          name: parts[0],
          path: filePath,
          type: 'file',
          mode: '100644',
        });
      } else if (!seenDirs.has(parts[0])) {
        // Directory
        seenDirs.add(parts[0]);
        entries.push({
          name: parts[0],
          path: `${basePath}/${parts[0]}`.replace(/^\//, ''),
          type: 'directory',
          mode: '040000',
        });
      }
    }

    return entries;
  }

  async readFile(repoName: string, path: string, _ref?: string): Promise<FileContent | null> {
    mockCalls.readFile.push({ repoName, path });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    const content = repo.files.get(path);
    if (content === undefined) {
      return null;
    }

    return {
      content,
      encoding: 'utf-8',
      size: content.length,
      sha: 'mock-sha',
    };
  }

  async writeFile(repoName: string, path: string, content: string): Promise<void> {
    mockCalls.writeFile.push({ repoName, path, content });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    const isNew = !repo.files.has(path);
    repo.files.set(path, content);

    if (isNew) {
      repo.stagedFiles.add(path);
    } else {
      repo.modifiedFiles.add(path);
    }
  }

  async deleteFile(repoName: string, path: string): Promise<void> {
    mockCalls.deleteFile.push({ repoName, path });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    repo.files.delete(path);
    repo.deletedFiles.add(path);
  }

  async getStatus(repoName: string, _paths?: string[]): Promise<FileStatus[]> {
    mockCalls.getStatus.push({ repoName, paths: _paths });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    const statuses: FileStatus[] = [];

    for (const path of repo.stagedFiles) {
      statuses.push({
        path,
        staged: true,
        status: 'added',
      });
    }

    for (const path of repo.modifiedFiles) {
      statuses.push({
        path,
        staged: false,
        status: 'modified',
      });
    }

    for (const path of repo.deletedFiles) {
      statuses.push({
        path,
        staged: false,
        status: 'deleted',
      });
    }

    return statuses;
  }

  async stageFiles(repoName: string, paths?: string[]): Promise<void> {
    mockCalls.stageFiles.push({ repoName, paths });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    if (paths) {
      for (const path of paths) {
        if (repo.modifiedFiles.has(path)) {
          repo.modifiedFiles.delete(path);
          repo.stagedFiles.add(path);
        }
      }
    } else {
      // Stage all
      for (const path of repo.modifiedFiles) {
        repo.stagedFiles.add(path);
      }
      repo.modifiedFiles.clear();
    }
  }

  async unstageFiles(repoName: string, paths?: string[]): Promise<void> {
    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    if (paths) {
      for (const path of paths) {
        if (repo.stagedFiles.has(path)) {
          repo.stagedFiles.delete(path);
          repo.modifiedFiles.add(path);
        }
      }
    } else {
      for (const path of repo.stagedFiles) {
        repo.modifiedFiles.add(path);
      }
      repo.stagedFiles.clear();
    }
  }

  // ===========================================================================
  // Branch Operations
  // ===========================================================================

  async getCurrentBranch(repoName: string): Promise<string> {
    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }
    return repo.currentBranch;
  }

  async listBranches(repoName: string): Promise<Branch[]> {
    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    return repo.branches.map((name) => ({
      name,
      current: name === repo.currentBranch,
      sha: repo.commits[repo.commits.length - 1]?.sha ?? 'initial',
    }));
  }

  async createBranch(repoName: string, branchName: string, _ref?: string): Promise<void> {
    mockCalls.createBranch.push({ repoName, branchName });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    if (repo.branches.includes(branchName)) {
      throw new Error(`Branch already exists: ${branchName}`);
    }

    repo.branches.push(branchName);
  }

  async deleteBranch(repoName: string, branchName: string): Promise<void> {
    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    if (branchName === repo.currentBranch) {
      throw new Error('Cannot delete current branch');
    }

    repo.branches = repo.branches.filter((b) => b !== branchName);
  }

  async checkout(repoName: string, ref: string): Promise<void> {
    mockCalls.checkout.push({ repoName, ref });

    const repo = mockRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    if (!repo.branches.includes(ref)) {
      throw new Error(`Branch not found: ${ref}`);
    }

    repo.currentBranch = ref;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private toRepository(data: MockRepoData): Repository {
    return {
      name: data.name,
      path: data.path,
      created: data.created,
      currentBranch: data.currentBranch,
      remotes: [],
      headCommit: data.commits[data.commits.length - 1]?.sha,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a mock Git backend instance
 */
export function createMockGitBackend(config?: {
  reposDir?: string;
  defaultAuthor?: Author;
}): MockGitBackend {
  return new MockGitBackend(config);
}
