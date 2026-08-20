/**
 * @file types.ts  (core/risk)
 */

export interface RiskInput {
  conflicts: import("../../shared/types/gitConflictResult").ConflictCandidate[];
  files: import("../../shared/types/gitConflictResult").ChangedFile[];
  commitsAheadA: number;
  commitsAheadB: number;
  mergeTreeReliable: boolean;
}
