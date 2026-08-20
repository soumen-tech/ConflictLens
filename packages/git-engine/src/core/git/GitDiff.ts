/**
 * @file GitDiff.ts
 * Phase 5 — Git diff engine.
 *
 * Diffs each branch against the merge base (NOT against each other directly),
 * detects added/modified/deleted/renamed/binary files, and returns structured
 * ChangedFile objects.
 *
 * The correct diff approach:
 *   mergeBase → branchA changes  (what A changed since the common ancestor)
 *   mergeBase → branchB changes  (what B changed since the common ancestor)
 */

import type { SimpleGit } from "simple-git";
import { throwError } from "./GitErrors";
import { parseDiffOutput } from "../conflict/DiffRangeParser";
import type { ChangedFile } from "../../shared/types/gitConflictResult";

export interface BranchDiffResult {
  /** Files changed on this branch relative to the merge base */
  files: ChangedFile[];
  /** Raw unified diff output (for debugging) */
  rawDiff: string;
}

/**
 * Get all files that differ on `branch` compared to `mergeBase`.
 * Uses: git diff <mergeBase>..<branch> -- with rename detection.
 *
 * This correctly answers: "what did branchA change since the common ancestor?"
 */
export async function getDiffFromMergeBase(
  git: SimpleGit,
  mergeBase: string,
  branch: string
): Promise<BranchDiffResult> {
  try {
    // First pass: get file-level summary (name-status with rename detection)
    const nameStatus = await git.raw([
      "diff",
      "--name-status",
      "-M90%",           // rename detection threshold 90%
      `${mergeBase}..${branch}`,
    ]);

    // Second pass: get full unified diff with line numbers
    const unifiedDiff = await git.raw([
      "diff",
      "-U3",             // 3 lines of context (standard unified diff)
      "-M90%",
      `${mergeBase}..${branch}`,
    ]);

    // Parse the name-status to get file statuses
    const fileStatuses = parseNameStatus(nameStatus);

    // Parse the unified diff to get changed ranges per file
    const rangesByFile = parseDiffOutput(unifiedDiff);

    // Combine into ChangedFile objects
    const files: ChangedFile[] = fileStatuses.map((fs) => {
      const key = fs.newPath ?? fs.path;
      const ranges = rangesByFile.get(key) ?? rangesByFile.get(fs.path) ?? [];
      const additions = ranges.filter((r) => r.changeType === "added").reduce((a, r) => a + r.lineCount, 0);
      const deletions = ranges.filter((r) => r.changeType === "removed").reduce((a, r) => a + r.lineCount, 0);

      return {
        path: fs.newPath ?? fs.path,
        ...(fs.oldPath ? { oldPath: fs.oldPath } : {}),
        status: fs.status,
        additions: fs.additions ?? additions,
        deletions: fs.deletions ?? deletions,
        isBinary: fs.isBinary,
        changesA: [],   // filled by the caller after pairing A and B diffs
        changesB: [],
      };
    });

    return { files, rawDiff: unifiedDiff };
  } catch (err) {
    if ((err as { ConflictLensError?: unknown }).ConflictLensError) throw err;
    throwError("MALFORMED_DIFF", `Failed to compute diff for branch "${branch}"`, err);
  }
}

// ---------------------------------------------------------------------------
// Name-status parser
// ---------------------------------------------------------------------------

interface FileStatusEntry {
  path: string;
  oldPath?: string;
  newPath?: string;
  status: ChangedFile["status"];
  isBinary: boolean;
  additions?: number;
  deletions?: number;
}

/**
 * Parse `git diff --name-status` output into structured entries.
 * Format:
 *   A  path/to/new-file.js          (Added)
 *   M  path/to/changed-file.js      (Modified)
 *   D  path/to/deleted-file.js      (Deleted)
 *   R90 old/path.js new/path.js     (Renamed, 90% similar)
 *   C75 old/path.js new/path.js     (Copied)
 */
function parseNameStatus(nameStatusOutput: string): FileStatusEntry[] {
  const lines = nameStatusOutput.trim().split("\n").filter((l) => l.trim());
  const results: FileStatusEntry[] = [];

  for (const line of lines) {
    const parts = line.split(/\t+/);
    if (parts.length < 2) continue;

    const statusCode = parts[0].toUpperCase();

    if (statusCode.startsWith("R") || statusCode.startsWith("C")) {
      // Rename or copy: 3 parts — statusCode, old path, new path
      if (parts.length < 3) continue;
      results.push({
        path: parts[1],
        oldPath: parts[1],
        newPath: parts[2],
        status: statusCode.startsWith("R") ? "renamed" : "copied",
        isBinary: false,
      });
    } else {
      const statusMap: Record<string, ChangedFile["status"]> = {
        A: "added",
        M: "modified",
        D: "deleted",
      };
      results.push({
        path: parts[1],
        status: statusMap[statusCode] ?? "unknown",
        isBinary: false,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Merge the two diff results into a single ChangedFile[] with A/B ranges filled
// ---------------------------------------------------------------------------

/**
 * Given diff results for branch A and branch B (both relative to merge base),
 * produce a unified ChangedFile[] with changesA and changesB populated.
 */
export function mergeDiffResults(
  diffA: BranchDiffResult,
  diffB: BranchDiffResult,
  mergeBase: string,
  git: SimpleGit
): ChangedFile[] {
  void mergeBase; // reserved for future use
  void git;       // reserved for future use

  const mapA = new Map(diffA.files.map((f) => [f.path, f]));
  const mapB = new Map(diffB.files.map((f) => [f.path, f]));

  // Collect all unique file paths
  const allPaths = new Set([...mapA.keys(), ...mapB.keys()]);

  const result: ChangedFile[] = [];

  for (const p of allPaths) {
    const a = mapA.get(p);
    const b = mapB.get(p);

    // Re-parse ranges now that we know which side each file belongs to
    const changesA = a ? getRangesFromDiff(diffA.rawDiff, p) : [];
    const changesB = b ? getRangesFromDiff(diffB.rawDiff, p) : [];

    const base = a ?? b!;
    result.push({
      ...base,
      changesA,
      changesB,
    });
  }

  return result;
}

function getRangesFromDiff(
  rawDiff: string,
  filePath: string
) {
  const rangesByFile = parseDiffOutput(rawDiff);
  return rangesByFile.get(filePath) ?? [];
}
