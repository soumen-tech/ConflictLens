#!/usr/bin/env ts-node
/**
 * @file cli.ts — Developer debugging CLI
 *
 * Usage:
 *   npx ts-node src/cli.ts --repo ./demo-repo --base main --compare feature/payment
 *
 * Or via npm script:
 *   npm run analyze -- --repo . --base main --compare git-semantic-analysis-engine
 */

import { analyzeBranches, isCodeGuardException } from "./index";

// ---------------------------------------------------------------------------
// Argument parsing (no external deps — just process.argv)
// ---------------------------------------------------------------------------

function parseArgs(): { repo: string; base: string; compare: string } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const repo = get("--repo") ?? ".";
  const base = get("--base");
  const compare = get("--compare");

  if (!base || !compare) {
    console.error("Usage: ts-node src/cli.ts --repo <path> --base <branch> --compare <branch>");
    process.exit(1);
  }

  return { repo, base, compare };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function riskColor(level: string): string {
  const colors: Record<string, string> = {
    LOW: "\x1b[32m",      // green
    MEDIUM: "\x1b[33m",   // yellow
    HIGH: "\x1b[31m",     // red
    CRITICAL: "\x1b[35m", // magenta
  };
  return colors[level] ?? "\x1b[0m";
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";

function render(result: Awaited<ReturnType<typeof analyzeBranches>>): void {
  const { repository, branches, commits, files, conflicts, risk, mergeBase, metadata } = result;

  console.log("\n" + BOLD + "╔══════════════════════════════════════════╗" + RESET);
  console.log(BOLD + "║      CodeGuard Git Analysis Report       ║" + RESET);
  console.log(BOLD + "╚══════════════════════════════════════════╝" + RESET + "\n");

  console.log(CYAN + "Repository:" + RESET, repository.root);
  console.log(CYAN + "Git Version:" + RESET, repository.gitVersion);
  console.log(CYAN + "Base Branch:" + RESET, branches.branchA.shortName,
    DIM + `(${branches.branchA.headCommit.slice(0, 8)})` + RESET);
  console.log(CYAN + "Compare Branch:" + RESET, branches.branchB.shortName,
    DIM + `(${branches.branchB.headCommit.slice(0, 8)})` + RESET);
  console.log(CYAN + "Merge Base:" + RESET, mergeBase.slice(0, 12));
  console.log(CYAN + "Commits Ahead A:" + RESET, commits.commitsAheadA);
  console.log(CYAN + "Commits Ahead B:" + RESET, commits.commitsAheadB);
  console.log(CYAN + "Diverged:" + RESET, commits.diverged ? "Yes" : "No");

  console.log("\n" + DIM + "─".repeat(44) + RESET);
  console.log(BOLD + "\n📂 Files Changed:" + RESET, files.length);

  if (files.length > 0) {
    for (const f of files) {
      const statusIcon: Record<string, string> = {
        added: "✚", modified: "✎", deleted: "✖", renamed: "→", copied: "⎘", unknown: "?"
      };
      const icon = statusIcon[f.status] ?? "?";
      const bothModified = f.changesA.length > 0 && f.changesB.length > 0;
      const marker = bothModified ? " \x1b[31m⚡ BOTH BRANCHES\x1b[0m" : "";
      console.log(`  ${DIM}${icon}${RESET} ${f.path}${marker}`);
    }
  }

  console.log("\n" + DIM + "─".repeat(44) + RESET);
  console.log(BOLD + "\n⚠  Conflict Candidates:" + RESET, conflicts.length);

  if (conflicts.length === 0) {
    console.log("  " + "\x1b[32m✓ No conflict candidates detected\x1b[0m");
  } else {
    for (const c of conflicts) {
      const color = c.overlapLevel === "HIGH" ? "\x1b[31m"
        : c.overlapLevel === "MEDIUM" ? "\x1b[33m"
        : "\x1b[36m";

      console.log(`\n  ${BOLD}${color}${c.file}${RESET}`);
      console.log(`    Overlap Level:   ${color}${c.overlapLevel}${RESET}`);
      console.log(`    Git Conflict:    ${c.hasActualConflict ? "\x1b[31mYES\x1b[0m" : "\x1b[32mNo\x1b[0m"}`);
      console.log(`    Confidence:      ${Math.round(c.confidence * 100)}%`);

      if (c.overlappingRanges.length > 0) {
        console.log(`    Overlapping Hunks:`);
        for (const { rangeA, rangeB } of c.overlappingRanges.slice(0, 3)) {
          console.log(`      Branch A: lines ${rangeA.startLine}–${rangeA.endLine}`);
          console.log(`      Branch B: lines ${rangeB.startLine}–${rangeB.endLine}`);
        }
        if (c.overlappingRanges.length > 3) {
          console.log(`      ... and ${c.overlappingRanges.length - 3} more`);
        }
      }
    }
  }

  console.log("\n" + DIM + "─".repeat(44) + RESET);
  const rCol = riskColor(risk.level);
  console.log(BOLD + "\n🎯 Risk Assessment\n" + RESET);
  console.log(`  ${BOLD}Score: ${rCol}${risk.score}/100${RESET}`);
  console.log(`  ${BOLD}Level: ${rCol}${risk.level}${RESET}`);
  console.log(`\n  Contributing Factors:`);
  for (const f of risk.factors) {
    console.log(`    • ${f}`);
  }

  console.log("\n" + DIM + "─".repeat(44) + RESET);
  console.log(DIM + `\nAnalyzed at: ${metadata.analyzedAt}` + RESET);
  console.log(DIM + `Duration:    ${metadata.durationMs}ms` + RESET + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { repo, base, compare } = parseArgs();

  console.log(DIM + `\nAnalyzing ${base} vs ${compare} in ${repo}...` + RESET);

  try {
    const result = await analyzeBranches({
      repositoryPath: repo,
      branchA: base,
      branchB: compare,
    });
    render(result);
  } catch (err) {
    if (isCodeGuardException(err)) {
      console.error("\n\x1b[31m✖ CodeGuard Error\x1b[0m");
      console.error(`  Code:    ${err.codeGuardError.code}`);
      console.error(`  Message: ${err.codeGuardError.message}`);
      if (err.codeGuardError.cause) {
        console.error(`  Cause:   ${err.codeGuardError.cause}`);
      }
    } else {
      console.error("\n\x1b[31m✖ Unexpected Error:\x1b[0m", (err as Error).message);
    }
    process.exit(1);
  }
}

main();
