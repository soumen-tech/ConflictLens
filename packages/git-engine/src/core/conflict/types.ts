/**
 * @file types.ts  (core/conflict)
 * Internal types for the conflict analysis layer.
 */

import type { ChangedRange, OverlapLevel } from "../../shared/types/gitConflictResult";

export interface RangeOverlap {
  rangeA: ChangedRange;
  rangeB: ChangedRange;
  overlapLevel: OverlapLevel;
  /** Number of lines that actually overlap */
  overlappingLines: number;
}

export interface FileOverlapResult {
  file: string;
  overlapLevel: OverlapLevel;
  overlaps: RangeOverlap[];
}
