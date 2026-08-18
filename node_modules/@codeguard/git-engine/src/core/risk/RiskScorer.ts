/**
 * @file RiskScorer.ts
 * Phase 9 — Unified, multi-factor, deterministic risk scoring engine.
 *
 * Thresholds:
 *  0–19   → LOW
 *  20–49  → MEDIUM
 *  50–79  → HIGH
 *  80–100 → CRITICAL
 *
 * The score is deterministic: same inputs always produce the same score.
 * No ML, no randomness, no "overlap = 100" shortcuts.
 * Every score lists its contributing factors.
 */

import type { RiskAssessment, RiskLevel, ConflictCandidate } from "../../shared/types/gitConflictResult";
import { RISK_FACTORS } from "./RiskFactors";
import type { RiskInput } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the overall repository-level risk score from all conflict candidates.
 */
export function computeRiskScore(input: RiskInput): RiskAssessment {
  const { conflicts, files, commitsAheadA, commitsAheadB } = input;

  // If there are no candidates at all, it's trivially LOW
  if (conflicts.length === 0 && files.length === 0) {
    return {
      score: 0,
      level: "LOW",
      factors: ["No conflicting changes detected between the branches"],
    };
  }

  let totalScore = 0;
  const activeFactors: string[] = [];

  // Evaluate each weighted factor
  for (const factor of RISK_FACTORS) {
    if (factor.applies(conflicts, files, commitsAheadA, commitsAheadB)) {
      totalScore += factor.weight;
      activeFactors.push(factor.name);
    }
  }

  // Also add per-conflict overlap scoring (additive bonus up to 15 extra points)
  const overlapBonus = computeOverlapBonus(conflicts);
  totalScore += overlapBonus.bonus;
  if (overlapBonus.reason) activeFactors.push(overlapBonus.reason);

  const finalScore = Math.min(Math.round(totalScore), 100);
  const level = scoreToLevel(finalScore);

  // Always explain what drove the score
  if (activeFactors.length === 0) {
    activeFactors.push("Nearby changes — low interaction risk only");
  }

  return {
    score: finalScore,
    level,
    factors: activeFactors,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}

/** Bonus points based on total number of overlapping hunk pairs */
function computeOverlapBonus(
  candidates: ConflictCandidate[]
): { bonus: number; reason: string } {
  const totalHunkPairs = candidates.reduce(
    (sum, c) => sum + c.overlappingRanges.length,
    0
  );

  if (totalHunkPairs > 5) {
    return { bonus: 15, reason: `High number of overlapping hunk pairs (${totalHunkPairs})` };
  }
  if (totalHunkPairs > 2) {
    return { bonus: 8, reason: `Multiple overlapping hunk pairs (${totalHunkPairs})` };
  }
  return { bonus: 0, reason: "" };
}
