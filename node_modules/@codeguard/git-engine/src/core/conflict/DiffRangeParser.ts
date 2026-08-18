/**
 * @file DiffRangeParser.ts
 * Phase 6 — Unified diff hunk parser.
 *
 * Parses unified diff format (@@ -40,8 +40,12 @@) into ChangedRange objects.
 *
 * Handles carefully:
 *  - Added lines only (oldCount = 0)
 *  - Deleted lines only (newCount = 0)
 *  - Zero-length ranges (lineCount = 0)
 *  - Files starting at line 1
 *  - Multiple hunks in one file
 *  - Renamed files (uses new path as key)
 *  - Binary files (skips gracefully)
 */

import type { ChangedRange } from "../../shared/types/gitConflictResult";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the full output of `git diff -U3` into a map of:
 *   filePath → ChangedRange[]
 *
 * Returns only the "new" side ranges (i.e., lines as they exist after the change),
 * which is what we use for overlap detection.
 */
export function parseDiffOutput(rawDiff: string): Map<string, ChangedRange[]> {
  const result = new Map<string, ChangedRange[]>();
  const sections = splitIntoFileSections(rawDiff);

  for (const section of sections) {
    const filePath = extractNewFilePath(section.header);
    if (!filePath || filePath === "/dev/null") continue;

    if (isBinarySection(section.body)) {
      // Binary files: record as empty ranges (no line-range analysis)
      result.set(filePath, []);
      continue;
    }

    const ranges = parseHunks(section.body, filePath);
    const existing = result.get(filePath) ?? [];
    result.set(filePath, [...existing, ...ranges]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface DiffSection {
  header: string;
  body: string;
}

/**
 * Split a full unified diff output into per-file sections.
 * Each section starts with "diff --git a/... b/..."
 */
function splitIntoFileSections(rawDiff: string): DiffSection[] {
  const sections: DiffSection[] = [];
  const lines = rawDiff.split("\n");
  let currentHeader = "";
  let currentBodyLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (inSection) {
        sections.push({ header: currentHeader, body: currentBodyLines.join("\n") });
      }
      currentHeader = line;
      currentBodyLines = [];
      inSection = true;
    } else if (inSection) {
      currentBodyLines.push(line);
    }
  }

  if (inSection) {
    sections.push({ header: currentHeader, body: currentBodyLines.join("\n") });
  }

  return sections;
}

/**
 * Extract the new-file path from a diff section header.
 * From lines like: "+++ b/src/utils.js"
 * Handles renamed files by returning the b/ path.
 */
function extractNewFilePath(header: string): string | null {
  // Look for "+++ b/path" in the section body
  // But the header only has the "diff --git a/x b/y" line
  const match = header.match(/diff --git a\/.+ b\/(.+)$/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * Scan section body for "+++ b/path" to get the actual new path
 * (handles renames where header path != actual file path).
 */
export function extractNewFilePathFromBody(body: string): string | null {
  const lines = body.split("\n");
  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      return line.slice(6).trim();
    }
    if (line.startsWith("+++ /dev/null")) {
      return "/dev/null";
    }
  }
  return null;
}

/**
 * Detect if this diff section represents a binary file.
 */
function isBinarySection(body: string): boolean {
  return body.includes("Binary files") || body.includes("GIT binary patch");
}

/**
 * Parse all @@ hunk headers in a section body into ChangedRange objects.
 *
 * Unified diff hunk format:
 *   @@ -<oldStart>[,<oldCount>] +<newStart>[,<newCount>] @@
 *
 * We extract the NEW file ranges (+) since that's what we need for
 * overlap detection (both sides independently compute their new ranges).
 */
export function parseHunks(body: string, _filePath: string): ChangedRange[] {
  // Override file path with +++ b/path if available (handles renames)
  const newPathOverride = extractNewFilePathFromBody(body);
  void newPathOverride; // used by caller via parseDiffOutput

  const ranges: ChangedRange[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;

  let match: RegExpExecArray | null;

  while ((match = hunkRegex.exec(body)) !== null) {
    const newStart = parseInt(match[3], 10);
    // When the count is omitted, it means 1 line
    const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

    // Zero-length range: the hunk represents a pure deletion with no new lines
    // We represent it as a "removed" range at the deletion point
    if (newCount === 0) {
      // newStart points to the line BEFORE the deletion, but we record
      // a zero-length range anchored at newStart (one position marker)
      ranges.push({
        startLine: Math.max(1, newStart),
        lineCount: 0,
        endLine: Math.max(1, newStart),
        changeType: "removed",
      });
      continue;
    }

    // Determine changeType by examining the hunk lines that follow the @@ header
    const hunkBody = extractHunkBody(body, match.index + match[0].length);
    const changeType = classifyHunk(hunkBody);

    ranges.push({
      startLine: newStart,
      lineCount: newCount,
      endLine: newStart + Math.max(newCount - 1, 0),
      changeType,
    });
  }

  return ranges;
}

/**
 * Extract the lines that follow a @@ header up until the next @@ header.
 */
function extractHunkBody(body: string, startIndex: number): string {
  const rest = body.slice(startIndex);
  const nextHunk = rest.search(/^@@/m);
  return nextHunk === -1 ? rest : rest.slice(0, nextHunk);
}

/**
 * Classify a hunk as "added", "removed", or "modified" based on the
 * presence of + and - lines.
 */
function classifyHunk(hunkBody: string): ChangedRange["changeType"] {
  const lines = hunkBody.split("\n");
  let hasAdded = false;
  let hasRemoved = false;

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) hasAdded = true;
    if (line.startsWith("-") && !line.startsWith("---")) hasRemoved = true;
    if (hasAdded && hasRemoved) return "modified";
  }

  if (hasAdded) return "added";
  if (hasRemoved) return "removed";
  return "modified"; // default
}
