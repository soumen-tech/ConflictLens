/**
 * @file GitCommit.ts
 * Phase 3 — Commit intelligence.
 *
 * Commit info, comparison between two branches, divergence detection.
 */

import type { SimpleGit } from "simple-git";
import { throwError } from "./GitErrors";
import type { CommitInfo, BranchDivergence } from "./types";

// ---------------------------------------------------------------------------
// Single commit info
// ---------------------------------------------------------------------------

/**
 * Fetch structured information for a single commit SHA.
 */
export async function getCommitInfo(git: SimpleGit, sha: string): Promise<CommitInfo> {
  try {
    // Use %x00 as separator to handle commas/spaces in author/message safely
    const raw = await git.raw([
      "show",
      "-s",
      "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s",
      sha,
    ]);

    const parts = raw.trim().split("\x00");
    if (parts.length < 6) {
      throwError("GIT_COMMAND_FAILURE", `Unexpected commit format for SHA: ${sha}`);
    }

    return {
      sha: parts[0],
      shortSha: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      message: parts[5],
    };
  } catch (err) {
    if ((err as { codeGuardError?: unknown }).codeGuardError) throw err;
    throwError("GIT_COMMAND_FAILURE", `Failed to fetch commit info for: ${sha}`, err);
  }
}

// ---------------------------------------------------------------------------
// Branch divergence
// ---------------------------------------------------------------------------

/**
 * Compare branchA and branchB:
 * - How many commits is each ahead of the merge base?
 * - What is the common ancestor?
 * - Are they diverged?
 */
export async function compareBranches(
  git: SimpleGit,
  branchA: string,
  branchB: string,
  mergeBase: string
): Promise<BranchDivergence> {
  // Count commits ahead of merge base for each branch
  const [countA, countB] = await Promise.all([
    countCommitsAhead(git, mergeBase, branchA),
    countCommitsAhead(git, mergeBase, branchB),
  ]);

  return {
    branchA,
    branchB,
    commitsAheadA: countA,
    commitsAheadB: countB,
    commonAncestor: mergeBase,
    diverged: countA > 0 && countB > 0,
  };
}

/**
 * Count commits reachable from `tip` but not from `base`.
 */
async function countCommitsAhead(
  git: SimpleGit,
  base: string,
  tip: string
): Promise<number> {
  try {
    const raw = await git.raw(["rev-list", "--count", `${base}..${tip}`]);
    const count = parseInt(raw.trim(), 10);
    return isNaN(count) ? 0 : count;
  } catch (err) {
    throwError(
      "GIT_COMMAND_FAILURE",
      `Failed to count commits between ${base} and ${tip}`,
      err
    );
  }
}

/**
 * Returns a list of commit SHAs unique to branchA (not reachable from branchB).
 */
export async function getUniqueCommits(
  git: SimpleGit,
  mergeBase: string,
  branch: string
): Promise<string[]> {
  try {
    const raw = await git.raw([
      "rev-list",
      "--no-merges",
      `${mergeBase}..${branch}`,
    ]);
    return raw
      .trim()
      .split("\n")
      .filter((s) => s.length > 0);
  } catch (err) {
    throwError(
      "GIT_COMMAND_FAILURE",
      `Failed to list unique commits for ${branch}`,
      err
    );
  }
}
