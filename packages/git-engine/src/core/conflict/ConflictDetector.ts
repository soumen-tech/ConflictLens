/**
 * @file ConflictDetector.ts
 * Phase 8 — Actual merge conflict validation (NON-DESTRUCTIVE).
 *
 * Uses `git merge-tree --write-tree --name-only` (Git >= 2.38) to ask
 * Git's own merge machinery whether branches would actually conflict —
 * WITHOUT modifying the working tree or the current branch.
 *
 * Hard constraints:
 *  - Never runs `git merge` on the active branch
 *  - Never mutates the working tree
 *  - If Git version or state prevents reliable validation, says so explicitly
 *
 * BUG FIXES (confirmed by regression tests):
 *  - Old 3-arg `git merge-tree <base> <A> <B>` format is no longer used.
 *    The old parseMergeTreeConflicts() regexes never matched real output
 *    (Pattern 1 required text on same line as header — format puts paths
 *    on separate indented lines). Pattern 2 caused false positives by
 *    matching the literal string "CONFLICT (content):" inside file CONTENT
 *    (e.g. a markdown file quoting merge output).
 *  - Replaced with `git merge-tree --write-tree --name-only <A> <B>` which:
 *      * exits 0 on clean merge, 1 when conflicts exist
 *      * on exit 1, prints ONLY the conflicting file paths on stdout
 *      * never false-positives on file content
 */

import type { SimpleGit } from "simple-git";
import type { ConflictCandidate, ChangedFile } from "../../shared/types/gitConflictResult";
import { detectOverlap } from "./OverlapDetector";
import type { FileOverlapResult, RangeOverlap } from "./types";
import { resolveBranchRef } from "../git/GitBranch";
import { getMergeBase } from "../git/GitMergeBase";
import { getDiffFromMergeBase, getBranchFileChanges } from "../git/GitDiff";
import { parseDiffOutput } from "./DiffRangeParser";

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
 * Use `git merge-tree --write-tree --name-only` to validate which files
 * would actually conflict when merging branchA into branchB.
 *
 * This is NON-DESTRUCTIVE — merge-tree reads the object store without
 * touching the working tree or HEAD.
 *
 * Requires Git >= 2.38. Falls back to a "not reliable" result on older
 * versions so callers can degrade gracefully.
 *
 * @param _mergeBase - Retained for API compatibility; the new --write-tree
 *   mode auto-detects the merge base from the branch tips.
 */
export async function validateMergeConflicts(
  git: SimpleGit,
  _mergeBase: string,
  branchA: string,
  branchB: string
): Promise<ConflictValidationResult> {
  try {
    // Modern format: git merge-tree --write-tree --name-only <branchA> <branchB>
    //   exit 0  → clean merge  (stdout may be empty or contain the merged tree SHA)
    //   exit 1  → conflicts    (stdout lists conflicting file paths, one per line)
    //
    // We treat the EXIT CODE as the primary signal, not text parsing.
    let stdout = "";
    let exitCode = 0;

    try {
      stdout = await git.raw([
        "merge-tree",
        "--write-tree",
        "--name-only",
        branchA,
        branchB,
      ]);
      // exit 0 means clean merge — no conflicts
    } catch (err) {
      // simple-git throws on non-zero exit. Exit 1 = conflicts present.
      const errObj = err as { exitCode?: number; stdout?: string; message?: string };
      exitCode = errObj.exitCode ?? 1;
      // stdout of the failed command contains the conflicting file list
      stdout = errObj.stdout ?? errObj.message ?? "";
    }

    if (exitCode === 0) {
      // Clean merge — no conflicts
      return { conflictingFiles: [], validationReliable: true };
    }

    // exitCode === 1: parse the file list from stdout
    const conflictingFiles = parseNameOnlyOutput(stdout);
    return { conflictingFiles, validationReliable: true };

  } catch {
    // merge-tree --write-tree requires Git >= 2.38; fall back gracefully
    return {
      conflictingFiles: [],
      validationReliable: false,
      unreliableReason:
        "git merge-tree --write-tree is unavailable (requires Git >= 2.38). " +
        "Upgrade Git to enable precise conflict validation.",
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
// Output parser for --name-only format
// ---------------------------------------------------------------------------

/**
 * Parse the stdout of `git merge-tree --write-tree --name-only` when it exits 1.
 *
 * The output is one conflicting file path per line. The first line may be
 * a merge-tree SHA (the partial merged tree); we skip any lines that look
 * like a 40-character hex SHA and are not file paths.
 *
 * This parser is intentionally simple — it does NOT look for "CONFLICT"
 * text anywhere, so file CONTENT containing the literal string
 * "CONFLICT (content): Merge conflict in X.js" cannot trigger false positives.
 */
function parseNameOnlyOutput(output: string): string[] {
  const files = new Set<string>();
  const shaPattern = /^[0-9a-f]{40}$/i;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip the merge-tree result SHA that appears on the first line
    if (shaPattern.test(line)) continue;
    // Everything else is a conflicting file path
    files.add(line);
  }

  return [...files];
}

export interface PredictedConflictResult {
  file: string;
  risk: "HIGH_RISK" | "LOW_RISK";
  score: number;
  level: "HIGH" | "LOW";
}

/**
 * Compare the output of Agent 1 (getBranchFileChanges) for two branches and decide if there's a potential conflict.
 * Marks it HIGH_RISK if overlapping line ranges were touched, or LOW_RISK if only the same file (not same lines) was touched.
 */
export async function predictConflicts(
  git: SimpleGit,
  branchA: string,
  branchB: string
): Promise<PredictedConflictResult[]> {
  // 1. Get changed files on branchA and branchB compared to main
  const filesA = await getBranchFileChanges(git, branchA);
  const filesB = await getBranchFileChanges(git, branchB);

  const setA = new Set(filesA);
  const sharedFiles = filesB.filter((file) => setA.has(file));

  if (sharedFiles.length === 0) {
    return [];
  }

  const results: PredictedConflictResult[] = [];

  // 2. Resolve branches and get their diffs relative to their merge base with main
  const resolvedMain = await resolveBranchRef(git, "main");
  const mergeBaseA = await getMergeBase(git, resolvedMain.shortName, branchA);
  const mergeBaseB = await getMergeBase(git, resolvedMain.shortName, branchB);

  const [diffA, diffB] = await Promise.all([
    getDiffFromMergeBase(git, mergeBaseA, branchA),
    getDiffFromMergeBase(git, mergeBaseB, branchB),
  ]);

  const rangesA = parseDiffOutput(diffA.rawDiff);
  const rangesB = parseDiffOutput(diffB.rawDiff);

  for (const file of sharedFiles) {
    const fileRangesA = rangesA.get(file) ?? [];
    const fileRangesB = rangesB.get(file) ?? [];

    const overlapResult = detectOverlap(file, fileRangesA, fileRangesB);

    if (overlapResult.overlapLevel === "HIGH") {
      results.push({
        file,
        risk: "HIGH_RISK",
        score: 60, // Maps to HIGH in existing RiskScorer (50-79)
        level: "HIGH",
      });
    } else {
      results.push({
        file,
        risk: "LOW_RISK",
        score: 10, // Maps to LOW in existing RiskScorer (0-19)
        level: "LOW",
      });
    }
  }

  return results;
}
