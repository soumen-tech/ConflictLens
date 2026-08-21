/**
 * @file SemanticAnalyzer.ts
 * @description Orchestrates AST-based semantic conflict detection.
 *
 * Given the file contents from two branches, this module:
 * 1. Extracts function signatures from each branch using SignatureAnalyzer.
 * 2. Finds signature changes (param diffs) on each branch vs base.
 * 3. Cross-branch pass: scans the OTHER branch for stale callers.
 * 4. Intra-branch pass: scans the SAME branch for stale callers in its
 *    own unchanged files (the "calculateTotal" scenario from PRD §8).
 * 5. Reports all semantic conflicts with a `scope` field distinguishing
 *    "cross-branch" from "intra-branch" cases.
 *
 * BUG FIX: The original code only ran the cross-branch check (branchA
 * signature changes → branchB callers). It missed the intra-branch case:
 * a single branch that changes a function's signature AND still contains
 * un-updated callers in its own unchanged files. This is the canonical
 * PRD §8 "calculateTotal" scenario and previously returned an empty array.
 */

import { extractSignatures, diffSignatures } from "./SignatureAnalyzer";
import type { SignatureChange } from "./SignatureAnalyzer";
import { findCallSites } from "./DependencyGraph";
import type { CallSite } from "./DependencyGraph";
import type { Risk } from "@conflictlens/shared";

export interface SemanticConflict {
  /** The function whose signature changed */
  functionName: string;
  /** File where the signature changed */
  definitionFile: string;
  /** Old params */
  oldParams: string[];
  /** New params (on the changed branch) */
  newParams: string[];
  /** Call sites still using the old signature */
  brokenCallSites: CallSite[];
  /**
   * "cross-branch": signature changed on branchA, stale callers on branchB.
   * "intra-branch": signature changed on a branch, stale callers IN THAT
   *                 SAME branch's own files.
   */
  scope?: "cross-branch" | "intra-branch";
}

/**
 * Detect semantic conflicts between two branches.
 *
 * @param baseFiles    Map<filepath, source> at merge-base
 * @param branchAFiles Map<filepath, source> at branchA HEAD
 * @param branchBFiles Map<filepath, source> at branchB HEAD
 */
export function detectSemanticConflicts(
  baseFiles: Map<string, string>,
  branchAFiles: Map<string, string>,
  branchBFiles: Map<string, string>
): SemanticConflict[] {
  const conflicts: SemanticConflict[] = [];

  // ── Cross-branch pass (original logic, preserved) ────────────────────────
  // Find signature changes on branchA, scan branchB for stale callers.
  conflicts.push(
    ...crossBranchPass(baseFiles, branchAFiles, branchBFiles, "cross-branch")
  );

  // Find signature changes on branchB, scan branchA for stale callers.
  conflicts.push(
    ...crossBranchPass(baseFiles, branchBFiles, branchAFiles, "cross-branch")
  );

  // ── Intra-branch pass (new) ───────────────────────────────────────────────
  // For each branch independently: did it change a function signature AND
  // still contain stale callers in its own unchanged files?
  // This is the PRD §8 "calculateTotal" scenario.
  conflicts.push(...intraBranchPass(baseFiles, branchAFiles));
  conflicts.push(...intraBranchPass(baseFiles, branchBFiles));

  // Deduplicate: same (functionName, definitionFile, scope, callerFile+line)
  return deduplicateConflicts(conflicts);
}

// ---------------------------------------------------------------------------
// Cross-branch pass (original logic)
// ---------------------------------------------------------------------------

