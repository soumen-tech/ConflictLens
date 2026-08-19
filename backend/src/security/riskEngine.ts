/**
 * @file riskEngine.ts
 * @description Track 2, Part C — Unified Risk Scoring Engine
 *
 * This is the module that both Member 1's semantic-conflict findings AND
 * Track 2's own security findings flow through.
 *
 * Requirements:
 *  - Accepts raw findings from secret scanner, injection scanner, and
 *    optionally semantic_conflict findings
 *  - Assigns riskLevel using documented rules
 *  - Deduplicates same file+line findings, taking highest severity
 *  - Output conforms exactly to the SecurityRisk contract
 *  - Pure function: no side effects, fully unit-testable
 */

import { v4 as uuidv4 } from "uuid";
import type {
  SecurityRisk,
  RawSecurityFinding,
  RiskLevel,
  SecurityRiskCategory,
  ConfidenceLevel,
} from "../schema/securityRisk.types";

// ---------------------------------------------------------------------------
// Risk Level Hierarchy (for comparison/merging)
// ---------------------------------------------------------------------------

const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Compare two risk levels and return the higher one.
 */
function higherRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_LEVEL_ORDER[a] >= RISK_LEVEL_ORDER[b] ? a : b;
}

/**
 * Compare two confidence levels and return the higher one.
 */
function higherConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  const order: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };
  return order[a] >= order[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Risk Assignment Rules (documented and deterministic)
// ---------------------------------------------------------------------------

/**
 * Assign the final risk level based on category, confidence, and source.
 *
 * Rules:
 *  - critical: confirmed secret (private key, AWS key, DB connection string,
 *              GitHub/Slack token, .env secret)
 *  - high:     confirmed injection pattern (SQL/command/eval) OR
 *              a generic API key/token match with medium+ confidence
 *  - medium:   lower-confidence heuristic secret match (entropy-only),
 *              unsanitized-input warnings without confirmed dangerous sink
 *  - low:      style/best-practice notes with no clear exploit path
 */
function assignRiskLevel(finding: RawSecurityFinding): RiskLevel {
  const { category, confidence, suggestedRiskLevel } = finding;

  // Hardcoded secret rules
  if (category === "hardcoded_secret") {
    if (confidence === "high") return "critical";
    if (confidence === "medium") return "high";
    // Low confidence (entropy fallback) → medium
    return "medium";
  }

  // Injection patterns
  if (
    category === "sql_injection" ||
    category === "command_injection" ||
    category === "unsafe_eval"
  ) {
    if (confidence === "high") return "high";
    if (confidence === "medium") return "high";
    return "medium";
  }

  // Unsanitized input
  if (category === "unsanitized_input") {
    if (confidence === "high") return "high";
    return "medium";
  }

  // Insecure deserialization
  if (category === "insecure_deserialization") {
    if (confidence === "high") return "high";
    return "medium";
  }

  // Fallback: use the scanner's suggested level
  return suggestedRiskLevel;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Create a deduplication key from a finding's file and line.
 */
function dedupeKey(finding: RawSecurityFinding): string {
  return `${finding.file}:${finding.line ?? "null"}`;
}

/**
 * Merge two findings on the same file+line: take highest severity,
 * highest confidence, combine rule names, keep the more specific category.
 */
function mergeFindings(
  existing: SecurityRisk,
  incoming: RawSecurityFinding
): SecurityRisk {
  const incomingRiskLevel = assignRiskLevel(incoming);

  return {
    ...existing,
    riskLevel: higherRiskLevel(existing.riskLevel, incomingRiskLevel),
    details: {
      ruleMatched: `${existing.details.ruleMatched}; ${incoming.ruleName}`,
      confidence: higherConfidence(
        existing.details.confidence,
        incoming.confidence
      ),
    },
    // Keep the redacted preview from whichever has higher severity
    redactedPreview:
      RISK_LEVEL_ORDER[incomingRiskLevel] > RISK_LEVEL_ORDER[existing.riskLevel]
        ? (incoming.redactedPreview ?? existing.redactedPreview)
        : existing.redactedPreview,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process an array of raw findings from the secret scanner and injection scanner,
 * assign risk levels, deduplicate, and produce the final SecurityRisk[] output.
 *
 * This is a pure function — no side effects, fully unit-testable.
 *
 * @param findings - Raw findings from all scanners
 * @returns Array of SecurityRisk objects conforming to the shared contract
 */
export function riskEngine(findings: RawSecurityFinding[]): SecurityRisk[] {
  if (findings.length === 0) return [];

  const dedupeMap = new Map<string, SecurityRisk>();

  for (const finding of findings) {
    const key = dedupeKey(finding);
    const riskLevel = assignRiskLevel(finding);

    if (dedupeMap.has(key)) {
      // Merge with existing finding on the same file+line
      const existing = dedupeMap.get(key)!;
      dedupeMap.set(key, mergeFindings(existing, finding));
    } else {
      // Create new SecurityRisk entry
      const risk: SecurityRisk = {
        id: uuidv4(),
        type: "security_risk",
        category: finding.category,
        file: finding.file,
        line: finding.line,
        riskLevel,
        details: {
          ruleMatched: finding.ruleName,
          confidence: finding.confidence,
        },
        redactedPreview: finding.redactedPreview,
        aiExplanation: null, // Filled in by Track 4 (AI layer)
      };
      dedupeMap.set(key, risk);
    }
  }

  // Sort results: critical first, then high, medium, low
  const results = Array.from(dedupeMap.values());
  results.sort(
    (a, b) => RISK_LEVEL_ORDER[b.riskLevel] - RISK_LEVEL_ORDER[a.riskLevel]
  );

  return results;
}
