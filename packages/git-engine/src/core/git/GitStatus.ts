/**
 * @file GitStatus.ts
 * Lightweight working-tree status queries (not part of the main analysis pipeline
 * but useful for the CLI tool and for detecting unstaged changes).
 */

import type { SimpleGit } from "simple-git";

export interface WorkingTreeStatus {
  isClean: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
}

export async function getWorkingTreeStatus(git: SimpleGit): Promise<WorkingTreeStatus> {
  const status = await git.status();
  return {
    isClean: status.isClean(),
    modifiedFiles: status.modified,
    untrackedFiles: status.not_added,
    stagedFiles: status.staged,
  };
}
