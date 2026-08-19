/**
 * @file security.test.ts
 * @description Unit tests for Track 2 — Security Analysis Engine
 *
 * Test fixtures:
 *  1. File with hardcoded AWS key → expect critical, secret redacted
 *  2. File with string-concatenated SQL → expect high, sql_injection
 *  3. Clean file with no issues → expect empty array
 *  4. File with low-entropy short apiKey string → not false "critical"
 *  5. Additional coverage for other rules
 */

import { describe, it, expect } from "vitest";
import { analyzeSecurityRisks, shannonEntropy } from "../index";
import { scanForSecrets } from "../secretScanner";
import { scanForInjections } from "../injectionScanner";
import { riskEngine } from "../riskEngine";
import { parseUnifiedDiff } from "../diffParser";
import type { DiffFileEntry, RawSecurityFinding } from "../../schema/securityRisk.types";

// ---------------------------------------------------------------------------
// Helper to build a minimal diff entry
// ---------------------------------------------------------------------------

function makeDiffEntry(file: string, lines: string[]): DiffFileEntry {
  return {
    file,
    addedLines: lines.map((content, i) => ({
      lineNumber: i + 1,
      content,
    })),
  };
}

// ---------------------------------------------------------------------------
// 1. Hardcoded AWS Key → critical, secret redacted
// ---------------------------------------------------------------------------

