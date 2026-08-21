/**
 * @file testHelpers.ts
 * Utilities to create real temporary Git repos for integration testing.
 * All repos are created in os.tmpdir() and cleaned up after tests.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import simpleGit from "simple-git";

export interface TestRepo {
  dir: string;
  cleanup: () => void;
}

/**
 * Create a fresh temporary Git repo with an initial commit on 'main'.
 */
export async function createTestRepo(name = "test-repo"): Promise<TestRepo> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `conflictlens-${name}-`));

  const git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig("user.name", "Test User");
  await git.addConfig("user.email", "test@ConflictLens.test");

  // Rename default branch to 'main'
  try {
    await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
  } catch {
    // already main or other setup
  }

  // Create an initial commit so merge-base works
  const initFile = path.join(dir, "README.md");
  fs.writeFileSync(initFile, "# Test Repo\n");
  await git.add("README.md");
  await git.commit("Initial commit");

  return {
    dir,
    cleanup: () => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

/**
 * Write a file in the repo, stage it, and commit.
 */
export async function commitFile(
  dir: string,
  filePath: string,
  content: string,
  message: string
): Promise<string> {
  const git = simpleGit({ baseDir: dir });
  const fullPath = path.join(dir, filePath);

  // Create parent directories if needed
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);

  await git.add(filePath);
  await git.commit(message);

  return (await git.raw(["rev-parse", "HEAD"])).trim();
}

/**
 * Create a new branch from current HEAD and switch to it.
 */
export async function createBranch(dir: string, branchName: string): Promise<void> {
  const git = simpleGit({ baseDir: dir });
  await git.checkoutLocalBranch(branchName);
}

/**
 * Switch to an existing branch.
 */
export async function switchBranch(dir: string, branchName: string): Promise<void> {
  const git = simpleGit({ baseDir: dir });
  await git.checkout(branchName);
}

/**
 * Delete a file and commit the deletion.
 */
export async function deleteFile(
  dir: string,
  filePath: string,
  message: string
): Promise<void> {
  const git = simpleGit({ baseDir: dir });
  await git.rm(filePath);
  await git.commit(message);
}
