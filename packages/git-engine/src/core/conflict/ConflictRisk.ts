/**
 * @file ConflictRisk.ts
 * Combines overlap-level and actual-conflict data for a file into a
 * per-file risk classification (used by the RiskScorer).
 */

import type { ConflictCandidate } from "../../shared/types/gitConflictResult";

export interface FileRiskSummary {
  file: string;
  score: number;
  factors: string[];
}

/**
 * Score an individual conflict candidate.
 * Returns a 0–100 score for this file.
 */
export function scoreCandidate(candidate: ConflictCandidate): FileRiskSummary {
  let score = 0;
  const factors: string[] = [];

  // Direct line overlap (+40)
  if (candidate.overlapLevel === "HIGH") {
    score += 40;
    factors.push("Direct modification overlap on same lines");
  } else if (candidate.overlapLevel === "MEDIUM") {
    score += 20;
    factors.push("Adjacent modifications — may interact during merge");
  } else if (candidate.overlapLevel === "LOW") {
    score += 5;
    factors.push("Nearby modifications within 5 lines");
  }

  // Git-predicted conflict (+30)
  if (candidate.hasActualConflict) {
    score += 30;
    factors.push("Git merge-tree predicts an actual merge conflict");
  }

  // Multiple overlapping hunks (+15)
  if (candidate.overlappingRanges.length > 2) {
    score += 15;
    factors.push(`Multiple overlapping hunks (${candidate.overlappingRanges.length})`);
  } else if (candidate.overlappingRanges.length > 1) {
    score += 8;
    factors.push(`Two overlapping hunks`);
  }

  return { file: candidate.file, score: Math.min(score, 100), factors };
}
