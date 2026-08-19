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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect new file: "+++ b/path/to/file"
    if (line.startsWith("+++ b/")) {
      // Save previous file if any
      if (currentFile !== null) {
        files.push({ file: currentFile, addedLines: currentAddedLines });
      }
      currentFile = line.substring(6); // strip "+++ b/"
      currentAddedLines = [];
      currentNewLineNumber = 0;
      continue;
    }

    // Also detect "+++ /dev/null" (deleted files — skip)
    if (line.startsWith("+++ /dev/null")) {
      if (currentFile !== null) {
        files.push({ file: currentFile, addedLines: currentAddedLines });
      }
      currentFile = null;
      currentAddedLines = [];
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
      line.startsWith("diff --git") ||
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

    if (currentFile === null) continue;

    // Added line: starts with "+"
    if (line.startsWith("+")) {
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

    // Context line: starts with " " (increment new line number but don't capture)
    if (line.startsWith(" ") || line === "") {
      currentNewLineNumber++;
      continue;
    }

    // "\ No newline at end of file" — ignore
    if (line.startsWith("\\")) continue;

    // Any other line — might be part of context, increment line number
    currentNewLineNumber++;
  }

  // Save the last file
  if (currentFile !== null) {
    files.push({ file: currentFile, addedLines: currentAddedLines });
  }

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
  return entries.filter(
    (e) => e.file && Array.isArray(e.addedLines)
  );
}
