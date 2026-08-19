#!/usr/bin/env ts-node
/**
 * @file cli.ts
 * @description Standalone CLI for the security scanner.
 *
 * Usage:
 *   npm run scan:security -- <path-to-diff-file>
 *   npm run scan:security -- --stdin  (read diff from stdin)
 *
 * This lets Track 2 demo the security scanner independently
 * before Member 4's API endpoint is wired up.
 */

import * as fs from "fs";
import * as path from "path";
import { analyzeSecurityRisks } from "./index";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
ConflictLens — Security Scanner CLI
====================================

Usage:
  npm run scan:security -- <path-to-diff-file>
  npm run scan:security -- --stdin

Options:
  <path>     Path to a file containing unified diff text
  --stdin    Read diff from stdin (pipe from git diff)
  --json     Output raw JSON instead of formatted text
  --help     Show this help message

Examples:
  git diff main..feature/my-branch | npm run scan:security -- --stdin
  npm run scan:security -- ./my-changes.diff
  npm run scan:security -- ./my-changes.diff --json
`);
}

function formatRiskLevel(level: string): string {
  const icons: Record<string, string> = {
    critical: "🔴 CRITICAL",
    high: "🟠 HIGH",
    medium: "🟡 MEDIUM",
    low: "🟢 LOW",
  };
  return icons[level] ?? level.toUpperCase();
}

function formatOutput(risks: ReturnType<typeof analyzeSecurityRisks>): void {
  if (risks.length === 0) {
    console.log("\n✅ No security risks found. Clean diff!\n");
    return;
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ConflictLens Security Scan — ${risks.length} risk(s) found`);
  console.log(`${"═".repeat(60)}\n`);

  // Summary by severity
  const counts: Record<string, number> = {};
  for (const risk of risks) {
    counts[risk.riskLevel] = (counts[risk.riskLevel] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .sort(([a], [b]) => {
      const order = ["critical", "high", "medium", "low"];
      return order.indexOf(a) - order.indexOf(b);
    })
    .map(([level, count]) => `${formatRiskLevel(level)}: ${count}`)
    .join("  |  ");
  console.log(`  ${summary}\n`);

  // Individual findings
  for (let i = 0; i < risks.length; i++) {
    const risk = risks[i];
    console.log(`${"─".repeat(60)}`);
    console.log(`  #${i + 1}  ${formatRiskLevel(risk.riskLevel)} — ${risk.category}`);
    console.log(`  File: ${risk.file}${risk.line ? `:${risk.line}` : ""}`);
    console.log(`  Rule: ${risk.details.ruleMatched}`);
    console.log(`  Confidence: ${risk.details.confidence}`);
    if (risk.redactedPreview) {
      console.log(`  Preview: ${risk.redactedPreview}`);
    }
  }

  console.log(`\n${"═".repeat(60)}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const useJson = args.includes("--json");
  const useStdin = args.includes("--stdin");

  let diffText: string;

  if (useStdin) {
    // Read from stdin
    diffText = await readStdin();
  } else {
    // Read from file
    const filePath = args.find((a) => !a.startsWith("--"));
    if (!filePath) {
      console.error("Error: No diff file path provided.");
      printUsage();
      process.exit(1);
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: File not found: ${resolvedPath}`);
      process.exit(1);
    }

    diffText = fs.readFileSync(resolvedPath, "utf-8");
  }

  // Run the scanner
  const risks = analyzeSecurityRisks(diffText);

  if (useJson) {
    console.log(JSON.stringify({ risks, meta: { scannedAt: new Date().toISOString(), risksFound: risks.length } }, null, 2));
  } else {
    formatOutput(risks);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);

    // Timeout after 5 seconds if no input
    setTimeout(() => {
      if (chunks.length === 0) {
        console.error("Error: No input received on stdin after 5 seconds.");
        process.exit(1);
      }
    }, 5000);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
