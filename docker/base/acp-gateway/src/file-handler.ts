/**
 * File Handler
 * 
 * Handles file system operations for ACP agents.
 * Includes security measures to prevent path traversal attacks.
 */

import { join, resolve, relative } from 'path';
import type {
  FsReadTextFileParams,
  FsReadTextFileResult,
  FsWriteTextFileParams,
  FsListDirectoryParams,
  FsListDirectoryResult,
} from './types.ts';

/**
 * File Handler for secure file operations within a working directory.
 */
export class FileHandler {
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = resolve(workingDirectory);
  }

  /**
   * Validate that a path is within the working directory.
   * Prevents path traversal attacks.
   */
  private validatePath(path: string): string {
    // Resolve the full path
    const fullPath = resolve(this.workingDirectory, path);
    
    // Check that the resolved path is within the working directory
    const relativePath = relative(this.workingDirectory, fullPath);
    
    if (relativePath.startsWith('..') || resolve(this.workingDirectory, relativePath) !== fullPath) {
      throw new Error(`Path traversal detected: ${path}`);
    }
    
    return fullPath;
  }

  /**
   * Read a text file.
   */
  async readTextFile(params: FsReadTextFileParams): Promise<FsReadTextFileResult> {
    const fullPath = this.validatePath(params.path);
    
    console.log(`[FileHandler] Reading: ${fullPath}`);
    
    const file = Bun.file(fullPath);
    const exists = await file.exists();
    
    if (!exists) {
      throw new Error(`File not found: ${params.path}`);
    }
    
    const content = await file.text();
    
    return { content };
  }

  /**
   * Write a text file.
   */
  async writeTextFile(params: FsWriteTextFileParams): Promise<void> {
    const fullPath = this.validatePath(params.path);
    
    console.log(`[FileHandler] Writing: ${fullPath}`);
    
    // Ensure parent directory exists
    const parentDir = join(fullPath, '..');
    await Bun.write(fullPath, ''); // This creates parent dirs
    
    // Write the content
    await Bun.write(fullPath, params.content);
  }

  /**
   * List directory contents.
   */
  async listDirectory(params: FsListDirectoryParams): Promise<FsListDirectoryResult> {
    const fullPath = this.validatePath(params.path);
    
    console.log(`[FileHandler] Listing: ${fullPath}`);
    
    const entries: FsListDirectoryResult['entries'] = [];
    
    try {
      const glob = new Bun.Glob('*');
      
      for await (const entry of glob.scan({ cwd: fullPath, onlyFiles: false })) {
        const entryPath = join(fullPath, entry);
        const file = Bun.file(entryPath);
        
        // Check if it's a directory by trying to list it
        try {
          const stat = await Bun.file(entryPath).exists();
          // Simple heuristic: if it has no extension and exists, check if it's a directory
          const isDir = entry.indexOf('.') === -1;
          
          entries.push({
            name: entry,
            type: isDir ? 'directory' : 'file',
          });
        } catch {
          entries.push({
            name: entry,
            type: 'file',
          });
        }
      }
    } catch (error) {
      throw new Error(`Cannot list directory: ${params.path}`);
    }
    
    return { entries };
  }

  /**
   * Check if a file exists.
   */
  async exists(path: string): Promise<boolean> {
    try {
      const fullPath = this.validatePath(path);
      const file = Bun.file(fullPath);
      return await file.exists();
    } catch {
      return false;
    }
  }

  /**
   * Get the working directory.
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}
