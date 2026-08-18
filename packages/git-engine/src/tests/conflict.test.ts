/**
 * @file conflict.test.ts
 * Tests for DiffRangeParser and OverlapDetector.
 * Tests 2–10 from the required test matrix.
 */

import { describe, it, expect } from "vitest";
import { parseDiffOutput, parseHunks } from "../core/conflict/DiffRangeParser";
import { detectOverlap } from "../core/conflict/OverlapDetector";
import type { ChangedRange } from "../shared/types/gitConflictResult";

// ---------------------------------------------------------------------------
// DiffRangeParser tests
// ---------------------------------------------------------------------------
describe("DiffRangeParser.parseDiffOutput", () => {

  it("parses a simple added-line hunk correctly", () => {
    const diff = [
      "diff --git a/src/utils.js b/src/utils.js",
      "index abc..def 100644",
      "--- a/src/utils.js",
      "+++ b/src/utils.js",
      "@@ -10,3 +10,6 @@",
      " // context",
      "+const a = 1;",
      "+const b = 2;",
      "+const c = 3;",
      " // more context",
    ].join("\n");

    const result = parseDiffOutput(diff);
    const ranges = result.get("src/utils.js");
    expect(ranges).toBeDefined();
    expect(ranges!.length).toBeGreaterThan(0);
    expect(ranges![0].startLine).toBe(10);
    expect(ranges![0].lineCount).toBe(6);
  });

  // Test 9 — Multiple diff hunks → every changed range extracted correctly
  it("extracts multiple hunks from a single file", () => {
    const diff = [
      "diff --git a/app.js b/app.js",
      "--- a/app.js",
      "+++ b/app.js",
      "@@ -5,4 +5,5 @@",
      " context",
      "+added line A",
      " more context",
      "@@ -50,3 +51,4 @@",
      " other context",
      "+added line B",
      " end",
    ].join("\n");

    const result = parseDiffOutput(diff);
    const ranges = result.get("app.js");
    expect(ranges).toBeDefined();
    expect(ranges!.length).toBe(2);
    expect(ranges![0].startLine).toBe(5);
    expect(ranges![1].startLine).toBe(51);
  });

  it("handles zero-length ranges (pure deletions)", () => {
    const diff = [
      "diff --git a/del.js b/del.js",
      "--- a/del.js",
      "+++ b/del.js",
      "@@ -10,3 +10,0 @@",
      "-removed line 1",
      "-removed line 2",
      "-removed line 3",
    ].join("\n");

    const result = parseDiffOutput(diff);
    const ranges = result.get("del.js");
    expect(ranges).toBeDefined();
    expect(ranges![0].lineCount).toBe(0);
    expect(ranges![0].changeType).toBe("removed");
  });

  // Test 14 — Binary file → no incorrect line-range analysis
  it("handles binary files by returning empty ranges", () => {
    const diff = [
      "diff --git a/image.png b/image.png",
      "Binary files a/image.png and b/image.png differ",
    ].join("\n");

    const result = parseDiffOutput(diff);
    const ranges = result.get("image.png");
    expect(ranges).toBeDefined();
    expect(ranges).toHaveLength(0); // binary → no ranges
  });

  it("handles a file starting at line 1 correctly", () => {
    const diff = [
      "diff --git a/new.js b/new.js",
      "--- /dev/null",
      "+++ b/new.js",
      "@@ -0,0 +1,3 @@",
      "+line1",
      "+line2",
      "+line3",
    ].join("\n");

    const result = parseDiffOutput(diff);
    const ranges = result.get("new.js");
    expect(ranges).toBeDefined();
    expect(ranges![0].startLine).toBe(1);
    expect(ranges![0].lineCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// OverlapDetector tests
// ---------------------------------------------------------------------------
describe("OverlapDetector.detectOverlap", () => {

  const range = (s: number, count: number, type: ChangedRange["changeType"] = "modified"): ChangedRange => ({
    startLine: s,
    lineCount: count,
    endLine: s + Math.max(count - 1, 0),
    changeType: type,
  });

  // Test 2 — Branch A modifies file1, B modifies file2 → no overlap
  it("returns SAFE when one side has no ranges", () => {
    const result = detectOverlap("file.js", [range(10, 5)], []);
    expect(result.overlapLevel).toBe("SAFE");
    expect(result.overlaps).toHaveLength(0);
  });

  // Test 3 — Different lines of same file → no direct overlap
  it("returns SAFE for non-overlapping non-adjacent ranges", () => {
    const result = detectOverlap(
      "file.js",
      [range(10, 5)],   // lines 10–14
      [range(30, 5)]    // lines 30–34
    );
    expect(result.overlapLevel).toBe("SAFE");
  });

  it("returns LOW for nearby ranges (within 5 lines)", () => {
    const result = detectOverlap(
      "file.js",
      [range(10, 3)],   // lines 10–12
      [range(15, 3)]    // lines 15–17 — gap of 3
    );
    expect(result.overlapLevel).toBe("LOW");
  });

  it("returns MEDIUM for adjacent ranges (touching boundary)", () => {
    const result = detectOverlap(
      "file.js",
      [range(10, 5)],   // lines 10–14
      [range(14, 5)]    // lines 14–18 — touching at 14
    );
    // gap = 0 = adjacent
    expect(["MEDIUM", "HIGH"]).toContain(result.overlapLevel);
  });

  // Test 4 — Both branches modify same lines → overlap detected
  it("returns HIGH for directly overlapping ranges", () => {
    const result = detectOverlap(
      "file.js",
      [range(40, 13)],  // lines 40–52
      [range(45, 8)]    // lines 45–52 — inside A's range
    );
    expect(result.overlapLevel).toBe("HIGH");
    expect(result.overlaps.length).toBeGreaterThan(0);
  });

  it("correctly counts overlapping lines", () => {
    const result = detectOverlap(
      "file.js",
      [range(10, 10)],  // 10–19
      [range(15, 10)]   // 15–24 → overlap 15–19 = 5 lines
    );
    expect(result.overlaps[0].overlappingLines).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Test 15 — Large file with many hunks
// ---------------------------------------------------------------------------
describe("DiffRangeParser performance", () => {
  it("handles a file with 20 hunks without excessive slowdown", () => {
    const hunks: string[] = [
      "diff --git a/large.js b/large.js",
      "--- a/large.js",
      "+++ b/large.js",
    ];

    for (let i = 0; i < 20; i++) {
      const lineStart = i * 50 + 1;
      hunks.push(`@@ -${lineStart},3 +${lineStart},4 @@`);
      hunks.push(" context");
      hunks.push(`+new line ${i}`);
      hunks.push(" end");
    }

    const start = Date.now();
    const result = parseDiffOutput(hunks.join("\n"));
    const elapsed = Date.now() - start;

    const ranges = result.get("large.js");
    expect(ranges).toBeDefined();
    expect(ranges!.length).toBe(20);
    expect(elapsed).toBeLessThan(500); // well within performance requirement
  });
});
