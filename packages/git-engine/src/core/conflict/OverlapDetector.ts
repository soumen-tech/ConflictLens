/**
 * @file OverlapDetector.ts
 * Phase 7 — Line range overlap detection.
 *
 * Classifies overlap between branch A's and branch B's changed ranges.
 * Precise about what "overlap" means — not every textual overlap is a
 * guaranteed Git merge conflict, and we say so clearly.
 *
 * Classification:
 *  SAFE   — no interaction at all (ranges don't even touch)
 *  LOW    — ranges are close but not touching (<5 lines apart)
 *  MEDIUM — ranges are adjacent (touching boundary) or one contains the other's edge
 *  HIGH   — direct textual overlap (ranges share at least one line number)
 */

import type { ChangedRange, OverlapLevel } from "../../shared/types/gitConflictResult";
import type { FileOverlapResult, RangeOverlap } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect overlap between two sets of changed ranges (one from branch A,
 * one from branch B) for a single file.
 *
 * Returns the worst-case overlap level and all individual overlapping pairs.
 */
export function detectOverlap(
  file: string,
  rangesA: ChangedRange[],
  rangesB: ChangedRange[]
): FileOverlapResult {
  // If either branch didn't touch this file, it's safe
  if (rangesA.length === 0 || rangesB.length === 0) {
    return { file, overlapLevel: "SAFE", overlaps: [] };
  }

  const overlaps: RangeOverlap[] = [];
  let worstLevel: OverlapLevel = "SAFE";

  for (const a of rangesA) {
    for (const b of rangesB) {
      const { level, overlappingLines } = classifyRangePair(a, b);

      if (level !== "SAFE") {
        overlaps.push({ rangeA: a, rangeB: b, overlapLevel: level, overlappingLines });
      }

      worstLevel = maxLevel(worstLevel, level);
    }
  }

  return { file, overlapLevel: worstLevel, overlaps };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Classify the relationship between two individual ranges.
 */
function classifyRangePair(
  a: ChangedRange,
  b: ChangedRange
): { level: OverlapLevel; overlappingLines: number } {
  // Handle zero-length ranges (pure deletions)
  const aStart = a.startLine;
  const aEnd = a.lineCount === 0 ? a.startLine : a.endLine;
  const bStart = b.startLine;
  const bEnd = b.lineCount === 0 ? b.startLine : b.endLine;

  // Direct overlap: the ranges share at least one line number
  const overlapStart = Math.max(aStart, bStart);
  const overlapEnd = Math.min(aEnd, bEnd);

  if (overlapStart <= overlapEnd) {
    const overlappingLines = overlapEnd - overlapStart + 1;
    return { level: "HIGH", overlappingLines };
  }

  // Adjacent: ranges touch at exactly one boundary
  const gap = Math.min(Math.abs(aEnd - bStart), Math.abs(bEnd - aStart));

  if (gap === 0) {
    return { level: "MEDIUM", overlappingLines: 0 };
  }

  // Nearby: within 5 lines
  if (gap <= 5) {
    return { level: "LOW", overlappingLines: 0 };
  }

  return { level: "SAFE", overlappingLines: 0 };
}

/** Return the more severe of two OverlapLevels. */
function maxLevel(a: OverlapLevel, b: OverlapLevel): OverlapLevel {
  const order: OverlapLevel[] = ["SAFE", "LOW", "MEDIUM", "HIGH"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/** Convert overlap level to a readable label for reporting. */
export function overlapLevelLabel(level: OverlapLevel): string {
  const labels: Record<OverlapLevel, string> = {
    SAFE: "No overlap — safe",
    LOW: "Nearby changes — low interaction risk",
    MEDIUM: "Adjacent changes — potential interaction",
    HIGH: "Direct line overlap — likely textual conflict",
  };
  return labels[level];
}
