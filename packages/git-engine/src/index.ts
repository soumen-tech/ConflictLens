/**
 * @file index.ts — Public API entry point for @conflictlens/git-engine
 *
 * The ONLY function Person 2 and Person 3 need to call from this module is:
 *   analyzeBranches({ repositoryPath, branchA, branchB })
 *
 * This file is the integration surface — stable once frozen.
 * Do NOT change the signature of analyzeBranches without notifying the team.
 */

import { openRepository } from "./core/git/GitRepository";
import { resolveBranchRef } from "./core/git/GitBranch";
import { getMergeBase } from "./core/git/GitMergeBase";
import { compareBranches } from "./core/git/GitCommit";
import { getDiffFromMergeBase, mergeDiffResults } from "./core/git/GitDiff";
import { parseDiffOutput } from "./core/conflict/DiffRangeParser";
import { validateMergeConflicts, buildConflictCandidates } from "./core/conflict/ConflictDetector";
import { computeRiskScore } from "./core/risk/RiskScorer";
import { detectSemanticConflicts, semanticConflictsToRisks } from "./core/semantic/SemanticAnalyzer";
import type { GitConflictResult } from "./shared/types/gitConflictResult";
import { ConflictLensException } from "./core/git/GitErrors";
import type { Risk, RiskLevel as SharedRiskLevel } from "@conflictlens/shared";

// Re-export the shared contract and error types for consumers
export type {
  GitConflictResult,
  BranchInfo,
  ChangedFile,
  ChangedRange,
  ConflictCandidate,
  RiskAssessment,
  RiskLevel,
  OverlapLevel,
  ConflictLensError,
  ConflictLensErrorCode,
} from "./shared/types/gitConflictResult";
export { ConflictLensException, makeError } from "./core/git/GitErrors";

// ---------------------------------------------------------------------------
// Adapter to canonical Risk shape
// ---------------------------------------------------------------------------

