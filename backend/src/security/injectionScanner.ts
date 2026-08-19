/**
 * @file injectionScanner.ts
 * @description Track 2, Part B — Injection / Unsafe-Pattern Detection Module
 *
 * Detects security-risky code patterns via targeted regex heuristics:
 *  - SQL injection (string concatenation/template literals with SQL keywords)
 *  - Command injection (exec/execSync/spawn with interpolated variables)
 *  - eval() / Function() constructor with non-literal arguments
 *  - Unsanitized input reaching dangerous sinks (innerHTML, res.send)
 *  - Insecure deserialization (Python stretch: pickle.loads, yaml.load)
 *
 * AST-aware checks are stretch for the hackathon — using targeted regex/heuristics
 * for now, which covers the demo scenarios reliably.
 */

import type {
  RawSecurityFinding,
  DiffFileEntry,
  AddedLine,
  SecurityRiskCategory,
  ConfidenceLevel,
  RiskLevel,
} from "../schema/securityRisk.types";

// ---------------------------------------------------------------------------
// Injection Detection Rules
// ---------------------------------------------------------------------------

interface InjectionRule {
  /** Human-readable name */
  name: string;
  /** Security risk category */
  category: SecurityRiskCategory;
  /** Regex pattern to detect the issue */
  pattern: RegExp;
  /** Suggested severity */
  suggestedRiskLevel: RiskLevel;
  /** Confidence level */
  confidence: ConfidenceLevel;
  /** One-line reasoning explaining why this is dangerous */
  reasoning: string;
  /** Optional extra validation */
  validate?: (match: RegExpMatchArray, line: string, context: LineContext) => boolean;
}

