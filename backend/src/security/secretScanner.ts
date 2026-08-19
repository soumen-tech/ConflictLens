/**
 * @file secretScanner.ts
 * @description Track 2, Part A — Secret Detection Module
 *
 * Detects hardcoded secrets, API keys, tokens, private keys, connection strings,
 * and high-entropy string literals in code diffs using a rules engine
 * (regex + Shannon entropy checks).
 *
 * HARD REQUIREMENT: Raw secret values NEVER leave this module.
 * All outputs contain redacted previews only.
 */

import type {
  RawSecurityFinding,
  DiffFileEntry,
  AddedLine,
  ConfidenceLevel,
  RiskLevel,
} from "../schema/securityRisk.types";

// ---------------------------------------------------------------------------
// Secret Detection Rules
// ---------------------------------------------------------------------------

interface SecretRule {
  /** Human-readable name of the rule */
  name: string;
  /** Category is always "hardcoded_secret" for this scanner */
  category: "hardcoded_secret";
  /** Regex pattern to match */
  pattern: RegExp;
  /** Suggested severity when this rule matches */
  suggestedRiskLevel: RiskLevel;
  /** How confident we are in matches from this rule */
  confidence: ConfidenceLevel;
  /** Custom redaction function, or null to use the default */
  redact?: (match: RegExpMatchArray, line: string) => string;
  /** Optional validator — if provided, must return true for the match to count */
  validate?: (match: RegExpMatchArray, line: string) => boolean;
}

/**
 * Shannon entropy calculation for a string.
 * Higher entropy = more likely to be a secret/random value.
 */
