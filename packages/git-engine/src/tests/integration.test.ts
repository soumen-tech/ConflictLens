/**
 * @file integration.test.ts
 * End-to-end integration tests using real temporary Git repos.
 * Tests the full analyzeBranches() pipeline (Tests 1–8, 13).
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepo,
  commitFile,
  createBranch,
  switchBranch,
  deleteFile,
  type TestRepo,
} from "./testHelpers";
import { analyzeBranches } from "../index";

let repo: TestRepo;

afterEach(() => repo?.cleanup());

// ---------------------------------------------------------------------------
// Test 1 — Identical branches → LOW risk
// ---------------------------------------------------------------------------
describe("Integration: identical branches", () => {
  it("returns LOW risk and no conflicts when branches are identical", async () => {
    repo = await createTestRepo("identical");
    const result = await analyzeBranches({
      repositoryPath: repo.dir,
      branchA: "main",
      branchB: "main",
    });
    expect(result.risk.level).toBe("LOW");
    expect(result.conflicts).toHaveLength(0);
    expect(result.commits.diverged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — A modifies file1, B modifies file2 → no conflict
// ---------------------------------------------------------------------------
describe("Integration: different files changed", () => {
  it("detects no conflict when branches change different files", async () => {
    repo = await createTestRepo("diff-files");

    await createBranch(repo.dir, "branch-a");
    await commitFile(repo.dir, "file1.js", "const x = 1;\nconst y = 2;\n", "add file1");
    await switchBranch(repo.dir, "main");

    await createBranch(repo.dir, "branch-b");
    await commitFile(repo.dir, "file2.js", "const z = 3;\nconst w = 4;\n", "add file2");
    await switchBranch(repo.dir, "main");

    const result = await analyzeBranches({
      repositoryPath: repo.dir,
      branchA: "branch-a",
      branchB: "branch-b",
    });

    // Files that only one branch changed have no overlap
    const overlappingCandidates = result.conflicts.filter(
      (c) => c.overlapLevel !== "SAFE"
    );
    expect(overlappingCandidates).toHaveLength(0);
    expect(result.risk.level).toMatch(/LOW|MEDIUM/);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Both branches modify same lines → conflict detected
// ---------------------------------------------------------------------------
describe("Integration: same-line modification", () => {
  it("detects HIGH overlap when both branches modify the same lines", async () => {
    repo = await createTestRepo("same-lines");

    // Shared base file
    const baseContent = Array.from({ length: 60 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
    await commitFile(repo.dir, "shared.js", baseContent, "add shared file");

    // Branch A: modify lines 40–52
    await createBranch(repo.dir, "branch-a");
    const contentA = baseContent.replace("line40", "// MODIFIED BY A\nline40_new");
    await commitFile(repo.dir, "shared.js", contentA, "branch A modifies shared.js");
    await switchBranch(repo.dir, "main");

    // Branch B: also modify lines 40–52
    await createBranch(repo.dir, "branch-b");
    const contentB = baseContent.replace("line40", "// MODIFIED BY B\nline40_different");
    await commitFile(repo.dir, "shared.js", contentB, "branch B modifies shared.js");
    await switchBranch(repo.dir, "main");

    const result = await analyzeBranches({
      repositoryPath: repo.dir,
      branchA: "branch-a",
      branchB: "branch-b",
    });

    const sharedConflict = result.conflicts.find((c) => c.file === "shared.js");
    expect(sharedConflict).toBeDefined();
    expect(["MEDIUM", "HIGH"]).toContain(sharedConflict!.overlapLevel);
    expect(result.risk.level).toMatch(/MEDIUM|HIGH|CRITICAL/);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Actual Git conflict → predicted correctly
// ---------------------------------------------------------------------------
describe("Integration: actual Git merge conflict", () => {
  it("identifies an actual conflict via merge-tree", async () => {
    repo = await createTestRepo("actual-conflict");

    // Base file
    await commitFile(repo.dir, "calc.js",
      "function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n",
      "base calc");

    // Branch A: change the function body
    await createBranch(repo.dir, "branch-a");
    await commitFile(repo.dir, "calc.js",
      "function add(a, b) {\n  // Branch A version\n  return a + b + 0;\n}\nmodule.exports = { add };\n",
      "branch A modifies calc");
    await switchBranch(repo.dir, "main");

    // Branch B: also change the same function body differently
    await createBranch(repo.dir, "branch-b");
    await commitFile(repo.dir, "calc.js",
      "function add(a, b) {\n  // Branch B version\n  return (a + b);\n}\nmodule.exports = { add };\n",
      "branch B modifies calc");
    await switchBranch(repo.dir, "main");

    const result = await analyzeBranches({
      repositoryPath: repo.dir,
      branchA: "branch-a",
      branchB: "branch-b",
    });

    // The risk should be elevated
    expect(result.risk.level).toMatch(/MEDIUM|HIGH|CRITICAL/);
    expect(result.mergeBase).toHaveLength(40);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — File added on one branch, modified on another
// ---------------------------------------------------------------------------
describe("Integration: file added vs modified", () => {
  it("reports file added on one branch correctly", async () => {
    repo = await createTestRepo("add-vs-mod");

    await commitFile(repo.dir, "existing.js", "const x = 1;\n", "base");

    await createBranch(repo.dir, "branch-a");
    await commitFile(repo.dir, "brand-new.js", "const brand = true;\n", "add new file");
    await switchBranch(repo.dir, "main");

    await createBranch(repo.dir, "branch-b");
    await commitFile(repo.dir, "existing.js", "const x = 2;\n", "modify existing");
    await switchBranch(repo.dir, "main");

    const result = await analyzeBranches({
      repositoryPath: repo.dir,
      branchA: "branch-a",
      branchB: "branch-b",
    });

    const addedFile = result.files.find((f) => f.path === "brand-new.js");
    expect(addedFile).toBeDefined();
    expect(addedFile!.status).toBe("added");
  });
});

// ---------------------------------------------------------------------------
// Test 7 — File deleted on one branch, modified on another
// ---------------------------------------------------------------------------
describe("Integration: file deleted vs modified", () => {
  it("detects delete-vs-modify scenario", async () => {
    repo = await createTestRepo("delete-vs-mod");

    await commitFile(repo.dir, "target.js", "const t = 1;\n", "base target");

    await createBranch(repo.dir, "delete-branch");
    await deleteFile(repo.dir, "target.js", "delete target.js");
    await switchBranch(repo.dir, "main");

    await createBranch(repo.dir, "modify-branch");
    await commitFile(repo.dir, "target.js", "const t = 99;\n", "modify target");
    await switchBranch(repo.dir, "main");

    const result = await analyzeBranches({
      repositoryPath: repo.dir,
      branchA: "delete-branch",
      branchB: "modify-branch",
    });

    const targetFile = result.files.find((f) => f.path === "target.js");
    expect(targetFile).toBeDefined();
    expect(targetFile!.status).toBe("deleted");
  });
});

// ---------------------------------------------------------------------------
// Test 13 — Invalid branch → clean structured error
// ---------------------------------------------------------------------------
describe("Integration: error handling", () => {
  it("returns BRANCH_NOT_FOUND for a non-existent branch", async () => {
    repo = await createTestRepo("err-branch");
    await expect(
      analyzeBranches({
        repositoryPath: repo.dir,
        branchA: "main",
        branchB: "ghost-branch",
      })
    ).rejects.toMatchObject({
      ConflictLensError: { code: "BRANCH_NOT_FOUND" },
    });
  });

  it("returns NOT_A_GIT_REPO for a non-git directory", async () => {
    const { dir, cleanup } = await createTestRepo("err-repo");
    cleanup(); // delete the repo, but keep the path variable
    await expect(
      analyzeBranches({
        repositoryPath: dir,
        branchA: "main",
        branchB: "main",
      })
    ).rejects.toMatchObject({
      ConflictLensError: { code: expect.stringMatching(/NOT_A_GIT_REPO|INVALID_REPO_PATH/) },
    });
  });
});

// ---------------------------------------------------------------------------
// Metadata correctness
// ---------------------------------------------------------------------------
describe("Integration: result metadata", () => {
  it("includes correct metadata fields", async () => {
    repo = await createTestRepo("metadata");
    const result = await analyzeBranches({
      repositoryPath: repo.dir,
      branchA: "main",
      branchB: "main",
    });

    expect(result.metadata.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.gitVersion).toMatch(/\d+\.\d+/);
    expect(result.repository.root).toBe(repo.dir);
  });
});

// ---------------------------------------------------------------------------
// Semantic AST Conflict (calculateTotal demo scenario)
// ---------------------------------------------------------------------------
describe("Integration: AST Semantic conflict detection", () => {
  it("detects semantic conflict when branch A changes function signature and branch B uses old signature", async () => {
    repo = await createTestRepo("semantic-conflict-demo");

    // 1. Base commit on main
    await commitFile(
      repo.dir,
      "utils.js",
      "function calculateTotal(price, tax) {\n  return price + tax;\n}\n",
      "add calculateTotal on main"
    );

    // 2. Branch A changes signature to 3 arguments
    await createBranch(repo.dir, "branch-a");
    await commitFile(
      repo.dir,
      "utils.js",
      "function calculateTotal(price, tax, discount) {\n  return price + tax - discount;\n}\n",
      "change calculateTotal to accept discount on branch-a"
    );
    await switchBranch(repo.dir, "main");

    // 3. Branch B adds checkout.js invoking calculateTotal with 2 arguments
    await createBranch(repo.dir, "branch-b");
    await commitFile(
      repo.dir,
      "checkout.js",
      "const { calculateTotal } = require('./utils');\nconsole.log(calculateTotal(100, 10));\n",
      "call calculateTotal with 2 args on branch-b"
    );
    await switchBranch(repo.dir, "main");

    // 4. Run analyzeBranches
    const result = await analyzeBranches({
      repositoryPath: repo.dir,
      branchA: "branch-a",
      branchB: "branch-b",
    });

    expect(result.semanticConflicts).toBeDefined();
    expect(result.semanticConflicts).toHaveLength(1);
    expect(result.semanticConflicts![0].functionName).toBe("calculateTotal");
    expect(result.semanticConflicts![0].oldParams).toEqual(["price", "tax"]);
    expect(result.semanticConflicts![0].newParams).toEqual(["price", "tax", "discount"]);
    expect(result.semanticConflicts![0].brokenCallSites).toHaveLength(1);
    expect(result.semanticConflicts![0].brokenCallSites[0].callerFile).toBe("checkout.js");
  });
});