interface LineContext {
  /** Lines surrounding this line (up to 3 before/after) for context checks */
  surroundingLines: string[];
  /** File path */
  filePath: string;
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

const INJECTION_RULES: InjectionRule[] = [
  // ── SQL Injection: string concatenation ──────────────────────────────────
  {
    name: "SQL Injection — String Concatenation",
    category: "sql_injection",
    pattern:
      /(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE|TRUNCATE)\s+.*(?:\+\s*\w+|\$\{[^}]+\}|"\s*\+\s*\w+|'\s*\+\s*\w+)/i,
    suggestedRiskLevel: "high",
    confidence: "high",
    reasoning:
      "SQL keyword followed by string concatenation or template literal interpolation — likely SQL injection vulnerability",
  },

  // ── SQL Injection: template literal ──────────────────────────────────────
  {
    name: "SQL Injection — Template Literal",
    category: "sql_injection",
    pattern:
      /`(?:[^`]*?)(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)(?:[^`]*?)\$\{[^}]+\}(?:[^`]*?)`/i,
    suggestedRiskLevel: "high",
    confidence: "high",
    reasoning:
      "SQL statement constructed via template literal with interpolated variable — SQL injection risk",
  },

  // ── SQL Injection: query/execute with concatenated string ─────────────────
  {
    name: "SQL Injection — query() / execute() with Variable",
    category: "sql_injection",
    pattern:
      /\.(?:query|execute|exec|raw|run)\s*\(\s*(?:["'`](?:SELECT|INSERT|UPDATE|DELETE|DROP).*(?:\+|`)|(\w+)\s*\))/i,
    suggestedRiskLevel: "high",
    confidence: "medium",
    reasoning:
      "Database query/execute call with a non-parameterized string argument — potential SQL injection",
    validate: (match, line) => {
      // Exclude parameterized queries (e.g., query("SELECT ?", [val]))
      if (/\?\s*,\s*\[/.test(line) || /\$\d/.test(line)) return false;
      return true;
    },
  },

  // ── Command Injection: exec / execSync ───────────────────────────────────
  {
    name: "Command Injection — exec/execSync with Variable",
    category: "command_injection",
    pattern:
      /(?:exec|execSync|execFile|execFileSync)\s*\(\s*(?:`[^`]*\$\{[^}]+\}|["'][^"']*["']\s*\+\s*\w+|\w+[^,)]*(?:\+|`)\s*)/i,
    suggestedRiskLevel: "high",
    confidence: "high",
    reasoning:
      "child_process exec/execSync called with interpolated or concatenated variable — command injection risk",
  },

  // ── Command Injection: spawn with shell: true ────────────────────────────
  {
    name: "Command Injection — spawn with shell: true",
    category: "command_injection",
    pattern:
      /spawn(?:Sync)?\s*\([^)]*shell\s*:\s*true/i,
    suggestedRiskLevel: "high",
    confidence: "high",
    reasoning:
      "spawn/spawnSync called with shell: true — enables shell metacharacter interpretation, command injection risk",
  },

  // ── Command Injection: Python os.system / subprocess ─────────────────────
  {
    name: "Command Injection — Python os.system/subprocess",
    category: "command_injection",
    pattern:
      /(?:os\.system|os\.popen|subprocess\.(?:call|run|Popen|check_output|check_call))\s*\(\s*(?:f["']|["'].*(?:\+|\.format|%\s)|\w+)/i,
    suggestedRiskLevel: "high",
    confidence: "medium",
    reasoning:
      "Python system command with variable interpolation — command injection risk",
    validate: (_match, line) => {
      // Higher confidence if shell=True is present
      return true;
    },
  },

  // ── Unsafe eval() ────────────────────────────────────────────────────────
  {
    name: "Unsafe eval()",
    category: "unsafe_eval",
    pattern: /\beval\s*\(\s*(?!\s*["'`]\s*[^"'`]*["'`]\s*\))(\w+|`[^`]*\$\{|[^)]+\+)/,
    suggestedRiskLevel: "high",
    confidence: "high",
    reasoning:
      "eval() called with a non-literal argument — allows arbitrary code execution",
  },

  // ── Unsafe Function() constructor ────────────────────────────────────────
  {
    name: "Unsafe Function() Constructor",
    category: "unsafe_eval",
    pattern:
      /new\s+Function\s*\(\s*(?!\s*["'`][^"'`]*["'`]\s*\))(\w+|[^)]+\+)/,
    suggestedRiskLevel: "high",
    confidence: "high",
    reasoning:
      "Function() constructor called with dynamic argument — equivalent to eval(), allows arbitrary code execution",
  },

  // ── Unsanitized innerHTML ────────────────────────────────────────────────
  {
    name: "Unsanitized innerHTML Assignment",
    category: "unsanitized_input",
    pattern:
      /\.innerHTML\s*=\s*(?!\s*["'`]\s*$)(?!\s*["'`][^"'`]*["'`]\s*;?\s*$)(.+)/,
    suggestedRiskLevel: "medium",
    confidence: "medium",
    reasoning:
      "innerHTML assignment with non-static value — potential XSS if value contains user input",
    validate: (_match, line) => {
      // If assigning a hardcoded string with no variables, lower risk
      const assignment = line.split("innerHTML")[1] ?? "";
      if (/^(\s*=\s*["'`][^"'`]*["'`]\s*;?\s*$)/.test(assignment)) return false;
      // If using DOMPurify or sanitize, it's safe
      if (/sanitize|DOMPurify|escape/i.test(line)) return false;
      return true;
    },
  },

  // ── Unsanitized res.send / res.write ─────────────────────────────────────
  {
    name: "Unsanitized Express Response",
    category: "unsanitized_input",
    pattern:
      /res\.(?:send|write|end)\s*\(\s*(?:req\.|request\.|params\.|body\.|query\.)/i,
    suggestedRiskLevel: "medium",
    confidence: "medium",
    reasoning:
      "Express response sending raw request input without sanitization — potential XSS/injection",
  },

  // ── Insecure Deserialization: Python pickle ──────────────────────────────
  {
    name: "Insecure Deserialization — pickle.loads",
    category: "insecure_deserialization",
    pattern:
      /pickle\.(?:loads?|Unpickler)\s*\(/i,
    suggestedRiskLevel: "high",
    confidence: "high",
    reasoning:
      "pickle.loads() deserializes arbitrary Python objects — can execute arbitrary code on untrusted input",
  },

  // ── Insecure Deserialization: yaml.load without SafeLoader ───────────────
  {
    name: "Insecure Deserialization — yaml.load without SafeLoader",
    category: "insecure_deserialization",
    pattern:
      /yaml\.load\s*\([^)]*\)/i,
    suggestedRiskLevel: "high",
    confidence: "medium",
    reasoning:
      "yaml.load() without SafeLoader can execute arbitrary Python code via YAML tags",
    validate: (_match, line) => {
      // Safe if SafeLoader, safe_load, or CSafeLoader is used
      if (/SafeLoader|safe_load|CSafeLoader|BaseLoader/i.test(line)) return false;
      return true;
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a parsed diff for injection patterns and unsafe code constructs.
 *
 * @param diffFiles - Array of files with their added lines from the diff
 * @returns Array of raw security findings (injection/unsafe patterns detected)
 */
export function scanForInjections(
  diffFiles: DiffFileEntry[]
): RawSecurityFinding[] {
  const findings: RawSecurityFinding[] = [];

  for (const fileEntry of diffFiles) {
    try {
      const allLines = fileEntry.addedLines;

      for (let i = 0; i < allLines.length; i++) {
        const addedLine = allLines[i];
        const context: LineContext = {
          surroundingLines: getSurroundingLines(allLines, i, 3),
          filePath: fileEntry.file,
        };

        const lineFindings = scanLineForInjections(
          addedLine,
          fileEntry.file,
          context
        );
        findings.push(...lineFindings);
      }
    } catch (err) {
      // Fail gracefully: skip this file, log warning, keep going
      // (PRD section 7 — Reliability)
      console.warn(
        `[injectionScanner] Warning: failed to scan file "${fileEntry.file}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return findings;
}

/**
 * Scan a single line against all injection detection rules.
 */
function scanLineForInjections(
  addedLine: AddedLine,
  filePath: string,
  context: LineContext
): RawSecurityFinding[] {
  const results: RawSecurityFinding[] = [];
  const { lineNumber, content } = addedLine;

  // Skip empty lines and pure comments
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
    return results;
  }

  for (const rule of INJECTION_RULES) {
    const match = content.match(rule.pattern);
    if (!match) continue;

    // Run optional validator
    if (rule.validate && !rule.validate(match, content, context)) continue;

    // Build a safe snippet (no secrets involved for injection findings)
    const snippet = truncateSnippet(content.trim(), 120);

    results.push({
      source: "injection_scanner",
      category: rule.category,
      file: filePath,
      line: lineNumber,
      snippet,
      redactedPreview: snippet, // No secrets to redact in injection findings
      reasoning: rule.reasoning,
      ruleName: rule.name,
      confidence: rule.confidence,
      suggestedRiskLevel: rule.suggestedRiskLevel,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get surrounding lines for context (used by validators that need multi-line context).
 */
function getSurroundingLines(
  allLines: AddedLine[],
  currentIndex: number,
  windowSize: number
): string[] {
  const start = Math.max(0, currentIndex - windowSize);
  const end = Math.min(allLines.length, currentIndex + windowSize + 1);
  return allLines.slice(start, end).map((l) => l.content);
}

/**
 * Truncate a snippet to a maximum length, adding "..." if truncated.
 */
function truncateSnippet(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + "...";
}
