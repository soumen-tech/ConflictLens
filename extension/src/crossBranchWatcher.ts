import * as vscode from "vscode";
import simpleGit from "simple-git";
import {
  predictConflicts,
  listLocalBranches,
  listRemoteBranches,
  getCurrentBranch,
} from "../../packages/git-engine/src";

/**
 * Scan other local and remote branches for potential merge conflicts against
 * the developer's current branch.
 */
export async function checkCrossBranchConflicts(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;
  const workspacePath = folders[0].uri.fsPath;

  const git = simpleGit({ baseDir: workspacePath });

  try {
    const currentBranch = await getCurrentBranch(git);
    if (!currentBranch) return; // detached HEAD

    const [local, remote] = await Promise.all([
      listLocalBranches(git),
      listRemoteBranches(git),
    ]);

    const allBranches = new Set<string>();
    for (const b of local) {
      if (b.shortName !== currentBranch && b.shortName !== "main") {
        allBranches.add(b.shortName);
      }
    }
    for (const b of remote) {
      const name = b.shortName;
      // Skip HEAD pointers and references to main / current branch
      if (
        name !== currentBranch &&
        name !== "main" &&
        !name.includes("HEAD") &&
        !name.endsWith(`/${currentBranch}`) &&
        !name.endsWith("/main")
      ) {
        allBranches.add(name);
      }
    }

    // Run predictConflicts against each branch
    for (const otherBranch of allBranches) {
      try {
        const conflicts = await predictConflicts(git, currentBranch, otherBranch);
        for (const c of conflicts) {
          vscode.window.showWarningMessage(
            `Proactive Alert: '${c.file}' on your branch '${currentBranch}' will conflict with already-pushed branch '${otherBranch}' (${c.risk})`
          );
        }
      } catch (err) {
        console.warn(`[ConflictLens] Cross-branch check failed for branch ${otherBranch}:`, err);
      }
    }
  } catch (err) {
    console.error("[ConflictLens] Error checking cross-branch conflicts:", err);
  }
}
