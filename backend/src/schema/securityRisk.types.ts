/**
 * @file securityRisk.types.ts
 * @description SHARED CONTRACT — consumed by all tracks.
 *
 * This file defines the output types for Track 2 (Security Analysis Engine)
 * and the unified risk report contract that Tracks 3, 4, and 5 build against.
 *
 * Import from here instead of redefining types elsewhere:
 *   import type { SecurityRisk, UnifiedRiskReport } from "../schema/securityRisk.types";
 *
 * DO NOT change field names or types without announcing it to the team.
 */

// ---------------------------------------------------------------------------
// Security Risk Categories
// ---------------------------------------------------------------------------

export type SecurityRiskCategory =
  | "hardcoded_secret"
  | "sql_injection"
  | "command_injection"
  | "unsafe_eval"
  | "unsanitized_input"
  | "insecure_deserialization";

// ---------------------------------------------------------------------------
// Risk Levels (lowercase — canonical form per shared contract)
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "medium" | "high" | "critical";

// ---------------------------------------------------------------------------
// Confidence Levels
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "low" | "medium" | "high";

// ---------------------------------------------------------------------------
// SecurityRisk — single finding from the security scanner
// ---------------------------------------------------------------------------

/**
 * A single security risk finding. Every output from Track 2's pipeline
 * must conform to this shape.
 *
 * Key invariants:
 *  - `redactedPreview` NEVER contains raw secret values — always masked
 *  - `aiExplanation` is null when emitted by Track 2; filled in by Track 4
 *  - `id` is a UUIDv4
 */
export interface SecurityRisk {
  /** UUIDv4 identifier for this finding */
  id: string;

  /** Always "security_risk" for Track 2 findings */
  type: "security_risk";

  /** What category of security issue this is */
  category: SecurityRiskCategory;

  /** Repo-relative file path where the issue was found */
  file: string;

  /** 1-based line number in the file, or null if line is unknown */
  line: number | null;

  /** Severity classification */
  riskLevel: RiskLevel;

  /** Rule-specific details */
  details: {
    /** Human-readable name of the rule that matched */
    ruleMatched: string;
    /** How confident we are in this finding */
    confidence: ConfidenceLevel;
  };

  /**
   * Redacted code snippet showing the finding context.
   * NEVER contains raw secret values — always masked.
   * Example: `const apiKey = "sk-***REDACTED***"`
   */
  redactedPreview: string | null;

  /**
   * AI-generated plain-English explanation + fix recommendation.
   * null when first emitted by Track 2 — filled in by Track 4's AI layer.
   */
  aiExplanation: string | null;
}

// ---------------------------------------------------------------------------
// SemanticConflictFinding — stub type for Member 1's output
// ---------------------------------------------------------------------------

/**
 * Stub type for Member 1's semantic conflict findings.
 * Member 1's actual output is `GitConflictResult` which has a different shape.
 * This represents the PRD's expected per-finding shape.
 *
 * TODO: Replace with actual import from @conflictlens/git-engine once Member 1
 * updates their output to match the shared contract.
 */
export interface SemanticConflictFinding {
  type: "semantic_conflict";
  function: string;
  file: string;
  changeType: string;
  affectedFiles: string[];
  riskLevel: RiskLevel;
}

// ---------------------------------------------------------------------------
// Unified Risk Report — the top-level response from POST /analyze
// ---------------------------------------------------------------------------

/**
 * The unified risk report returned by the backend API.
 * Contains both semantic conflict findings and security risk findings.
 */
export interface UnifiedRiskReport {
  risks: Array<SecurityRisk | SemanticConflictFinding>;
  meta: {
    scannedAt: string;
    filesScanned: number;
    durationMs: number;
  };
}

// ---------------------------------------------------------------------------
// Internal types — used within Track 2's pipeline
// ---------------------------------------------------------------------------

/**
 * A raw finding before it goes through the risk engine.
 * These come from the secret scanner and injection scanner.
 */
export interface RawSecurityFinding {
  /** Source scanner */
  source: "secret_scanner" | "injection_scanner";

  /** What category of issue */
  category: SecurityRiskCategory;

  /** Repo-relative file path */
  file: string;

  /** 1-based line number */
  line: number | null;

  /** Short non-sensitive code snippet */
  snippet: string | null;

  /** Redacted preview (secrets masked) */
  redactedPreview: string | null;

  /** One-line reasoning for this finding */
  reasoning: string;

  /** Name of the specific rule that triggered */
  ruleName: string;

  /** How confident the rule is */
  confidence: ConfidenceLevel;

  /** Pre-suggested severity (risk engine may override based on merging logic) */
  suggestedRiskLevel: RiskLevel;
}

// ---------------------------------------------------------------------------
// Diff input shape — what our scanners expect
// ---------------------------------------------------------------------------

/**
 * Parsed diff input for security scanning.
 * Each entry represents one file with its added lines.
 */
export interface DiffFileEntry {
  /** Repo-relative file path */
  file: string;

  /** Lines that were added in this file's diff */
  addedLines: AddedLine[];
}

export interface AddedLine {
  /** 1-based line number in the new version of the file */
  lineNumber: number;

  /** The actual content of the line (text) */
  content: string;
}
