/**
 * @file diffParser.ts
 * @description Lightweight unified diff content parser.
 *
 * Extracts {file, addedLines: [{lineNumber, content}]} from raw unified diff text.
 * This complements Member 1's DiffRangeParser which gives ranges but not line content.
 * Our security scanners need the actual text of added lines to detect patterns.
 */

import type { DiffFileEntry, AddedLine } from "../schema/securityRisk.types";

/**
 * Parse a raw unified diff string into per-file entries with their added lines.
 *
 * Handles standard `git diff` output with `---`/`+++` file headers and
 * `@@` hunk headers. Only extracts lines starting with `+` (added lines),
 * excluding the `+++ b/path` header lines.
 *
 * @param rawDiff - Raw unified diff text (output of `git diff`)
 * @returns Array of DiffFileEntry objects, one per changed file
 */
export function parseUnifiedDiff(rawDiff: string): DiffFileEntry[] {
  if (!rawDiff || rawDiff.trim().length === 0) return [];

  const files: DiffFileEntry[] = [];
  const lines = rawDiff.split("\n");

  let currentFile: string | null = null;
  let currentAddedLines: AddedLine[] = [];
  let currentNewLineNumber = 0;

  const pushCurrentFile = () => {
    if (currentFile !== null && currentAddedLines.length > 0) {
      const existing = files.find((f) => f.file === currentFile);
      if (existing) {
        existing.addedLines.push(...currentAddedLines);
      } else {
        files.push({ file: currentFile, addedLines: currentAddedLines });
      }
    }
    currentAddedLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect git diff header: "diff --git a/path b/path"
    const diffGitMatch = line.match(/^diff --git a\/(.*) b\/(.*)$/);
    if (diffGitMatch) {
      pushCurrentFile();
      currentFile = diffGitMatch[2];
      currentNewLineNumber = 0;
      continue;
    }

    // Detect new file: "+++ b/path/to/file"
    if (line.startsWith("+++ b/")) {
      pushCurrentFile();
      currentFile = line.substring(6); // strip "+++ b/"
      currentNewLineNumber = 0;
      continue;
    }

    // Also detect "+++ /dev/null" (deleted files — skip)
    if (line.startsWith("+++ /dev/null")) {
      pushCurrentFile();
      currentFile = null;
      continue;
    }

    // Skip "--- a/path" lines
    if (line.startsWith("--- ")) continue;

    // Detect hunk header: "@@ -old,count +new,count @@"
    const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunkMatch) {
      currentNewLineNumber = parseInt(hunkMatch[1], 10);
      continue;
    }

    // Skip diff metadata lines
    if (
      line.startsWith("index ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("Binary files")
    ) {
      continue;
    }

    // Added line: starts with "+"
    if (line.startsWith("+")) {
      if (line.startsWith("+++ ")) continue; // Skip header lines
      if (currentFile === null) {
        currentFile = "unknown_file";
        currentNewLineNumber = 1;
      }
      const content = line.substring(1); // strip the leading "+"
      currentAddedLines.push({
        lineNumber: currentNewLineNumber,
        content,
      });
      currentNewLineNumber++;
      continue;
    }

    // Removed line: starts with "-" (don't increment new line number)
    if (line.startsWith("-")) {
      continue;
    }

    // Context line: starts with " " or is empty
    if (line.startsWith(" ") || line === "") {
      if (currentFile !== null) {
        currentNewLineNumber++;
      }
      continue;
    }

    // "\ No newline at end of file" — ignore
    if (line.startsWith("\\")) continue;

    // Any other line — might be part of context
    if (currentFile !== null) {
      currentNewLineNumber++;
    }
  }

  pushCurrentFile();

  return files;
}

/**
 * Parse a pre-structured diff input (array of DiffFileEntry objects).
 * This is a pass-through for when the caller already has the parsed format.
 *
 * @param entries - Already-parsed diff file entries
 * @returns The same entries (validates shape)
 */
export function fromParsedDiff(entries: DiffFileEntry[]): DiffFileEntry[] {
  if (!entries || !Array.isArray(entries)) return [];
  return entries.filter(
    (e) => e && e.file && Array.isArray(e.addedLines)
  );
}
