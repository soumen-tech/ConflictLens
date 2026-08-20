/**
 * @file types.ts  (core/git)
 * Internal types used within the git layer.
 */

export interface RawBranchInfo {
  name: string;
  shortName: string;
  headCommit: string;
  isCurrent: boolean;
  upstream?: string;
  isRemote: boolean;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface BranchDivergence {
  branchA: string;
  branchB: string;
  commitsAheadA: number;
  commitsAheadB: number;
  commonAncestor: string;
  diverged: boolean;
}