export function adaptGitConflictResult(result: GitConflictResult): Risk[] {
  const risks: Risk[] = [];

  for (const conflict of result.conflicts) {
    const riskLevel: SharedRiskLevel = conflict.overlapLevel === "HIGH" ? "high"
      : conflict.overlapLevel === "MEDIUM" ? "medium"
      : "low";

    risks.push({
      id: `git_${conflict.file}_${conflict.overlapLevel}`,
      type: "semantic_conflict",
      riskLevel,
      location: {
        file: conflict.file,
        line: conflict.overlappingRanges[0]?.rangeB?.startLine ?? 1,
      },
      details: {
        functionName: "N/A (Line Overlap)",
        changeType: conflict.hasActualConflict ? "git_merge_conflict" : "line_overlap",
        affectedFiles: [conflict.file],
      },
      ai_context: {
        explanation: "Pending AI response...",
        recommendation: "Pending AI response...",
      },
    });
  }

  if (result.semanticConflicts) {
    const semanticRisks = semanticConflictsToRisks(result.semanticConflicts);
    risks.push(...semanticRisks);
  }

  return risks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AnalyzeBranchesOptions {
  /** Absolute or relative path to the repository (or any directory inside it) */
  repositoryPath: string;
  /** Name of the first branch (e.g. "main", "feature/payment") */
  branchA: string;
  /** Name of the second branch to compare against */
  branchB: string;
}

/**
 * Analyze two Git branches and return a structured conflict risk report.
 *
 * This is the single entry point for Person 2 (Security/Semantic) and
 * Person 3 (Server/AI/Extension/Dashboard) to consume.
 *
 * @throws ConflictLensException with a typed { code, message } error shape.
 *         Never throws raw Error objects or exposes stack traces.
 */
export async function analyzeBranches(
  options: AnalyzeBranchesOptions
): Promise<GitConflictResult> {
  const startTime = Date.now();
  const { repositoryPath, branchA, branchB } = options;

  // ── Step 1: Repository detection ──────────────────────────────────────────
  const repo = await openRepository(repositoryPath);
  const { git, root, gitVersion } = repo;

  // ── Step 2: Branch resolution ──────────────────────────────────────────────
  const [branchInfoA, branchInfoB] = await Promise.all([
    resolveBranchRef(git, branchA),
    resolveBranchRef(git, branchB),
  ]);

  // ── Step 3: Merge base ─────────────────────────────────────────────────────
  const mergeBase = await getMergeBase(git, branchA, branchB);

  // ── Step 4: Commit divergence ──────────────────────────────────────────────
  const divergence = await compareBranches(git, branchA, branchB, mergeBase);

  // ── Step 5: Diffs from merge base ─────────────────────────────────────────
  const [diffA, diffB] = await Promise.all([
    getDiffFromMergeBase(git, mergeBase, branchA),
    getDiffFromMergeBase(git, mergeBase, branchB),
  ]);

  // ── Step 6: Re-parse ranges per file and attach to the file list ──────────
  const rangesA = parseDiffOutput(diffA.rawDiff);
  const rangesB = parseDiffOutput(diffB.rawDiff);

  // Build merged file list with changesA / changesB populated
  const allFiles = mergeDiffResults(diffA, diffB, mergeBase, git);

  // Hydrate changesA and changesB from the parsed ranges
  for (const file of allFiles) {
    file.changesA = rangesA.get(file.path) ?? [];
    file.changesB = rangesB.get(file.path) ?? [];
  }

  // ── Step 7: Actual conflict validation (non-destructive) ───────────────────
  const mergeTreeResult = await validateMergeConflicts(git, mergeBase, branchA, branchB);

  // ── Step 8: Build conflict candidates ─────────────────────────────────────
  const conflicts = buildConflictCandidates(allFiles, mergeTreeResult);

  // ── Step 8.5: Run Semantic AST Analysis ───────────────────────────────────
  const baseFiles = new Map<string, string>();
  const branchAFiles = new Map<string, string>();
  const branchBFiles = new Map<string, string>();

  for (const file of allFiles) {
    const ext = file.path.split('.').pop()?.toLowerCase();
    if (!["js", "ts", "jsx", "tsx", "mjs", "cjs"].includes(ext || "")) {
      continue;
    }

    try {
      baseFiles.set(file.path, await git.show([`${mergeBase}:${file.path}`]));
    } catch {
      baseFiles.set(file.path, "");
    }

    try {
      branchAFiles.set(file.path, await git.show([`${branchA}:${file.path}`]));
    } catch {
      branchAFiles.set(file.path, "");
    }

    try {
      branchBFiles.set(file.path, await git.show([`${branchB}:${file.path}`]));
    } catch {
      branchBFiles.set(file.path, "");
    }
  }

  const semanticConflicts = detectSemanticConflicts(baseFiles, branchAFiles, branchBFiles);

  // ── Step 9: Risk scoring ───────────────────────────────────────────────────
  const risk = computeRiskScore({
    conflicts,
    files: allFiles,
    commitsAheadA: divergence.commitsAheadA,
    commitsAheadB: divergence.commitsAheadB,
    mergeTreeReliable: mergeTreeResult.validationReliable,
  });

  const durationMs = Date.now() - startTime;

  // ── Step 10: Assemble GitConflictResult ────────────────────────────────────
  return {
    repository: { root, gitVersion },
    branches: { branchA: branchInfoA, branchB: branchInfoB },
    mergeBase,
    commits: {
      commitsAheadA: divergence.commitsAheadA,
      commitsAheadB: divergence.commitsAheadB,
      commonAncestor: mergeBase,
      diverged: divergence.diverged,
    },
    files: allFiles,
    conflicts,
    semanticConflicts,
    risk,
    metadata: {
      analyzedAt: new Date().toISOString(),
      durationMs,
      gitVersion,
    },
  };
}

// Make ConflictLensException catchable as a type guard for consumers
export function isConflictLensException(err: unknown): err is ConflictLensException {
  return err instanceof ConflictLensException;
}