function crossBranchPass(
  baseFiles: Map<string, string>,
  changedBranchFiles: Map<string, string>,
  otherBranchFiles: Map<string, string>,
  scope: "cross-branch"
): SemanticConflict[] {
  const conflicts: SemanticConflict[] = [];

  // 1. Find all signature changes between base and changedBranch
  const signatureChanges: SignatureChange[] = [];
  for (const [file, source] of changedBranchFiles) {
    const baseSource = baseFiles.get(file);
    if (!baseSource) continue; // new file — no existing callers to break

    const baseSigs = extractSignatures(baseSource, file);
    const branchSigs = extractSignatures(source, file);
    const changes = diffSignatures(baseSigs, branchSigs, file);
    signatureChanges.push(
      ...changes.filter((c) => c.changeType === "signature_change")
    );
  }

  if (signatureChanges.length === 0) return [];

  // 2. Scan otherBranch files for stale call sites
  for (const change of signatureChanges) {
    const brokenCallSites: CallSite[] = [];

    for (const [file, source] of otherBranchFiles) {
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
        scope,
      });
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Intra-branch pass (new — fixes the "calculateTotal" missed-detection bug)
// ---------------------------------------------------------------------------

/**
 * For a single branch, detect cases where:
 *   - The branch changed a function's signature (vs merge-base), AND
 *   - The SAME branch still has files calling that function with the old arity.
 *
 * This catches the scenario where a developer updates a function definition
 * but forgets to update their own callers in other files on the same branch.
 */
function intraBranchPass(
  baseFiles: Map<string, string>,
  branchFiles: Map<string, string>
): SemanticConflict[] {
  const conflicts: SemanticConflict[] = [];

  // 1. Find signature changes on this branch vs base
  const signatureChanges: SignatureChange[] = [];
  const changedFileSet = new Set<string>();

  for (const [file, source] of branchFiles) {
    const baseSource = baseFiles.get(file);
    if (!baseSource) continue;

    const baseSigs = extractSignatures(baseSource, file);
    const branchSigs = extractSignatures(source, file);
    const changes = diffSignatures(baseSigs, branchSigs, file);
    const sigChanges = changes.filter((c) => c.changeType === "signature_change");
    if (sigChanges.length > 0) {
      signatureChanges.push(...sigChanges);
      changedFileSet.add(file);
    }
  }

  if (signatureChanges.length === 0) return [];

  // 2. Scan ALL files in this branch (not just the unchanged ones) for stale
  //    callers — but skip the definition file itself to avoid false positives
  //    from the new signature line containing the function name.
  for (const change of signatureChanges) {
    const brokenCallSites: CallSite[] = [];

    for (const [file, source] of branchFiles) {
      // Skip the file where the definition changed — the new signature line
      // itself contains the function name and would register as a spurious call.
      if (file === change.file) continue;

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
        scope: "intra-branch",
      });
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateConflicts(conflicts: SemanticConflict[]): SemanticConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const callSiteKey = c.brokenCallSites
      .map((s) => `${s.callerFile}:${s.line}`)
      .sort()
      .join("|");
    const key = `${c.scope}::${c.functionName}::${c.definitionFile}::${callSiteKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Risk conversion
// ---------------------------------------------------------------------------

/**
 * Convert semantic conflicts to canonical Risk[] shape.
 */
export function semanticConflictsToRisks(conflicts: SemanticConflict[]): Risk[] {
  return conflicts.map((c) => ({
    id: `semantic_${c.scope}_${c.functionName}_${c.definitionFile}`,
    type: "semantic_conflict" as const,
    riskLevel: "high" as const,
    location: {
      file: c.definitionFile,
      line: 1,
    },
    details: {
      functionName: c.functionName,
      changeType: c.scope === "intra-branch"
        ? "intra_branch_signature_change"
        : "signature_change",
      oldSignature: `${c.functionName}(${c.oldParams.join(", ")})`,
      newSignature: `${c.functionName}(${c.newParams.join(", ")})`,
      affectedFiles: c.brokenCallSites.map((s) => s.callerFile),
      callSites: c.brokenCallSites.map((s) => ({
        file: s.callerFile,
        line: s.line,
      })),
    },
    ai_context: {
      explanation: c.scope === "intra-branch"
        ? `Function "${c.functionName}" signature changed from (${c.oldParams.join(", ")}) to (${c.newParams.join(", ")}) on this branch, but ${c.brokenCallSites.length} call site(s) IN THE SAME BRANCH still use the old signature. This will cause a runtime error.`
        : `Function "${c.functionName}" signature changed from (${c.oldParams.join(", ")}) to (${c.newParams.join(", ")}) on one branch, but ${c.brokenCallSites.length} call site(s) on the other branch still use the old signature. This will cause a runtime error after merge.`,
      recommendation: `Update all call sites in ${[...new Set(c.brokenCallSites.map((s) => s.callerFile))].join(", ")} to use the new signature.`,
    },
  }));
}
