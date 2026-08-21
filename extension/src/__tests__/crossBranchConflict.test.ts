import { describe, it, expect, vi, afterEach } from "vitest";
import * as vscode from "vscode";
import simpleGit from "simple-git";
import { createTestRepo, commitFile, createBranch, switchBranch, type TestRepo } from "../../../packages/git-engine/src/tests/testHelpers";
import { checkCrossBranchConflicts } from "../crossBranchWatcher";

let repo: TestRepo;

afterEach(() => {
  repo?.cleanup();
  vi.restoreAllMocks();
});

// Mock vscode module
vi.mock("vscode", () => {
  const showWarningMessage = vi.fn();
  return {
    window: {
      showWarningMessage,
    },
    workspace: {
      workspaceFolders: undefined as any,
    },
  };
});

describe("Cross-branch conflict warning integration", () => {
  it("asserts popup receives a HIGH_RISK result for shared file with overlapping edits", async () => {
    repo = await createTestRepo("cross-branch-e2e");
    const git = simpleGit({ baseDir: repo.dir });

    // Mock workspace folder
    (vscode.workspace as any).workspaceFolders = [
      {
        uri: { fsPath: repo.dir },
        name: "test-workspace",
        index: 0,
      },
    ];

    // 1. Shared base file on main
    const baseContent = "line1\nline2\nline3\nline4\nline5\n";
    await commitFile(repo.dir, "shared.js", baseContent, "add shared.js");

    // 2. Branch A: modify line 3
    await createBranch(repo.dir, "branch-a");
    await commitFile(repo.dir, "shared.js", "line1\nline2\nline3-modified-a\nline4\nline5\n", "branch A edit");
    await switchBranch(repo.dir, "main");

    // 3. Branch B: modify line 3 (overlapping)
    await createBranch(repo.dir, "branch-b");
    await commitFile(repo.dir, "shared.js", "line1\nline2\nline3-modified-b\nline4\nline5\n", "branch B edit");

    // At this point we are on branch-b (equivalent to simulating checking branch B).
    // We run the cross branch conflicts watcher.
    await checkCrossBranchConflicts();

    // 4. Assert that vscode.window.showWarningMessage was called
    // which indicates the popup component received a HIGH_RISK result.
    const warningCalls = (vscode.window.showWarningMessage as any).mock.calls;
    expect(warningCalls.length).toBeGreaterThanOrEqual(1);

    const warningText = warningCalls[0][0];
    expect(warningText).toContain("Potential merge conflict");
    expect(warningText).toContain("shared.js");
    expect(warningText).toContain("branch-a");
    expect(warningText).toContain("HIGH_RISK");
  });
});
