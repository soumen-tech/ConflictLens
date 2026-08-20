# CodeGuard — Git & Semantic Analysis Engine

**Branch:** `git-semantic-analysis-engine`
**Owner:** Member 1 — Git Intelligence & Conflict Analysis

---

## What this module does

Analyzes two Git branches and produces a structured **conflict risk report** — telling you, before you merge, whether the branches will conflict and how severe the risk is.

It uses Git's own merge machinery (`git merge-tree`) non-destructively. It never runs `git merge` on your active branch.

---

## Quick Start

```bash
cd packages/git-engine
npm install
npm test                  # Run all 35 tests

# Analyze any two branches in any repo:
npm run analyze -- --repo /path/to/repo --base main --compare feature/payment
```

---

## Module Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Repository detection | ✅ Complete |
| 2 | Branch intelligence | ✅ Complete |
| 3 | Commit comparison | ✅ Complete |
| 4 | Merge base detection | ✅ Complete |
| 5 | Git diff engine | ✅ Complete |
| 6 | Line range extraction | ✅ Complete |
| 7 | Overlap detection | ✅ Complete |
| 8 | Non-destructive conflict validation | ✅ Complete |
| 9 | Risk scoring | ✅ Complete |
| 10 | Public API (`analyzeBranches`) | ✅ Complete |
| — | CLI tool | ✅ Complete |
| — | Tests (35/35) | ✅ All passing |

---

## Directory Structure

```
packages/git-engine/
└── src/
    ├── index.ts                         ← Public API entry point
    ├── cli.ts                           ← Developer CLI tool
    ├── shared/
    │   └── types/
    │       └── gitConflictResult.ts     ← FROZEN shared contract
    ├── core/
    │   ├── git/
    │   │   ├── GitRepository.ts         ← Repo detection & root resolution
    │   │   ├── GitBranch.ts             ← Branch intelligence
    │   │   ├── GitCommit.ts             ← Commit comparison
    │   │   ├── GitMergeBase.ts          ← Common ancestor detection
    │   │   ├── GitDiff.ts               ← Branch diff engine
    │   │   ├── GitStatus.ts             ← Working tree status
    │   │   ├── GitErrors.ts             ← Typed error factory
    │   │   └── types.ts                 ← Internal git types
    │   ├── conflict/
    │   │   ├── DiffRangeParser.ts       ← Unified diff → ChangedRange[]
    │   │   ├── OverlapDetector.ts       ← SAFE/LOW/MEDIUM/HIGH classification
    │   │   ├── ConflictDetector.ts      ← git merge-tree validation
    │   │   ├── ConflictRisk.ts          ← Per-file risk scoring
    │   │   └── types.ts
    │   └── risk/
    │       ├── RiskScorer.ts            ← Multi-factor deterministic scorer
    │       ├── RiskFactors.ts           ← Weighted factor definitions
    │       └── types.ts
    └── tests/
        ├── testHelpers.ts               ← Real temp git repo factories
        ├── git.test.ts                  ← Git layer tests
        ├── conflict.test.ts             ← Diff parser & overlap tests
        └── integration.test.ts          ← Full pipeline tests
```

---

## Integration for Person 2 (Security / Semantic Engine)

Import the public API and shared types:

```ts
import { analyzeBranches, isCodeGuardException } from "@codeguard/git-engine";
import type { GitConflictResult, ConflictCandidate, ChangedFile } from "@codeguard/git-engine";

const result: GitConflictResult = await analyzeBranches({
  repositoryPath: "/path/to/repo",
  branchA: "main",
  branchB: "feature/payment",
});

// result.files        → all changed files with A/B line ranges
// result.conflicts    → overlap candidates with confidence scores
// result.risk         → { score, level, factors }
// result.mergeBase    → common ancestor SHA

// Catch typed errors:
try {
  await analyzeBranches(...);
} catch (err) {
  if (isCodeGuardException(err)) {
    console.error(err.codeGuardError.code);    // "BRANCH_NOT_FOUND"
    console.error(err.codeGuardError.message); // human-readable
  }
}
```

**Your job:** Add `security_risk` entries to the `risks[]` array that Person 3 will render. The `ChangedFile[]` from `result.files` gives you the diff content to scan.

---

## Integration for Person 3 (Server / AI / Extension / Dashboard)

```ts
import { analyzeBranches } from "@codeguard/git-engine";

// Call this from your Express POST /analyze handler:
const result = await analyzeBranches({
  repositoryPath: req.body.repoPath,
  branchA: req.body.base,
  branchB: req.body.compare,
});

// Pass result to Gemini for AI explanation, then send back to VS Code extension.
```

The `GitConflictResult` shape is the frozen contract. All field names are stable.

---

## Shared Contract Location

```
src/shared/types/gitConflictResult.ts
```

**Do NOT copy this file** — import it directly. If you need to change the contract, flag it explicitly to the team first.

---

## Error Codes

| Code | Meaning |
|------|---------|
| `NOT_A_GIT_REPO` | Path is not inside a git repository |
| `BRANCH_NOT_FOUND` | Named branch/ref does not exist |
| `INVALID_REPO_PATH` | Path does not exist or is not a directory |
| `GIT_NOT_INSTALLED` | git binary not found on PATH |
| `GIT_COMMAND_FAILURE` | A git command returned an unexpected error |
| `MERGE_BASE_UNAVAILABLE` | Cannot determine merge base (shallow clone etc.) |
| `MALFORMED_DIFF` | Diff output was unparseable |
| `SHALLOW_REPO_LIMITATION` | Shallow repo — run `git fetch --unshallow` |

---

## CLI Tool

```bash
npm run analyze -- --repo ./my-repo --base main --compare feature/payment
```

Output example:
```
Repository: /path/to/my-repo
Base Branch: main (a1b2c3d4)
Compare Branch: feature/payment (e5f6g7h8)
Merge Base: 9i10j11k

Files Changed: 4
  ✎ src/cart.js  ⚡ BOTH BRANCHES
  ✚ src/payment.js

⚠  Conflict Candidates: 1
  src/cart.js
    Overlap Level: HIGH
    Git Conflict:  YES
    Confidence:    95%

🎯 Risk Assessment
  Score: 60/100
  Level: HIGH
  Contributing Factors:
    • Direct modification overlap on same lines
    • Git merge-tree predicts an actual merge conflict
```

---

## Known Limitations

1. **Shallow clones** — merge base detection fails; run `git fetch --unshallow`
2. **Submodule conflicts** — not detected at the submodule level
3. **Binary files** — reported but no line-range analysis performed
4. **Languages** — this module has no AST/semantic understanding; that belongs to Person 2
5. **Performance** — full dependency graph scan not implemented here; caching layer can be added without changing the public API
