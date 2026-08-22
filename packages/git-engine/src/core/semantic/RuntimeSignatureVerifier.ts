/**
 * @file RuntimeSignatureVerifier.ts
 * @description Performs runtime contract verification for function signature changes.
 *
 * Verifies if call sites will experience runtime errors when executing updated function signatures.
 */

import type { CallSite } from "./DependencyGraph";
import type { SignatureChange } from "./SignatureAnalyzer";

export interface SignatureBreakVerificationResult {
  functionName: string;
  definitionFile: string;
  isRuntimeBreak: boolean;
  reason: string;
  expectedMinArgs: number;
  expectedMaxArgs: number;
  affectedCallSites: Array<{
    callerFile: string;
    line: number;
    argsProvided?: number;
  }>;
}

/**
 * Verify whether a signature change causes a runtime break at the given call sites.
 */
export function verifySignatureBreak(
  change: SignatureChange,
  callSites: CallSite[]
): SignatureBreakVerificationResult {
  const oldParamCount = change.oldParams.length;
  const newParamCount = change.newParams.length;

  // Filter out rest/optional parameters for required count estimation
  const requiredNewParams = change.newParams.filter(
    (p) => !p.startsWith("...") && !p.includes("=") && p !== "{}" && p !== "[]"
  );
  const minRequiredArgs = requiredNewParams.length;

  const affectedSites = callSites.filter((site) => site.calledFunction === change.functionName);

  let isRuntimeBreak = false;
  let reason = "Signature change matches existing call sites.";

  if (minRequiredArgs > oldParamCount) {
    isRuntimeBreak = true;
    reason = `Function '${change.functionName}' requires at least ${minRequiredArgs} argument(s) (new signature: ${change.newParams.join(", ")}), but old callers provide fewer arguments.`;
  } else if (change.changeType === "function_removed") {
    isRuntimeBreak = true;
    reason = `Function '${change.functionName}' was removed from ${change.file}, but call sites still reference it.`;
  } else if (JSON.stringify(change.oldParams) !== JSON.stringify(change.newParams)) {
    isRuntimeBreak = true;
    reason = `Function '${change.functionName}' signature changed from (${change.oldParams.join(", ")}) to (${change.newParams.join(", ")}).`;
  }

  return {
    functionName: change.functionName,
    definitionFile: change.file,
    isRuntimeBreak,
    reason,
    expectedMinArgs: minRequiredArgs,
    expectedMaxArgs: newParamCount,
    affectedCallSites: affectedSites.map((s) => ({
      callerFile: s.callerFile,
      line: s.line,
    })),
  };
}
