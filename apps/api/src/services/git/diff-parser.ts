/**
 * Diff Parser Utility
 * 
 * Parses unified diff format into structured hunks and lines for rich UI display.
 * This utility handles Git's unified diff output format.
 */

import type { DiffHunk, DiffLine } from "./types";

/**
 * Parse a unified diff string into structured hunks
 * 
 * @param unifiedDiff - The raw unified diff output from git
 * @returns Array of DiffHunk objects with structured line information
 */
export function parseUnifiedDiff(unifiedDiff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = unifiedDiff.split("\n");

  let currentHunk: DiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  for (const line of lines) {
    // Skip file headers (--- and +++ lines)
    if (line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }

    // Skip index and other metadata lines
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("Binary") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to")
    ) {
      continue;
    }

    // Parse hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      // Save previous hunk if exists
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      const oldStart = parseInt(hunkMatch[1] ?? "0", 10);
      const oldLines = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3] ?? "0", 10);
      const newLines = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

      currentHunk = {
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      };

      oldLineNumber = oldStart;
      newLineNumber = newStart;
      continue;
    }

    // If we're not in a hunk, skip this line
    if (!currentHunk) {
      continue;
    }

    // Parse diff line content
    if (line.startsWith("+")) {
      // Addition
      const diffLine: DiffLine = {
        type: "addition",
        content: line.substring(1),
        newLineNumber: newLineNumber++,
      };
      currentHunk.lines.push(diffLine);
    } else if (line.startsWith("-")) {
      // Deletion
      const diffLine: DiffLine = {
        type: "deletion",
        content: line.substring(1),
        oldLineNumber: oldLineNumber++,
      };
      currentHunk.lines.push(diffLine);
    } else if (line.startsWith(" ") || line === "") {
      // Context line (or empty context)
      const diffLine: DiffLine = {
        type: "context",
        content: line.startsWith(" ") ? line.substring(1) : line,
        oldLineNumber: oldLineNumber++,
        newLineNumber: newLineNumber++,
      };
      currentHunk.lines.push(diffLine);
    }
    // Lines starting with \ (e.g., "\ No newline at end of file") are ignored
  }

  // Don't forget the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Count additions and deletions in hunks
 */
export function countChanges(hunks: DiffHunk[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "addition") {
        additions++;
      } else if (line.type === "deletion") {
        deletions++;
      }
    }
  }

  return { additions, deletions };
}

/**
 * Create hunks for a newly added file (entire file is additions)
 */
export function createAddedFileHunks(content: string): DiffHunk[] {
  const lines = content.split("\n");
  
  // Handle empty file
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    return [];
  }

  // Remove trailing empty line if it exists (git typically adds this)
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  const hunk: DiffHunk = {
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: lines.length,
    lines: lines.map((line, index) => ({
      type: "addition" as const,
      content: line,
      newLineNumber: index + 1,
    })),
  };

  return [hunk];
}

/**
 * Create hunks for a deleted file (entire file is deletions)
 */
export function createDeletedFileHunks(content: string): DiffHunk[] {
  const lines = content.split("\n");
  
  // Handle empty file
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    return [];
  }

  // Remove trailing empty line if it exists
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  const hunk: DiffHunk = {
    oldStart: 1,
    oldLines: lines.length,
    newStart: 0,
    newLines: 0,
    lines: lines.map((line, index) => ({
      type: "deletion" as const,
      content: line,
      oldLineNumber: index + 1,
    })),
  };

  return [hunk];
}

/**
 * Generate a unified diff string from two content strings
 * This is a simplified implementation for basic diffing
 */
export function generateSimpleDiff(
  oldContent: string | null,
  newContent: string | null,
  filePath: string
): string {
  const oldLines = oldContent?.split("\n") ?? [];
  const newLines = newContent?.split("\n") ?? [];

  const header = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  // Simple line-by-line diff (not optimal, but works for small files)
  // For production, consider using a proper diff algorithm like Myers
  const diffLines: string[] = [];

  const maxLines = Math.max(oldLines.length, newLines.length);
  let hunkStart = -1;
  let hunkLines: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = i < newLines.length ? newLines[i] : null;

    if (oldLine === newLine) {
      // Context line
      if (hunkStart >= 0) {
        hunkLines.push(` ${oldLine ?? ""}`);
      }
    } else {
      // Start new hunk if needed
      if (hunkStart < 0) {
        hunkStart = Math.max(0, i - 3); // Include 3 lines of context before
        // Add context before
        for (let j = hunkStart; j < i; j++) {
          if (j < oldLines.length) {
            hunkLines.push(` ${oldLines[j]}`);
          }
        }
      }

      if (oldLine !== null && (newLine === null || oldLine !== newLine)) {
        hunkLines.push(`-${oldLine}`);
      }
      if (newLine !== null && (oldLine === null || oldLine !== newLine)) {
        hunkLines.push(`+${newLine}`);
      }
    }
  }

  if (hunkLines.length > 0) {
    const oldStart = hunkStart + 1;
    const newStart = hunkStart + 1;
    const oldCount = hunkLines.filter(l => l.startsWith(" ") || l.startsWith("-")).length;
    const newCount = hunkLines.filter(l => l.startsWith(" ") || l.startsWith("+")).length;
    
    diffLines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    diffLines.push(...hunkLines);
  }

  return [...header, ...diffLines].join("\n");
}
