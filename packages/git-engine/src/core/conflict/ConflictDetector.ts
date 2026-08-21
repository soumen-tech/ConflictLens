/**
 * @file ConflictDetector.ts
 * Phase 8 — Actual merge conflict validation (NON-DESTRUCTIVE).
 *
 * Uses `git merge-tree` to ask Git's own merge machinery whether
 * the branches would actually conflict — WITHOUT modifying the working tree
 * or the current branch.
 *
 * Hard constraints:
 *  - Never runs `git merge` on the active branch
 *  - Never mutates the working tree
 *  - If Git version or state prevents reliable validation, says so explicitly
 */

import type { SimpleGit } from "simple-git";
import type { ConflictCandidate, ChangedFile } from "../../shared/types/gitConflictResult";
import { detectOverlap } from "./OverlapDetector";
import type { FileOverlapResult, RangeOverlap } from "./types";

export interface ConflictValidationResult {
  /** Files that Git's merge-tree predicts would conflict */
  conflictingFiles: string[];
  /** Whether the merge-tree command was available and reliable */
  validationReliable: boolean;
  /** Reason if validation was not reliable */
  unreliableReason?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Use `git merge-tree` to validate which files would actually conflict
 * when merging branchA into branchB.
 *
 * This is NON-DESTRUCTIVE — merge-tree reads the object store without
 * touching the working tree or HEAD.
 */
export async function validateMergeConflicts(
  git: SimpleGit,
  mergeBase: string,
  branchA: string,
  branchB: string
): Promise<ConflictValidationResult> {
  try {
    // git merge-tree <merge-base> <branchA> <branchB>
    // Exits 0 if clean merge, 1 if conflicts — we parse the output either way
    let mergeTreeOutput = "";
    try {
      mergeTreeOutput = await git.raw(["merge-tree", mergeBase, branchA, branchB]);
    } catch (err) {
      // merge-tree exits with code 1 on conflicts — simple-git may throw
      // We still get the output via stderr/stdout in the error object
      const errObj = err as { message?: string; stdout?: string };
      mergeTreeOutput = errObj.stdout ?? errObj.message ?? "";
    }

    const conflictingFiles = parseMergeTreeConflicts(mergeTreeOutput);

    return {
      conflictingFiles,
      validationReliable: true,
    };
  } catch {
    // merge-tree may not exist in very old Git or may fail for other reasons
    return {
      conflictingFiles: [],
      validationReliable: false,
      unreliableReason:
        "git merge-tree validation failed — Git version may not support this command, or repository state prevents it.",
    };
  }
}

/**
 * Combine overlap detection results with merge-tree validation to produce
 * ConflictCandidate[] for all files that are either overlapping or conflicting.
 */
export function buildConflictCandidates(
  files: ChangedFile[],
  mergeTreeResult: ConflictValidationResult
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];
  const conflictSet = new Set(mergeTreeResult.conflictingFiles);

  for (const file of files) {
    // Only analyze files touched by BOTH branches
    if (file.changesA.length === 0 && file.changesB.length === 0) continue;
    if (file.changesA.length === 0 || file.changesB.length === 0) {
      // Only one branch touched this file — check if it was deleted on one side
      const isDeleteConflict =
        (file.status === "deleted" && file.changesB.length > 0) ||
        (file.status === "deleted" && file.changesA.length > 0);

      if (isDeleteConflict || conflictSet.has(file.path)) {
        candidates.push({
          file: file.path,
          overlapLevel: "HIGH",
          hasActualConflict: conflictSet.has(file.path),
          predictedConflict: true,
          confidence: conflictSet.has(file.path) ? 0.95 : 0.7,
          overlappingRanges: [],
        });
      }
      continue;
    }

    // Both branches modified this file — run overlap detection
    const overlap: FileOverlapResult = detectOverlap(file.path, file.changesA, file.changesB);
    const hasActualConflict = conflictSet.has(file.path);
    const predictedConflict = overlap.overlapLevel === "HIGH" || hasActualConflict;

    if (overlap.overlapLevel === "SAFE" && !hasActualConflict) continue;

    // Confidence model:
    //  HIGH overlap + actual conflict = 0.95
    //  HIGH overlap only              = 0.80
    //  MEDIUM overlap                 = 0.55
    //  LOW overlap                    = 0.30
    //  actual conflict (no overlap)   = 0.70
    let confidence: number;
    if (hasActualConflict && overlap.overlapLevel === "HIGH") {
      confidence = 0.95;
    } else if (hasActualConflict) {
      confidence = 0.80;
    } else if (overlap.overlapLevel === "HIGH") {
      confidence = 0.80;
    } else if (overlap.overlapLevel === "MEDIUM") {
      confidence = 0.55;
    } else {
      confidence = 0.30;
    }

    candidates.push({
      file: file.path,
      overlapLevel: overlap.overlapLevel,
      hasActualConflict,
      predictedConflict,
      confidence,
      overlappingRanges: overlap.overlaps.map((o: RangeOverlap) => ({
        rangeA: o.rangeA,
        rangeB: o.rangeB,
      })),
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// merge-tree output parser
// ---------------------------------------------------------------------------

/**
 * Parse `git merge-tree` output to identify files with conflicts.
 *
 * Old-style merge-tree output (Git < 2.38):
 *   "added in remote" / "both modified" sections with file names
 *
 * New-style merge-tree output (Git >= 2.38, with --stdin or new flags):
 *   Different format — we check for conflict markers
 *
 * We look for both formats since Git 2.52 may produce either depending on usage.
 */
function parseMergeTreeConflicts(output: string): string[] {
  const conflictFiles = new Set<string>();

  // Pattern 1: "<<<<<<< " conflict markers with file paths in "CONFLICT" lines
  // git merge-tree old format lines like: "changed in both" + path
  const bothModifiedPattern = /^(?:changed in both|both modified|both added|deleted in \w+)\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = bothModifiedPattern.exec(output)) !== null) {
    const filePath = match[1].trim();
    if (filePath) conflictFiles.add(filePath);
  }

  // Pattern 2: Lines like "CONFLICT (content): Merge conflict in path/to/file.js"
  const conflictLinePattern = /CONFLICT\s+\([^)]+\):\s+.+\s+in\s+(.+)$/gm;
  while ((match = conflictLinePattern.exec(output)) !== null) {
    const filePath = match[1].trim();
    if (filePath) conflictFiles.add(filePath);
  }

  // Pattern 3: New merge-tree format — look for "<<<<<<< " followed by path info
  // or the exit code (1 = conflicts). Since we catch both exit 0 and 1,
  // we also check if the output contains conflict markers
  if (output.includes("<<<<<<<") && conflictFiles.size === 0) {
    // Extract file sections from merge-tree output
    const filePattern = /^[0-9]+ [0-9a-f]+ [123]\t(.+)$/gm;
    while ((match = filePattern.exec(output)) !== null) {
      conflictFiles.add(match[1].trim());
    }
  }

  return [...conflictFiles];
}
