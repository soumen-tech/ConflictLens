/**
 * @file RiskFactors.ts
 * Phase 9 — Deterministic risk factor definitions.
 * Each factor has a fixed weight — no ML, no randomness.
 */

import type { ConflictCandidate, ChangedFile } from "../../shared/types/gitConflictResult";

export interface RiskFactor {
  name: string;
  weight: number;
  applies: (
    candidates: ConflictCandidate[],
    files: ChangedFile[],
    commitsAheadA: number,
    commitsAheadB: number
  ) => boolean;
}

/**
 * Ordered list of risk factors.
 * All weights sum to 100 when every factor applies (worst case = CRITICAL).
 */
export const RISK_FACTORS: RiskFactor[] = [
  {
    name: "Direct modification overlap on same lines",
    weight: 35,
    applies: (candidates) =>
      candidates.some((c) => c.overlapLevel === "HIGH"),
  },
  {
    name: "Git merge-tree predicts an actual merge conflict",
    weight: 25,
    applies: (candidates) => candidates.some((c) => c.hasActualConflict),
  },
  {
    name: "Multiple files with overlapping changes",
    weight: 15,
    applies: (candidates) =>
      candidates.filter((c) => c.overlapLevel === "HIGH" || c.overlapLevel === "MEDIUM").length > 1,
  },
  {
    name: "Adjacent modifications — potential merge interaction",
    weight: 10,
    applies: (candidates) =>
      candidates.some((c) => c.overlapLevel === "MEDIUM") &&
      !candidates.some((c) => c.overlapLevel === "HIGH"),
  },
  {
    name: "File deleted on one branch while modified on another",
    weight: 10,
    applies: (_candidates, files) =>
      files.some((f) => f.status === "deleted" && (f.changesA.length > 0 || f.changesB.length > 0)),
  },
  {
    name: "Binary file involved in conflicting change",
    weight: 5,
    applies: (candidates, files) =>
      candidates.some((c) => {
        const f = files.find((f) => f.path === c.file);
        return f?.isBinary === true;
      }),
  },
  {
    name: "Highly diverged branches (many commits ahead on both sides)",
    weight: 10,
    applies: (_candidates, _files, commitsAheadA, commitsAheadB) =>
      commitsAheadA >= 5 && commitsAheadB >= 5,
  },
  {
    name: "Moderately diverged branches",
    weight: 5,
    applies: (_candidates, _files, commitsAheadA, commitsAheadB) =>
      (commitsAheadA >= 2 || commitsAheadB >= 2) &&
      !(commitsAheadA >= 5 && commitsAheadB >= 5),
  },
];
