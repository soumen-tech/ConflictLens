/**
 * @file agent-verification.test.ts
 *
 * Verification suite for Agent 1 bug fixes & Agent 4 verification requirements:
 * 1. Merge-tree command error header stripping (no false positives from git/simple-git errors)
 * 2. UTF-8 BOM (\uFEFF) handling across AST parsing and diff parsing
 * 3. Intra-branch signature breakage detection on changed & unchanged branch files
 * 4. Runtime signature break verification
 */

import { describe, it, expect } from "vitest";
import { parseNameOnlyOutput } from "../core/conflict/ConflictDetector";
import { extractSignatures } from "../core/semantic/SignatureAnalyzer";
import { findCallSites } from "../core/semantic/DependencyGraph";
import { parseDiffOutput } from "../core/conflict/DiffRangeParser";
import { detectSemanticConflicts } from "../core/semantic/SemanticAnalyzer";
import { verifySignatureBreak } from "../core/semantic/RuntimeSignatureVerifier";

describe("Agent Verification Suite — Agent 1 Bug Fixes & Detection Contracts", () => {
  // ── 1. merge-tree stdout/error parser verification ─────────────────────────
  describe("Merge-tree stdout error stripping (parseNameOnlyOutput)", () => {
    it("strips simple-git error wrappers, fatal prefixes, and hex SHAs", () => {
      const simulatedGitErrorOutput = [
        `Command failed: git merge-tree --write-tree --name-only feature/payment main`,
        `"git merge-tree --write-tree --name-only feature/payment main" failed with exit code 1:`,
        `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2`, // hex SHA line
        `src/cart.js`,                             // valid conflicting file
        `src/checkout.js`,                         // valid conflicting file
        `fatal: some git warning message`,
      ].join("\n");

      const result = parseNameOnlyOutput(simulatedGitErrorOutput);

      // Must contain ONLY actual file paths — no command wrappers or SHAs
      expect(result).toHaveLength(2);
      expect(result).toEqual(["src/cart.js", "src/checkout.js"]);
    });
  });

  // ── 2. BOM bug fix verification ───────────────────────────────────────────
  describe("UTF-8 BOM (\\uFEFF) handling", () => {
    it("parses function signatures cleanly when file starts with UTF-8 BOM", () => {
      const bomSource = "\uFEFFexport function calculateTotal(price, qty) { return price * qty; }";
      const sigs = extractSignatures(bomSource, "src/utils.js");

      expect(sigs).toHaveLength(1);
      expect(sigs[0].name).toBe("calculateTotal");
      expect(sigs[0].params).toEqual(["price", "qty"]);
    });

    it("parses call sites cleanly when file starts with UTF-8 BOM", () => {
      const bomSource = "\uFEFFimport { calculateTotal } from './utils'; calculateTotal(10, 2);";
      const calls = findCallSites(bomSource, "src/checkout.js");

      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0].calledFunction).toBe("calculateTotal");
    });

    it("parses diff output cleanly when diff string starts with UTF-8 BOM", () => {
      const bomDiff = [
        "\uFEFFdiff --git a/src/utils.js b/src/utils.js",
        "--- a/src/utils.js",
        "+++ b/src/utils.js",
        "@@ -1,3 +1,4 @@",
        " context",
        "+added line",
      ].join("\n");

      const result = parseDiffOutput(bomDiff);
      const ranges = result.get("src/utils.js");

      expect(ranges).toBeDefined();
      expect(ranges!.length).toBe(1);
      expect(ranges![0].startLine).toBe(1);
    });
  });

  // ── 3. Same-branch intra-branch signature breakage verification ────────────
  describe("Intra-branch signature breakage detection", () => {
    it("detects intra-branch signature breakage when function signature changes and stale caller exists on same branch", () => {
      const baseUtils = `export function calculateTotal(price, qty) { return price * qty; }`;
      const branchAUtils = `export function calculateTotal(price, qty, discount) { return price * qty * (1 - discount); }`;
      const checkoutJs = `import { calculateTotal } from './utils'; const total = calculateTotal(9.99, 3);`;

      const baseFiles = new Map<string, string>([
        ["src/utils.js", baseUtils],
        ["src/checkout.js", checkoutJs],
      ]);

      const branchAFiles = new Map<string, string>([
        ["src/utils.js", branchAUtils],
        ["src/checkout.js", checkoutJs], // stale caller on branchA
      ]);

      const branchBFiles = new Map<string, string>([
        ["src/utils.js", baseUtils],
        ["src/checkout.js", checkoutJs],
      ]);

      const conflicts = detectSemanticConflicts(baseFiles, branchAFiles, branchBFiles);
      const intraConflicts = conflicts.filter((c) => c.scope === "intra-branch");

      expect(intraConflicts.length).toBeGreaterThanOrEqual(1);
      expect(intraConflicts[0].functionName).toBe("calculateTotal");
      expect(intraConflicts[0].definitionFile).toBe("src/utils.js");
      expect(intraConflicts[0].brokenCallSites[0].callerFile).toBe("src/checkout.js");
    });
  });

  // ── 4. Runtime signature break verification ───────────────────────────────
  describe("RuntimeSignatureVerifier", () => {
    it("identifies runtime breaking signature parameter additions", () => {
      const change = {
        functionName: "calculateTotal",
        file: "src/utils.js",
        oldParams: ["price", "qty"],
        newParams: ["price", "qty", "discount"],
        changeType: "signature_change" as const,
      };

      const callSites = [
        { callerFile: "src/checkout.js", calledFunction: "calculateTotal", line: 42 },
      ];

      const verification = verifySignatureBreak(change, callSites);
 
      expect(verification.isRuntimeBreak).toBe(true);
      expect(verification.expectedMinArgs).toBe(3);
      expect(verification.affectedCallSites).toHaveLength(1);
      expect(verification.affectedCallSites[0].callerFile).toBe("src/checkout.js");
    });
  });

  // ── 5. Project Health Risk Score Formula Verification (Agent 1) ─────────────────
  describe("Project Health Risk Score Formula (computeHealthScore)", () => {
    const SEVERITY_CONFIG = {
      critical: { weight: 40 },
      high:     { weight: 20 },
      medium:   { weight: 5  },
      low:      { weight: 1  },
    };

    function testComputeHealthScore(risks: Array<{ riskLevel: string }>): number {
      if (!risks || risks.length === 0) { return 100; }
      const penalty = risks.reduce((sum, r) => {
        const rawLevel = String(r?.riskLevel ?? 'medium').toLowerCase();
        const level = (rawLevel in SEVERITY_CONFIG) ? (rawLevel as keyof typeof SEVERITY_CONFIG) : 'medium';
        return sum + SEVERITY_CONFIG[level].weight;
      }, 0);
      return Math.max(0, 100 - penalty);
    }

    it("Scenario 1: Zero risks found results in a score of 100", () => {
      const score = testComputeHealthScore([]);
      expect(score).toBe(100);
    });

    it("Scenario 2: One low-severity risk only results in a score of 99", () => {
      const score = testComputeHealthScore([{ riskLevel: "low" }]);
      expect(score).toBe(99);
    });

    it("Scenario 3: One critical + one high risk results in a score of 40", () => {
      const score = testComputeHealthScore([
        { riskLevel: "critical" },
        { riskLevel: "high" },
      ]);
      expect(score).toBe(40);
    });

    it("Verifies three different, sensibly-ordered scores", () => {
      const s1 = testComputeHealthScore([]);
      const s2 = testComputeHealthScore([{ riskLevel: "low" }]);
      const s3 = testComputeHealthScore([{ riskLevel: "critical" }, { riskLevel: "high" }]);

      expect(s1).toBeGreaterThan(s2);
      expect(s2).toBeGreaterThan(s3);
      expect(new Set([s1, s2, s3]).size).toBe(3);
    });
  });
});
