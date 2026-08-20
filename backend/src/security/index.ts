/**
 * @file index.ts
 * @description Track 2 — Security Analysis Engine Entry Point
 *
 * Exports a single top-level function `analyzeSecurityRisks()` that Member 4's
 * Express endpoint (POST /analyze) calls to scan a diff for security risks.
 *
 * Pipeline: parse diff → secret scanner → injection scanner → risk engine → return
 *
 * @example
 * ```typescript
 * import { analyzeSecurityRisks } from "./security";
 *
 * // Option 1: Pass raw unified diff text
 * const risks = analyzeSecurityRisks(rawDiffString);
 *
 * // Option 2: Pass pre-parsed diff entries
 * const risks = analyzeSecurityRisks([
 *   { file: "config.js", addedLines: [{ lineNumber: 12, content: 'const key = "sk-abc123"' }] }
 * ]);
 * ```
 */

import type { SecurityRisk, DiffFileEntry } from "../schema/securityRisk.types";
import { scanForSecrets } from "./secretScanner";
import { scanForInjections } from "./injectionScanner";
import { riskEngine } from "./riskEngine";
import { parseUnifiedDiff, fromParsedDiff } from "./diffParser";
import type { Risk, RiskLevel as SharedRiskLevel } from "@conflictlens/shared";

// Re-export types for consumers
export type {
  SecurityRisk,
  DiffFileEntry,
  AddedLine,
  RawSecurityFinding,
  UnifiedRiskReport,
  SecurityRiskCategory,
  RiskLevel,
  ConfidenceLevel,
  SemanticConflictFinding,
} from "../schema/securityRisk.types";

// Re-export sub-modules for advanced usage
export { scanForSecrets } from "./secretScanner";
export { scanForInjections } from "./injectionScanner";
export { riskEngine } from "./riskEngine";
export { parseUnifiedDiff, fromParsedDiff } from "./diffParser";
export { shannonEntropy } from "./secretScanner";

/**
 * Adapter to map SecurityRisk[] to canonical Risk[] shape.
 */
export function adaptSecurityRisks(risks: SecurityRisk[]): Risk[] {
  return risks.map((r) => ({
    id: r.id,
    type: "security_risk",
    riskLevel: r.riskLevel as SharedRiskLevel,
    location: {
      file: r.file,
      line: r.line ?? 1,
    },
    details: {
      category: r.category,
      redactedPreview: r.redactedPreview ?? undefined,
    },
    ai_context: {
      explanation: "Pending AI response...",
      recommendation: "Pending AI response...",
    },
  }));
}

/**
 * Analyze a diff for security risks.
 *
 * Accepts either a raw unified diff string (from `git diff`) or a pre-parsed
 * array of DiffFileEntry objects. Runs the secret scanner and injection scanner,
 * then passes all findings through the unified risk engine.
 *
 * @param diff - Raw unified diff text (string) or pre-parsed DiffFileEntry[]
 * @returns Array of SecurityRisk objects conforming to the shared contract.
 *          Returns empty array if no issues found or if input is empty.
 *          Never throws — parse errors are caught and logged as warnings.
 *
 * @remarks
 * - **Raw secrets never leave this function** — all outputs contain redacted previews
 * - `aiExplanation` is always null in the output — filled in by Track 4's AI layer
 * - Results are sorted by severity (critical first, then high, medium, low)
 */
export function analyzeSecurityRisks(
  diff: string | DiffFileEntry[]
): SecurityRisk[] {
  try {
    // Step 1: Parse diff input
    let diffFiles: DiffFileEntry[];
    if (typeof diff === "string") {
      diffFiles = parseUnifiedDiff(diff);
    } else {
      diffFiles = fromParsedDiff(diff);
    }

    if (diffFiles.length === 0) return [];

    // Step 2: Run secret scanner
    const secretFindings = scanForSecrets(diffFiles);

    // Step 3: Run injection scanner
    const injectionFindings = scanForInjections(diffFiles);

    // Step 4: Merge all findings through the risk engine
    const allFindings = [...secretFindings, ...injectionFindings];
    const risks = riskEngine(allFindings);

    return risks;
  } catch (err) {
    // Fail gracefully — never crash the caller (PRD section 7, Reliability)
    console.warn(
      `[analyzeSecurityRisks] Warning: analysis failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return [];
  }
}