export function shannonEntropy(str: string): number {
  if (str.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }

  let entropy = 0;
  const len = str.length;
  for (const count of freq.values()) {
    const p = count / len;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Default redaction: replaces the matched secret value with ***REDACTED***
 * while keeping the variable name / key name visible.
 */
function defaultRedact(line: string, secretValue: string): string {
  if (!secretValue || secretValue.length === 0) return line;
  return line.replace(secretValue, "***REDACTED***");
}

/**
 * Redact a key=value line (for .env-style files).
 */
function redactEnvValue(line: string): string {
  const eqIdx = line.indexOf("=");
  if (eqIdx === -1) return line;
  const key = line.substring(0, eqIdx + 1);
  return `${key}***REDACTED***`;
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

const SECRET_RULES: SecretRule[] = [
  // ── AWS Access Keys ──────────────────────────────────────────────────────
  {
    name: "AWS Access Key ID",
    category: "hardcoded_secret",
    pattern: /(?:^|[^A-Z0-9])(AKIA[0-9A-Z]{16})(?:[^A-Z0-9]|$)/,
    suggestedRiskLevel: "critical",
    confidence: "high",
    redact: (match, line) => defaultRedact(line, match[1]),
  },

  // ── AWS Secret Access Key (long base64-ish string assigned to a secret-sounding var) ──
  {
    name: "AWS Secret Access Key",
    category: "hardcoded_secret",
    pattern:
      /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key|secret[_-]?key)\s*[:=]\s*["']([A-Za-z0-9/+=]{40})["']/i,
    suggestedRiskLevel: "critical",
    confidence: "high",
    redact: (match, line) => defaultRedact(line, match[1]),
  },

  // ── Private Keys ─────────────────────────────────────────────────────────
  {
    name: "Private Key",
    category: "hardcoded_secret",
    pattern: /-----BEGIN\s+(?:RSA|EC|OPENSSH|PGP|DSA)\s+PRIVATE\s+KEY-----/,
    suggestedRiskLevel: "critical",
    confidence: "high",
    redact: (_match, line) =>
      line.replace(
        /-----BEGIN\s+(?:RSA|EC|OPENSSH|PGP|DSA)\s+PRIVATE\s+KEY-----.*$/,
        "-----BEGIN ***REDACTED*** PRIVATE KEY-----"
      ),
  },

  // ── GitHub Tokens ────────────────────────────────────────────────────────
  {
    name: "GitHub Token",
    category: "hardcoded_secret",
    pattern: /(?:^|[^a-zA-Z0-9_])(gh[pousr]_[A-Za-z0-9_]{36,255})(?:[^a-zA-Z0-9_]|$)/,
    suggestedRiskLevel: "critical",
    confidence: "high",
    redact: (match, line) => {
      const token = match[1];
      const prefix = token.substring(0, 4);
      return line.replace(token, `${prefix}_***REDACTED***`);
    },
  },

  // ── Slack Tokens ─────────────────────────────────────────────────────────
  {
    name: "Slack Token",
    category: "hardcoded_secret",
    pattern: /(?:^|[^a-zA-Z0-9_])(xox[baprs]-[A-Za-z0-9\-]{10,250})(?:[^a-zA-Z0-9_-]|$)/,
    suggestedRiskLevel: "critical",
    confidence: "high",
    redact: (match, line) => {
      const token = match[1];
      const prefix = token.substring(0, 5);
      return line.replace(token, `${prefix}-***REDACTED***`);
    },
  },

  // ── JWTs ─────────────────────────────────────────────────────────────────
  {
    name: "JSON Web Token (JWT)",
    category: "hardcoded_secret",
    pattern:
      /["'](eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})["']/,
    suggestedRiskLevel: "high",
    confidence: "high",
    redact: (match, line) => defaultRedact(line, match[1]),
  },

  // ── Database Connection Strings ──────────────────────────────────────────
  {
    name: "Database Connection String with Credentials",
    category: "hardcoded_secret",
    pattern:
      /["']((?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|amqp|amqps):\/\/[^:]+:[^@]+@[^"'\s]+)["']/i,
    suggestedRiskLevel: "critical",
    confidence: "high",
    redact: (match, line) => {
      const connStr = match[1];
      // Mask the password portion: protocol://user:PASSWORD@host
      const masked = connStr.replace(
        /(:\/\/[^:]+:)([^@]+)(@)/,
        "$1***REDACTED***$3"
      );
      return line.replace(connStr, masked);
    },
  },

  // ── Generic API Key / Token / Secret Assignments ─────────────────────────
  {
    name: "Generic API Key / Token / Secret Assignment",
    category: "hardcoded_secret",
    pattern:
      /(?:api[_-]?key|secret|token|access[_-]?key|auth[_-]?token|api[_-]?secret|client[_-]?secret|private[_-]?key|password|passwd|pwd|pass|credentials?)\s*[:=]\s*["']([^"']{8,})["']/i,
    suggestedRiskLevel: "high",
    confidence: "medium",
    redact: (match, line) => defaultRedact(line, match[1]),
    validate: (match) => {
      const value = match[1];
      // Skip obvious non-secrets: placeholder values, environment variable references
      if (/^(your[_-]|example|test|dummy|placeholder|xxx|TODO|CHANGE_ME|<)/i.test(value)) {
        return false;
      }
      // Skip template literals / env var references
      if (/^\$\{|^process\.env\.|^%/.test(value)) {
        return false;
      }
      // Require minimum entropy to avoid false positives on short common strings
      if (value.length < 12) {
        return shannonEntropy(value) > 3.0;
      }
      return true;
    },
  },

  // ── .env-style KEY=VALUE secrets ─────────────────────────────────────────
  {
    name: ".env Secret Variable",
    category: "hardcoded_secret",
    pattern:
      /^(?:export\s+)?(?:API[_-]?KEY|SECRET[_-]?KEY|ACCESS[_-]?KEY|AUTH[_-]?TOKEN|TOKEN|PASSWORD|DB[_-]?PASSWORD|DATABASE[_-]?URL|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|AWS[_-]?SECRET|GEMINI[_-]?API[_-]?KEY|OPENAI[_-]?API[_-]?KEY|STRIPE[_-]?(?:SECRET|PUBLISHABLE)[_-]?KEY)\s*=\s*(.+)$/i,
    suggestedRiskLevel: "critical",
    confidence: "high",
    redact: (_match, line) => redactEnvValue(line),
    validate: (match) => {
      const value = match[1].trim().replace(/^["']|["']$/g, "");
      // Skip empty, placeholder, or env-var-reference values
      if (!value || value.length < 4) return false;
      if (/^(your[_-]|example|test|dummy|placeholder|xxx|TODO|CHANGE_ME|<|\$\{)/i.test(value)) {
        return false;
      }
      return true;
    },
  },

  // ── High-Entropy String Fallback ─────────────────────────────────────────
  {
    name: "High-Entropy String Literal",
    category: "hardcoded_secret",
    pattern:
      /(?:const|let|var|=)\s*\w*\s*=\s*["']([A-Za-z0-9+/=_\-]{20,})["']/,
    suggestedRiskLevel: "medium",
    confidence: "low",
    redact: (match, line) => defaultRedact(line, match[1]),
    validate: (match) => {
      const value = match[1];
      // Only flag if Shannon entropy is sufficiently high
      return shannonEntropy(value) > 4.0;
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a parsed diff for hardcoded secrets.
 *
 * @param diffFiles - Array of files with their added lines from the diff
 * @returns Array of raw security findings (secrets detected, with redacted previews)
 */
export function scanForSecrets(
  diffFiles: DiffFileEntry[]
): RawSecurityFinding[] {
  const findings: RawSecurityFinding[] = [];

  for (const fileEntry of diffFiles) {
    try {
      for (const addedLine of fileEntry.addedLines) {
        const lineFindings = scanLine(
          addedLine,
          fileEntry.file
        );
        findings.push(...lineFindings);
      }
    } catch (err) {
      // Fail gracefully: skip this file, log warning, keep going
      // (PRD section 7 — Reliability)
      console.warn(
        `[secretScanner] Warning: failed to scan file "${fileEntry.file}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return findings;
}

/**
 * Scan a single line against all secret detection rules.
 */
function scanLine(
  addedLine: AddedLine,
  filePath: string
): RawSecurityFinding[] {
  const results: RawSecurityFinding[] = [];
  const { lineNumber, content } = addedLine;

  // Skip empty lines and comments (common false-positive sources)
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
    // Still check .env-style comments that might have secrets after the comment
    // But generally skip code comments
    if (!trimmed.startsWith("#") || !isEnvLikeFile(filePath)) {
      return results;
    }
  }

  for (const rule of SECRET_RULES) {
    const match = content.match(rule.pattern);
    if (!match) continue;

    // Run optional validator
    if (rule.validate && !rule.validate(match, content)) continue;

    // Build redacted preview — NEVER include raw secret
    const redactedPreview = rule.redact
      ? rule.redact(match, content.trim())
      : defaultRedact(content.trim(), match[1] ?? match[0]);

    results.push({
      source: "secret_scanner",
      category: rule.category,
      file: filePath,
      line: lineNumber,
      snippet: null, // Never include raw content in snippet for secrets
      redactedPreview,
      reasoning: `Matched rule: ${rule.name}`,
      ruleName: rule.name,
      confidence: rule.confidence,
      suggestedRiskLevel: rule.suggestedRiskLevel,
    });
  }

  return results;
}

/**
 * Check if a file path looks like a .env-style configuration file.
 */
function isEnvLikeFile(filePath: string): boolean {
  const name = filePath.split("/").pop() ?? filePath;
  return /^\.env(?:\..+)?$|^\.env\.local$|^\.env\.production$/i.test(name);
}
