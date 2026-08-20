/**
 * @file GitRepository.ts
 * Phase 1 — Repository detection and root resolution.
 *
 * Public API: GitRepository.open(path) → GitRepositoryInfo
 * Never assumes cwd is the repo root. Supports nested directories.
 */

import * as path from "path";
import * as fs from "fs";
import simpleGit, { SimpleGit } from "simple-git";
import { throwError } from "./GitErrors";
import type { CodeGuardError } from "../../shared/types/gitConflictResult";

export interface GitRepositoryInfo {
  /** Absolute path to the repository root (.git parent) */
  root: string;
  /** Git version string, e.g. "2.52.0" */
  gitVersion: string;
  /** The simple-git instance configured for this repo */
  git: SimpleGit;
}

/**
 * Detect whether a path is inside a Git repo, walk up to find the root,
 * and return a typed info object.
 *
 * @throws CodeGuardException with code NOT_A_GIT_REPO | INVALID_REPO_PATH | GIT_NOT_INSTALLED
 */
export async function openRepository(repoPath: string): Promise<GitRepositoryInfo> {
  // 1. Validate the path exists and is accessible
  const absolutePath = path.resolve(repoPath);

  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isDirectory()) {
      throwError("INVALID_REPO_PATH", `Path is not a directory: ${absolutePath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throwError("INVALID_REPO_PATH", `Directory does not exist: ${absolutePath}`);
    }
    // Re-throw CodeGuardException as-is
    throw err;
  }

  // 2. Walk up from absolutePath ourselves to find the first .git directory.
  //    We do NOT rely solely on git rev-parse --show-toplevel because on some
  //    machines the OS temp directory is nested inside a git repo (e.g. when
  //    the user's home folder is a git repo), causing false positives.
  const selfContainedRoot = findGitRootByWalking(absolutePath);
  if (!selfContainedRoot) {
    throwError(
      "NOT_A_GIT_REPO",
      `Not a Git repository (or any parent directory): ${absolutePath}`
    );
  }

  // 3. Create a simple-git instance anchored at the discovered root
  const git = simpleGit({ baseDir: selfContainedRoot!, binary: "git", maxConcurrentProcesses: 4 });

  // 4. Check git is installed and get its version
  let rawVersion: string;
  try {
    rawVersion = await git.raw(["--version"]);
  } catch {
    throwError("GIT_NOT_INSTALLED", "Git is not installed or not on PATH");
  }

  const gitVersion = parseGitVersion(rawVersion!.trim());

  return {
    root: selfContainedRoot!,
    gitVersion,
    git,
  };
}

/**
 * Walk up from `startDir` looking for a `.git` directory or file.
 * Returns the directory that CONTAINS the `.git` entry, or null if not found.
 *
 * This is the same algorithm Git uses internally, but performed by us so we
 * can stop at a user-specified boundary rather than silently walking up to
 * a parent repo on the developer's machine.
 */
function findGitRootByWalking(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const gitPath = path.join(current, ".git");
    if (fs.existsSync(gitPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root without finding .git
      return null;
    }
    current = parent;
  }
}

/** Extract "2.52.0" from "git version 2.52.0.windows.1" */
function parseGitVersion(raw: string): string {
  const match = raw.match(/git version (\d+\.\d+\.\d+)/);
  return match ? match[1] : raw;
}

/** Type guard: is this error a CodeGuardError shape? */
export function isCodeGuardError(value: unknown): value is CodeGuardError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value
  );
}