describe("Secret Scanner — AWS Key Detection", () => {
  it("should detect a hardcoded AWS access key as critical", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("config.js", [
        'const awsAccessKeyId = "AKIAIOSFODNN7EXAMPLE";',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);

    expect(risks.length).toBeGreaterThanOrEqual(1);

    const awsRisk = risks.find(
      (r) => r.details.ruleMatched.includes("AWS") || r.category === "hardcoded_secret"
    );
    expect(awsRisk).toBeDefined();
    expect(awsRisk!.riskLevel).toBe("critical");
    expect(awsRisk!.type).toBe("security_risk");
    expect(awsRisk!.category).toBe("hardcoded_secret");
    expect(awsRisk!.file).toBe("config.js");
    expect(awsRisk!.line).toBe(1);

    // Secret MUST be redacted
    expect(awsRisk!.redactedPreview).toBeDefined();
    expect(awsRisk!.redactedPreview).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(awsRisk!.redactedPreview).toContain("REDACTED");

    // aiExplanation should be null (filled in by Track 4)
    expect(awsRisk!.aiExplanation).toBeNull();

    // id should be a UUID
    expect(awsRisk!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("should redact AWS secret access key values", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("aws-config.ts", [
        'const aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    expect(risks.length).toBeGreaterThanOrEqual(1);

    for (const risk of risks) {
      if (risk.redactedPreview) {
        expect(risk.redactedPreview).not.toContain(
          "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. String-concatenated SQL → high, sql_injection
// ---------------------------------------------------------------------------

describe("Injection Scanner — SQL Injection", () => {
  it("should detect string-concatenated SQL as high severity sql_injection", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("db/queries.js", [
        'const query = "SELECT * FROM users WHERE id = " + userId;',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);

    expect(risks.length).toBeGreaterThanOrEqual(1);

    const sqlRisk = risks.find((r) => r.category === "sql_injection");
    expect(sqlRisk).toBeDefined();
    expect(sqlRisk!.riskLevel).toBe("high");
    expect(sqlRisk!.type).toBe("security_risk");
    expect(sqlRisk!.file).toBe("db/queries.js");
  });

  it("should detect template-literal SQL injection", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("db/queries.ts", [
        "const query = `SELECT * FROM users WHERE name = '${userInput}'`;",
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    const sqlRisk = risks.find((r) => r.category === "sql_injection");
    expect(sqlRisk).toBeDefined();
    expect(sqlRisk!.riskLevel).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// 3. Clean file → empty array
// ---------------------------------------------------------------------------

describe("Clean File — No Issues", () => {
  it("should return empty array for a clean file", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("utils.js", [
        "function add(a, b) {",
        "  return a + b;",
        "}",
        "",
        "module.exports = { add };",
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    expect(risks).toEqual([]);
  });

  it("should return empty array for empty diff", () => {
    const risks = analyzeSecurityRisks([]);
    expect(risks).toEqual([]);
  });

  it("should return empty array for empty string diff", () => {
    const risks = analyzeSecurityRisks("");
    expect(risks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Low-entropy short apiKey → not false critical
// ---------------------------------------------------------------------------

describe("False Positive Prevention", () => {
  it("should NOT flag a short low-entropy apiKey as critical", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("config.js", [
        'const apiKey = "test1234";',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);

    // Should either not match at all, or match as low/medium — never critical
    for (const risk of risks) {
      expect(risk.riskLevel).not.toBe("critical");
    }
  });

  it("should NOT flag placeholder/example values", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("config.example.js", [
        'const apiKey = "your-api-key-here";',
        'const token = "CHANGE_ME";',
        'const secret = "example-secret-value";',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    // Should not produce any findings for placeholder values
    expect(risks.length).toBe(0);
  });

  it("should NOT flag environment variable references", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("config.ts", [
        'const apiKey = process.env.API_KEY;',
        'const dbUrl = "${DATABASE_URL}";',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    // env var references are not hardcoded secrets
    expect(risks.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Additional Rule Coverage
// ---------------------------------------------------------------------------

describe("Secret Scanner — Private Keys", () => {
  it("should detect RSA private key markers as critical", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("certs/key.pem", [
        "-----BEGIN RSA PRIVATE KEY-----",
        "MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn...",
        "-----END RSA PRIVATE KEY-----",
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    const keyRisk = risks.find(
      (r) => r.details.ruleMatched.includes("Private Key")
    );
    expect(keyRisk).toBeDefined();
    expect(keyRisk!.riskLevel).toBe("critical");
    expect(keyRisk!.redactedPreview).toContain("REDACTED");
    expect(keyRisk!.redactedPreview).not.toContain("MIIEpAIBAAKCAQEA");
  });
});

describe("Secret Scanner — GitHub Tokens", () => {
  it("should detect GitHub personal access tokens", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("deploy.sh", [
        'GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    expect(risks.length).toBeGreaterThanOrEqual(1);

    const ghRisk = risks.find(
      (r) => r.details.ruleMatched.includes("GitHub") || r.redactedPreview?.includes("ghp_")
    );
    expect(ghRisk).toBeDefined();
    expect(ghRisk!.riskLevel).toBe("critical");
  });
});

describe("Secret Scanner — Database Connection Strings", () => {
  it("should detect and redact database connection strings", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("config/db.js", [
        'const dbUrl = "postgres://admin:supersecretpass@db.example.com:5432/mydb";',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    const dbRisk = risks.find(
      (r) => r.details.ruleMatched.includes("Database") || r.details.ruleMatched.includes("Connection")
    );
    expect(dbRisk).toBeDefined();
    expect(dbRisk!.riskLevel).toBe("critical");
    expect(dbRisk!.redactedPreview).not.toContain("supersecretpass");
    expect(dbRisk!.redactedPreview).toContain("REDACTED");
  });
});

describe("Injection Scanner — Command Injection", () => {
  it("should detect exec with interpolated variable", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("utils/run.js", [
        'const { exec } = require("child_process");',
        "exec(`rm -rf ${userInput}`);",
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    const cmdRisk = risks.find((r) => r.category === "command_injection");
    expect(cmdRisk).toBeDefined();
    expect(cmdRisk!.riskLevel).toBe("high");
  });

  it("should detect spawn with shell: true", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("utils/shell.js", [
        'spawn("cmd", args, { shell: true });',
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    const cmdRisk = risks.find((r) => r.category === "command_injection");
    expect(cmdRisk).toBeDefined();
    expect(cmdRisk!.riskLevel).toBe("high");
  });
});

describe("Injection Scanner — Unsafe eval", () => {
  it("should detect eval with a variable argument", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("engine.js", [
        "eval(userCode);",
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    const evalRisk = risks.find((r) => r.category === "unsafe_eval");
    expect(evalRisk).toBeDefined();
    expect(evalRisk!.riskLevel).toBe("high");
  });

  it("should detect new Function() with a variable", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("sandbox.js", [
        "const fn = new Function(dynamicCode);",
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    const fnRisk = risks.find((r) => r.category === "unsafe_eval");
    expect(fnRisk).toBeDefined();
    expect(fnRisk!.riskLevel).toBe("high");
  });
});

describe("Injection Scanner — Unsanitized Input", () => {
  it("should detect innerHTML with non-static value", () => {
    const diff: DiffFileEntry[] = [
      makeDiffEntry("ui/render.js", [
        "element.innerHTML = userContent;",
      ]),
    ];

    const risks = analyzeSecurityRisks(diff);
    const xssRisk = risks.find((r) => r.category === "unsanitized_input");
    expect(xssRisk).toBeDefined();
    expect(["medium", "high"]).toContain(xssRisk!.riskLevel);
  });
});

// ---------------------------------------------------------------------------
// 6. Diff Parser Tests
// ---------------------------------------------------------------------------

describe("Diff Parser", () => {
  it("should parse a standard unified diff", () => {
    const rawDiff = `diff --git a/config.js b/config.js
index 1234567..abcdefg 100644
--- a/config.js
+++ b/config.js
@@ -1,3 +1,4 @@
 const app = require("express")();
+const apiKey = "sk-test12345678901234567890";
 const port = 3000;
 app.listen(port);`;

    const entries = parseUnifiedDiff(rawDiff);

    expect(entries).toHaveLength(1);
    expect(entries[0].file).toBe("config.js");
    expect(entries[0].addedLines).toHaveLength(1);
    expect(entries[0].addedLines[0].lineNumber).toBe(2);
    expect(entries[0].addedLines[0].content).toContain("apiKey");
  });

  it("should handle multi-file diffs", () => {
    const rawDiff = `diff --git a/file1.js b/file1.js
--- a/file1.js
+++ b/file1.js
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;
diff --git a/file2.js b/file2.js
--- a/file2.js
+++ b/file2.js
@@ -1,2 +1,3 @@
 const x = 10;
+const y = 20;
 const z = 30;`;

    const entries = parseUnifiedDiff(rawDiff);

    expect(entries).toHaveLength(2);
    expect(entries[0].file).toBe("file1.js");
    expect(entries[1].file).toBe("file2.js");
    expect(entries[0].addedLines).toHaveLength(1);
    expect(entries[1].addedLines).toHaveLength(1);
  });

  it("should return empty array for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("  \n  \n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. Risk Engine Tests
// ---------------------------------------------------------------------------

describe("Risk Engine", () => {
  it("should return empty array for no findings", () => {
    expect(riskEngine([])).toEqual([]);
  });

  it("should deduplicate findings on the same file+line", () => {
    const findings: RawSecurityFinding[] = [
      {
        source: "secret_scanner",
        category: "hardcoded_secret",
        file: "config.js",
        line: 5,
        snippet: null,
        redactedPreview: 'key = "***REDACTED***"',
        reasoning: "Matched AWS key",
        ruleName: "AWS Access Key ID",
        confidence: "high",
        suggestedRiskLevel: "critical",
      },
      {
        source: "secret_scanner",
        category: "hardcoded_secret",
        file: "config.js",
        line: 5,
        snippet: null,
        redactedPreview: 'key = "***REDACTED***"',
        reasoning: "Matched generic key",
        ruleName: "Generic API Key",
        confidence: "medium",
        suggestedRiskLevel: "high",
      },
    ];

    const risks = riskEngine(findings);

    // Should deduplicate into a single finding
    expect(risks).toHaveLength(1);
    // Should take the highest severity
    expect(risks[0].riskLevel).toBe("critical");
    // Should combine rule names
    expect(risks[0].details.ruleMatched).toContain("AWS");
    expect(risks[0].details.ruleMatched).toContain("Generic");
  });

  it("should sort results by severity (critical first)", () => {
    const findings: RawSecurityFinding[] = [
      {
        source: "injection_scanner",
        category: "sql_injection",
        file: "db.js",
        line: 10,
        snippet: "query",
        redactedPreview: "query",
        reasoning: "SQL injection",
        ruleName: "SQL Injection",
        confidence: "high",
        suggestedRiskLevel: "high",
      },
      {
        source: "secret_scanner",
        category: "hardcoded_secret",
        file: "config.js",
        line: 5,
        snippet: null,
        redactedPreview: "redacted",
        reasoning: "AWS key",
        ruleName: "AWS Key",
        confidence: "high",
        suggestedRiskLevel: "critical",
      },
    ];

    const risks = riskEngine(findings);
    expect(risks).toHaveLength(2);
    expect(risks[0].riskLevel).toBe("critical");
    expect(risks[1].riskLevel).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// 8. Shannon Entropy Tests
// ---------------------------------------------------------------------------

describe("Shannon Entropy", () => {
  it("should return 0 for empty string", () => {
    expect(shannonEntropy("")).toBe(0);
  });

  it("should return 0 for single repeated character", () => {
    expect(shannonEntropy("aaaaaaa")).toBe(0);
  });

  it("should return higher entropy for random-looking strings", () => {
    const lowEntropy = shannonEntropy("aaaaabbbbb");
    const highEntropy = shannonEntropy("aK9$mZ2!xR7#bQ4");
    expect(highEntropy).toBeGreaterThan(lowEntropy);
  });

  it("should return > 4.0 for a typical secret key", () => {
    const secretLike = "wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY";
    expect(shannonEntropy(secretLike)).toBeGreaterThan(4.0);
  });
});

// ---------------------------------------------------------------------------
// 9. End-to-End: Raw diff string → SecurityRisk[]
// ---------------------------------------------------------------------------

describe("End-to-End — Raw Diff Input", () => {
  it("should detect an AWS key in a raw unified diff string", () => {
    const rawDiff = `diff --git a/config.js b/config.js
--- a/config.js
+++ b/config.js
@@ -1,2 +1,3 @@
 const express = require("express");
+const AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";
 module.exports = {};`;

    const risks = analyzeSecurityRisks(rawDiff);
    expect(risks.length).toBeGreaterThanOrEqual(1);

    const awsRisk = risks.find((r) => r.riskLevel === "critical");
    expect(awsRisk).toBeDefined();
    expect(awsRisk!.file).toBe("config.js");
    expect(awsRisk!.redactedPreview).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("should handle the demo scenario: hardcoded API key in commit", () => {
    const rawDiff = `diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,5 +1,6 @@
 import axios from "axios";
 
+const GEMINI_API_KEY = "AIzaSyDfakekey1234567890abcdefghijklmnop";
 export async function callApi(prompt: string) {
-  return axios.post("/api", { prompt });
+  return axios.post("/api", { prompt, key: GEMINI_API_KEY });
 }`;

    const risks = analyzeSecurityRisks(rawDiff);
    expect(risks.length).toBeGreaterThanOrEqual(1);

    // Should flag as at least high (API key assignment)
    const keyRisk = risks.find(
      (r) => r.category === "hardcoded_secret"
    );
    expect(keyRisk).toBeDefined();
    expect(["high", "critical"]).toContain(keyRisk!.riskLevel);
    // Must not leak the actual key
    expect(keyRisk!.redactedPreview).toContain("REDACTED");
  });
});

// ---------------------------------------------------------------------------
// 10. Guardrails — secrets never in output
// ---------------------------------------------------------------------------

describe("Guardrails — No Raw Secrets in Output", () => {
  it("should NEVER include raw secret values in any output field", () => {
    const secrets = [
      'const key = "AKIAIOSFODNN7EXAMPLE";',
      'const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";',
      'const db = "postgres://admin:supersecret@db.host:5432/prod";',
      "-----BEGIN RSA PRIVATE KEY-----",
      'const slack = "xoxb-1234567890-abcdefghijklm";',
    ];

    const secretValues = [
      "AKIAIOSFODNN7EXAMPLE",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
      "supersecret",
      "BEGIN RSA PRIVATE KEY-----",
      "1234567890-abcdefghijklm",
    ];

    const diff: DiffFileEntry[] = [makeDiffEntry("secrets.js", secrets)];
    const risks = analyzeSecurityRisks(diff);

    // Check every field of every risk for raw secret leakage
    for (const risk of risks) {
      const serialized = JSON.stringify(risk);
      for (const secretVal of secretValues) {
        expect(serialized).not.toContain(secretVal);
      }
    }
  });
});
