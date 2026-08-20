/**
 * @file SemanticAnalyzer.ts
 * @description Orchestrates AST-based semantic conflict detection.
 *
 * Given the file contents from two branches, this module:
 * 1. Extracts function signatures from each branch using SignatureAnalyzer.
 * 2. Finds signature changes (param diffs) on branchA.
 * 3. Scans branchB files for call sites referencing changed functions.
 * 4. Reports semantic conflicts where a function's signature changed on
 *    one branch but callers on the other branch still use the old arity.
 *
 * This detects the PRD §8 "calculateTotal" scenario: signature changes on
 * branchA that break callers on branchB even without any overlapping lines.
 */

import { extractSignatures, diffSignatures } from "./SignatureAnalyzer";
import type { SignatureChange } from "./SignatureAnalyzer";
import { findCallSites } from "./DependencyGraph";
import type { CallSite } from "./DependencyGraph";
import type { Risk } from "@codeguard/shared";

export interface SemanticConflict {
  /** The function whose signature changed */
  functionName: string;
  /** File where the signature changed (branch A) */
  definitionFile: string;
  /** Old params */
  oldParams: string[];
  /** New params (on branch A) */
  newParams: string[];
  /** Call sites on branch B still using the old signature */
  brokenCallSites: CallSite[];
}

/**
 * Detect semantic conflicts between two branches.
 *
 * @param baseFiles   Map<filepath, source> at merge-base
 * @param branchAFiles Map<filepath, source> at branchA HEAD
 * @param branchBFiles Map<filepath, source> at branchB HEAD
 */
export function detectSemanticConflicts(
  baseFiles: Map<string, string>,
  branchAFiles: Map<string, string>,
  branchBFiles: Map<string, string>
): SemanticConflict[] {
  const conflicts: SemanticConflict[] = [];

  // 1. Find all signature changes between base and branchA
  const allSignatureChanges: SignatureChange[] = [];
  for (const [file, branchASource] of branchAFiles) {
    const baseSource = baseFiles.get(file);
    if (!baseSource) continue; // new file on branchA — no conflict possible

    const baseSigs = extractSignatures(baseSource, file);
    const branchASigs = extractSignatures(branchASource, file);
    const changes = diffSignatures(baseSigs, branchASigs, file);
    allSignatureChanges.push(
      ...changes.filter((c) => c.changeType === "signature_change")
    );
  }

  if (allSignatureChanges.length === 0) return [];

  // 2. Scan branchB files for call sites
  for (const change of allSignatureChanges) {
    const brokenCallSites: CallSite[] = [];

    for (const [file, source] of branchBFiles) {
      const callSites = findCallSites(source, file);
      for (const site of callSites) {
        if (site.calledFunction === change.functionName) {
          brokenCallSites.push(site);
        }
      }
    }

    if (brokenCallSites.length > 0) {
      conflicts.push({
        functionName: change.functionName,
        definitionFile: change.file,
        oldParams: change.oldParams,
        newParams: change.newParams,
        brokenCallSites,
      });
    }
  }

  return conflicts;
}

/**
 * Convert semantic conflicts to canonical Risk[] shape.
 */
export function semanticConflictsToRisks(conflicts: SemanticConflict[]): Risk[] {
  return conflicts.map((c) => ({
    id: `semantic_${c.functionName}_${c.definitionFile}`,
    type: "semantic_conflict" as const,
    riskLevel: "high" as const,
    location: {
      file: c.definitionFile,
      line: 1,
    },
    details: {
      functionName: c.functionName,
      changeType: "signature_change",
      oldSignature: `${c.functionName}(${c.oldParams.join(", ")})`,
      newSignature: `${c.functionName}(${c.newParams.join(", ")})`,
      affectedFiles: c.brokenCallSites.map((s) => s.callerFile),
      callSites: c.brokenCallSites.map((s) => ({
        file: s.callerFile,
        line: s.line,
      })),
    },
    ai_context: {
      explanation: `Function "${c.functionName}" signature changed from (${c.oldParams.join(", ")}) to (${c.newParams.join(", ")}) on one branch, but ${c.brokenCallSites.length} call site(s) on the other branch still use the old signature. This will cause a runtime error after merge.`,
      recommendation: `Update all call sites in ${[...new Set(c.brokenCallSites.map((s) => s.callerFile))].join(", ")} to use the new signature.`,
    },
  }));
}
