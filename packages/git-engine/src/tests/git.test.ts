/**
 * @file git.test.ts
 * Tests for core/git layer: repository detection, branch intelligence,
 * commit comparison, merge base. Uses real temporary Git repos.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  createTestRepo,
  commitFile,
  createBranch,
  switchBranch,
  type TestRepo,
} from "../tests/testHelpers";
import { openRepository } from "../core/git/GitRepository";
import {
  getCurrentBranch,
  listLocalBranches,
  resolveBranchRef,
  branchExists,
  isDetachedHead,
} from "../core/git/GitBranch";
import { getMergeBase } from "../core/git/GitMergeBase";
import { compareBranches } from "../core/git/GitCommit";
import { ConflictLensException } from "../core/git/GitErrors";

// ---------------------------------------------------------------------------
// Test 12 — Non-git directory → clean structured error
// ---------------------------------------------------------------------------
describe("GitRepository.openRepository", () => {
  it("returns structured error for a non-git directory", async () => {
    // Use the Windows system root (C:\Windows\Temp) which is guaranteed to
    // have no .git in its ancestry on this machine.
    // Fallback: create a truly isolated dir under C:\ system root.
    // We verify it throws NOT_A_GIT_REPO by using a path with no git ancestry.
    const systemRoot = path.parse(process.cwd()).root; // e.g. "C:\"
    const isolatedBase = path.join(systemRoot, "conflictlens-test-nongit");
    fs.mkdirSync(isolatedBase, { recursive: true });
    const tmpDir = fs.mkdtempSync(path.join(isolatedBase, "run-"));
    try {
      await expect(openRepository(tmpDir)).rejects.toMatchObject({
        ConflictLensError: { code: "NOT_A_GIT_REPO" },
      });
    } finally {
      fs.rmSync(isolatedBase, { recursive: true, force: true });
    }
  });

  it("returns structured error for a path that does not exist", async () => {
    await expect(openRepository("/definitely/does/not/exist/xyz123")).rejects.toMatchObject({
      ConflictLensError: { code: "INVALID_REPO_PATH" },
    });
  });

  it("detects a real git repo and returns root + version", async () => {
    const repo = await createTestRepo("detect");
    try {
      const info = await openRepository(repo.dir);
      expect(info.root).toBeTruthy();
      expect(info.gitVersion).toMatch(/\d+\.\d+/);
      expect(typeof info.git).toBe("object");
    } finally {
      repo.cleanup();
    }
  });

  it("resolves root correctly when entering a nested subdirectory", async () => {
    const repo = await createTestRepo("nested");
    try {
      const nestedDir = path.join(repo.dir, "src", "utils");
      fs.mkdirSync(nestedDir, { recursive: true });
      const info = await openRepository(nestedDir);
      expect(info.root).toBe(repo.dir);
    } finally {
      repo.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — Branch Intelligence
// ---------------------------------------------------------------------------
describe("GitBranch", () => {
  let repo: TestRepo;

  afterEach(() => repo?.cleanup());

  it("detects the current branch", async () => {
    repo = await createTestRepo("branch-current");
    const { git } = await openRepository(repo.dir);
    const branch = await getCurrentBranch(git);
    expect(branch).toBe("main");
  });

  it("lists local branches", async () => {
    repo = await createTestRepo("branch-list");
    await createBranch(repo.dir, "feature-x");
    await switchBranch(repo.dir, "main");

    const { git } = await openRepository(repo.dir);
    const branches = await listLocalBranches(git);
    const names = branches.map((b) => b.shortName);
    expect(names).toContain("main");
    expect(names).toContain("feature-x");
  });

  // Test 10 — Branch name containing slash (e.g. feature/payment)
  it("handles branch names with slashes (feature/payment)", async () => {
    repo = await createTestRepo("branch-slash");
    await createBranch(repo.dir, "feature/payment");
    await commitFile(repo.dir, "payment.js", "// payment", "add payment");
    await switchBranch(repo.dir, "main");

    const { git } = await openRepository(repo.dir);
    const exists = await branchExists(git, "feature/payment");
    expect(exists).toBe(true);

    const info = await resolveBranchRef(git, "feature/payment");
    expect(info.shortName).toBe("feature/payment");
    expect(info.headCommit).toHaveLength(40);
  });

  // Test 11 — Invalid branch → clean structured error
  it("returns BRANCH_NOT_FOUND for a non-existent branch", async () => {
    repo = await createTestRepo("branch-missing");
    const { git } = await openRepository(repo.dir);
    await expect(resolveBranchRef(git, "does-not-exist")).rejects.toMatchObject({
      ConflictLensError: { code: "BRANCH_NOT_FOUND" },
    });
  });

  it("detects detached HEAD as null from getCurrentBranch", async () => {
    repo = await createTestRepo("detached-head");
    const sha = await commitFile(repo.dir, "f.js", "x", "commit for detach");
    // Detach HEAD by checking out a specific SHA
    const git2 = (await openRepository(repo.dir)).git;
    try {
      await git2.checkout(sha);
      const branch = await getCurrentBranch(git2);
      // In detached state, symbolic-ref fails → returns null
      expect(branch).toBeNull();
    } finally {
      await git2.checkout("main"); // restore
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — Merge Base
// ---------------------------------------------------------------------------
describe("GitMergeBase", () => {
  let repo: TestRepo;

  afterEach(() => repo?.cleanup());

  it("finds common ancestor of two diverged branches", async () => {
    repo = await createTestRepo("mergebase");
    const ancestorSha = (await openRepository(repo.dir)).git;

    // Get the initial commit SHA
    const initSha = (await ancestorSha.raw(["rev-parse", "HEAD"])).trim();

    // Create branch A
    await createBranch(repo.dir, "branch-a");
    await commitFile(repo.dir, "a.js", "const a = 1;", "add a");
    await switchBranch(repo.dir, "main");

    // Create branch B
    await createBranch(repo.dir, "branch-b");
    await commitFile(repo.dir, "b.js", "const b = 2;", "add b");
    await switchBranch(repo.dir, "main");

    const { git } = await openRepository(repo.dir);
    const base = await getMergeBase(git, "branch-a", "branch-b");
    expect(base).toBe(initSha);
  });

  it("handles identical branches (merge base = HEAD)", async () => {
    repo = await createTestRepo("mergebase-identical");
    const { git } = await openRepository(repo.dir);

    // Create two branches from the same point with no additional commits
    await createBranch(repo.dir, "branch-x");
    await switchBranch(repo.dir, "main");
    await createBranch(repo.dir, "branch-y");
    await switchBranch(repo.dir, "main");

    const base = await getMergeBase(git, "branch-x", "branch-y");
    const head = (await git.raw(["rev-parse", "main"])).trim();
    expect(base).toBe(head);
  });

  it("returns BRANCH_NOT_FOUND for unknown ref", async () => {
    repo = await createTestRepo("mergebase-missing");
    const { git } = await openRepository(repo.dir);
    await expect(getMergeBase(git, "main", "nonexistent")).rejects.toMatchObject({
      ConflictLensError: { code: expect.stringMatching(/BRANCH_NOT_FOUND|MERGE_BASE_UNAVAILABLE/) },
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — Commit intelligence
// ---------------------------------------------------------------------------
describe("GitCommit.compareBranches", () => {
  let repo: TestRepo;

  afterEach(() => repo?.cleanup());

  // Test 1 — Identical branches → no commits ahead
  it("returns 0 commits ahead when branches are identical", async () => {
    repo = await createTestRepo("commits-identical");
    const { git } = await openRepository(repo.dir);
    const base = (await git.raw(["rev-parse", "HEAD"])).trim();
    const result = await compareBranches(git, "main", "main", base);
    expect(result.commitsAheadA).toBe(0);
    expect(result.commitsAheadB).toBe(0);
    expect(result.diverged).toBe(false);
  });

  it("detects divergence correctly", async () => {
    repo = await createTestRepo("commits-diverged");

    await createBranch(repo.dir, "a");
    await commitFile(repo.dir, "a1.js", "1", "a1");
    await commitFile(repo.dir, "a2.js", "2", "a2");
    await switchBranch(repo.dir, "main");

    await createBranch(repo.dir, "b");
    await commitFile(repo.dir, "b1.js", "1", "b1");
    await switchBranch(repo.dir, "main");

    const { git } = await openRepository(repo.dir);
    const mergeBase = await getMergeBase(git, "a", "b");
    const result = await compareBranches(git, "a", "b", mergeBase);

    expect(result.commitsAheadA).toBe(2);
    expect(result.commitsAheadB).toBe(1);
    expect(result.diverged).toBe(true);
    expect(result.commonAncestor).toBe(mergeBase);
  });
});
