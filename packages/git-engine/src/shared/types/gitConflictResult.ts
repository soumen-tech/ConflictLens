/**
 * @file gitConflictResult.ts
 * @description FROZEN shared contract — consumed by Person 2 (Security/Semantic) and
 * Person 3 (Server/AI/Extension/Dashboard). Do NOT change field names or types without
 * announcing it to the team, as parallel tracks build against this interface.
 *
 * Version: 1.0.0 — frozen on branch git-semantic-analysis-engine
 */

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

export interface BranchInfo {
  /** Full ref name, e.g. "refs/heads/main" */
  name: string;
  /** Short name, e.g. "main" */
  shortName: string;
  /** HEAD commit SHA of this branch */
  headCommit: string;
  /** Whether this branch is the currently checked-out branch */
  isCurrent: boolean;
  /** Upstream tracking branch, if configured */
  upstream?: string;
}

export interface ChangedFile {
  /** Repo-relative path of the file */
  path: string;
  /** Previous path, only present when Git detects a rename */
  oldPath?: string;
  /** Change status as reported by Git */
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
  /** Net lines added in this file's diff */
  additions: number;
  /** Net lines deleted in this file's diff */
  deletions: number;
  /** Whether Git identified this as a binary file */
  isBinary: boolean;
  /** Ranges changed on branch A (relative to merge base) */
  changesA: ChangedRange[];
  /** Ranges changed on branch B (relative to merge base) */
  changesB: ChangedRange[];
}

export interface ChangedRange {
  /** 1-based start line in the modified file */
  startLine: number;
  /** Number of lines this range covers */
  lineCount: number;
  /** 1-based last line (inclusive) = startLine + max(lineCount-1, 0) */
  endLine: number;
  changeType: "added" | "removed" | "modified";
}

export type OverlapLevel = "SAFE" | "LOW" | "MEDIUM" | "HIGH";

export interface ConflictCandidate {
  /** Repo-relative file path */
  file: string;
  /** Overlap classification */
  overlapLevel: OverlapLevel;
  /** Whether Git's own merge machinery predicts an actual conflict */
  hasActualConflict: boolean;
  /** Whether our heuristic predicted a conflict */
  predictedConflict: boolean;
  /** Confidence 0–1 in the prediction */
  confidence: number;
  /** Overlapping range pairs that triggered this candidate */
  overlappingRanges: Array<{ rangeA: ChangedRange; rangeB: ChangedRange }>;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskAssessment {
  /** 0–100 deterministic score */
  score: number;
  level: RiskLevel;
  /** Human-readable list of contributing factors */
  factors: string[];
}

// ---------------------------------------------------------------------------
// ROOT CONTRACT — this is what analyzeBranches() returns
// ---------------------------------------------------------------------------

export interface GitConflictResult {
  repository: {
    /** Absolute path to the repository root */
    root: string;
    /** Git version string, e.g. "2.52.0" */
    gitVersion: string;
  };
  branches: {
    branchA: BranchInfo;
    branchB: BranchInfo;
  };
  /** SHA of the common merge-base commit */
  mergeBase: string;
  commits: {
    /** How many commits branch A has ahead of the merge base */
    commitsAheadA: number;
    /** How many commits branch B has ahead of the merge base */
    commitsAheadB: number;
    /** SHA of the common ancestor (same as mergeBase, kept for clarity) */
    commonAncestor: string;
    /** True when both branches have diverged from the merge base */
    diverged: boolean;
  };
  /** All files that differ between either branch and the merge base */
  files: ChangedFile[];
  /** Files identified as conflict candidates */
  conflicts: ConflictCandidate[];
  /** AST-based semantic conflicts (e.g. signature changes that break callers) */
  semanticConflicts?: Array<{
    functionName: string;
    definitionFile: string;
    oldParams: string[];
    newParams: string[];
    brokenCallSites: Array<{ callerFile: string; calledFunction: string; line: number }>;
  }>;
  risk: RiskAssessment;
  metadata: {
    /** ISO 8601 timestamp */
    analyzedAt: string;
    /** Wall-clock milliseconds the analysis took */
    durationMs: number;
    /** Git version used during analysis */
    gitVersion: string;
  };
}

// ---------------------------------------------------------------------------
// Error taxonomy — typed errors the whole team can catch consistently
// ---------------------------------------------------------------------------

export type ConflictLensErrorCode =
  | "NOT_A_GIT_REPO"
  | "BRANCH_NOT_FOUND"
  | "INVALID_REPO_PATH"
  | "GIT_NOT_INSTALLED"
  | "GIT_COMMAND_FAILURE"
  | "MERGE_BASE_UNAVAILABLE"
  | "MALFORMED_DIFF"
  | "UNSUPPORTED_REPO_STATE"
  | "SHALLOW_REPO_LIMITATION"
  | "UNKNOWN";

export interface ConflictLensError {
  code: ConflictLensErrorCode;
  message: string;
  /** Original error cause, if any */
  cause?: string;
}
