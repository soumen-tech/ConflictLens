/**
 * @file GitBranch.ts
 * Phase 2 — Branch intelligence.
 *
 * Current branch, local/remote listing, existence check, upstream detection,
 * detached HEAD detection, and HEAD commit SHA.
 */

import type { SimpleGit } from "simple-git";
import { throwError } from "./GitErrors";
import type { RawBranchInfo } from "./types";
import type { BranchInfo } from "../../shared/types/gitConflictResult";

// ---------------------------------------------------------------------------
// Current branch
// ---------------------------------------------------------------------------

/**
 * Returns the current branch name, or null when HEAD is detached.
 */
export async function getCurrentBranch(git: SimpleGit): Promise<string | null> {
  try {
    const raw = await git.raw(["symbolic-ref", "--short", "HEAD"]);
    return raw.trim() || null;
  } catch {
    // symbolic-ref fails on detached HEAD
    return null;
  }
}

/**
 * Returns true when the repo is in a detached HEAD state.
 */
export async function isDetachedHead(git: SimpleGit): Promise<boolean> {
  const branch = await getCurrentBranch(git);
  return branch === null;
}

// ---------------------------------------------------------------------------
// Branch listing
// ---------------------------------------------------------------------------

/**
 * Returns all local branches with metadata.
 */
export async function listLocalBranches(git: SimpleGit): Promise<RawBranchInfo[]> {
  const summary = await git.branchLocal();
  const currentBranch = await getCurrentBranch(git);

  const results: RawBranchInfo[] = [];

  for (const [name, data] of Object.entries(summary.branches)) {
    // Fetch the full commit SHA (branchLocal only gives short info)
    let headCommit = data.commit;
    try {
      headCommit = (await git.raw(["rev-parse", `refs/heads/${name}`])).trim();
    } catch {
      // fall back to whatever branchLocal gave us
    }

    let upstream: string | undefined;
    try {
      const raw = await git.raw([
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        `${name}@{u}`,
      ]);
      upstream = raw.trim() || undefined;
    } catch {
      upstream = undefined;
    }

    results.push({
      name: `refs/heads/${name}`,
      shortName: name,
      headCommit,
      isCurrent: name === currentBranch,
      upstream,
      isRemote: false,
    });
  }

  return results;
}

/**
 * Returns remote-tracking branches.
 */
export async function listRemoteBranches(git: SimpleGit): Promise<RawBranchInfo[]> {
  const summary = await git.branch(["-r"]);
  const results: RawBranchInfo[] = [];

  for (const [name, data] of Object.entries(summary.branches)) {
    const shortName = name.trim();
    // Skip HEAD pointers like "origin/HEAD"
    if (shortName.includes("HEAD")) continue;

    let headCommit = data.commit;
    try {
      headCommit = (await git.raw(["rev-parse", shortName])).trim();
    } catch {
      // use what we have
    }

    results.push({
      name: `refs/remotes/${shortName}`,
      shortName,
      headCommit,
      isCurrent: false,
      upstream: undefined,
      isRemote: true,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Branch resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a branch name (local or remote) to its HEAD SHA.
 * Supports: "main", "feature/payment", "origin/main".
 *
 * @throws ConflictLensException with BRANCH_NOT_FOUND if the ref cannot be resolved.
 */
export async function resolveBranchRef(
  git: SimpleGit,
  branchName: string
): Promise<BranchInfo> {
  // Try resolving as a local branch first, then remote, then arbitrary ref
  const candidateRefs = [
    `refs/heads/${branchName}`,
    `refs/remotes/${branchName}`,
    branchName, // handles things like "origin/main" directly
  ];

  let resolvedSha: string | null = null;
  let resolvedRef: string | null = null;

  for (const ref of candidateRefs) {
    try {
      const sha = (await git.raw(["rev-parse", "--verify", ref])).trim();
      if (sha) {
        resolvedSha = sha;
        resolvedRef = ref;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!resolvedSha || !resolvedRef) {
    throwError(
      "BRANCH_NOT_FOUND",
      `Branch or ref not found: "${branchName}". Make sure it exists locally or is fetched from remote.`
    );
  }

  const currentBranchName = await getCurrentBranch(git);
  const isCurrent = branchName === currentBranchName;

  // Determine upstream
  let upstream: string | undefined;
  try {
    const raw = await git.raw([
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      `${branchName}@{u}`,
    ]);
    upstream = raw.trim() || undefined;
  } catch {
    upstream = undefined;
  }

  return {
    name: resolvedRef!,
    shortName: branchName,
    headCommit: resolvedSha!,
    isCurrent,
    ...(upstream ? { upstream } : {}),
  };
}

/**
 * Returns true when the given branch name exists (local or remote).
 */
export async function branchExists(git: SimpleGit, branchName: string): Promise<boolean> {
  try {
    await resolveBranchRef(git, branchName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the current HEAD commit SHA.
 */
export async function getHeadCommit(git: SimpleGit): Promise<string> {
  try {
    return (await git.raw(["rev-parse", "HEAD"])).trim();
  } catch (err) {
    throwError("GIT_COMMAND_FAILURE", "Could not resolve HEAD commit", err);
  }
}
