/**
 * @file GitMergeBase.ts
 * Phase 4 — Common ancestor (merge base) resolution.
 *
 * Handles: normal, diverged, identical, missing branches, shallow repos.
 * Never silently returns incorrect information.
 */

import type { SimpleGit } from "simple-git";
import { throwError } from "./GitErrors";

/**
 * Find the common ancestor commit SHA of branchA and branchB.
 *
 * @throws ConflictLensException with MERGE_BASE_UNAVAILABLE for shallow repos or missing history.
 * @throws ConflictLensException with BRANCH_NOT_FOUND for unknown refs.
 * @throws ConflictLensException with GIT_COMMAND_FAILURE for other git errors.
 */
export async function getMergeBase(
  git: SimpleGit,
  branchA: string,
  branchB: string
): Promise<string> {
  try {
    const raw = await git.raw(["merge-base", branchA, branchB]);
    const sha = raw.trim();

    if (!sha || sha.length < 7) {
      throwError(
        "MERGE_BASE_UNAVAILABLE",
        `git merge-base returned an empty or invalid result for "${branchA}" and "${branchB}"`
      );
    }

    return sha;
  } catch (err) {
    // Re-throw our own errors unchanged
    if ((err as { ConflictLensError?: unknown }).ConflictLensError) throw err;

    const errMsg = String((err as Error).message ?? err);

    // Shallow repo: Git cannot determine the merge base
    if (errMsg.includes("shallow") || errMsg.includes("unrelated histories")) {
      throwError(
        "SHALLOW_REPO_LIMITATION",
        `Cannot determine merge base in a shallow repository. ` +
          `Run "git fetch --unshallow" to fetch full history.`,
        err
      );
    }

    // One of the branches doesn't exist
    if (errMsg.includes("unknown revision") || errMsg.includes("bad revision")) {
      throwError(
        "BRANCH_NOT_FOUND",
        `One or both branches not found: "${branchA}", "${branchB}"`,
        err
      );
    }

    throwError("MERGE_BASE_UNAVAILABLE", `Failed to determine merge base: ${errMsg}`, err);
  }
}

/**
 * Returns true when branchA and branchB share identical HEAD commits
 * (i.e., one is fully up-to-date with the other, no divergence at all).
 */
export async function branchesAreIdentical(
  git: SimpleGit,
  branchA: string,
  branchB: string
): Promise<boolean> {
  try {
    const [shaA, shaB] = await Promise.all([
      git.raw(["rev-parse", branchA]).then((r) => r.trim()),
      git.raw(["rev-parse", branchB]).then((r) => r.trim()),
    ]);
    return shaA === shaB;
  } catch {
    return false;
  }
}
