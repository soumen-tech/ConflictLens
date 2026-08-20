# Member 1 Code Review — Git & Semantic Analysis Engine

**Reviewer:** Track 2 (Security + Risk Scoring)
**Branch reviewed:** `git-semantic-analysis-engine`
**Date:** 2026-08-19
**Status:** Read-only review — no code modified

---

## 1. WHAT EXISTS

Member 1's code lives at `packages/git-engine/` (TypeScript, using Vitest for testing). It's a monorepo-style package named `@conflictlens/git-engine`.

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API entry point — exports `analyzeBranches(options)` |
| `src/shared/types/gitConflictResult.ts` | Shared type contract — `GitConflictResult`, `BranchInfo`, `ChangedFile`, `ChangedRange`, `ConflictCandidate`, `RiskAssessment` |
| `src/core/git/GitRepository.ts` | Repository detection — opens a git repo at a given path |
| `src/core/git/GitBranch.ts` | Branch resolution — resolves branch names to refs/SHAs |
| `src/core/git/GitMergeBase.ts` | Merge-base computation between two branches |
| `src/core/git/GitCommit.ts` | Commit divergence analysis (how many commits ahead each branch is) |
| `src/core/git/GitDiff.ts` | Diff engine — diffs each branch against merge base, returns `ChangedFile[]` with line ranges |
| `src/core/git/GitErrors.ts` | Typed error taxonomy (`ConflictLensException`) |
| `src/core/git/types.ts` | Internal git module types |
| `src/core/conflict/DiffRangeParser.ts` | Parses unified diff output into per-file `ChangedRange[]` maps |
| `src/core/conflict/ConflictDetector.ts` | Uses `git merge-tree` (non-destructive) to validate actual merge conflicts |
| `src/core/conflict/OverlapDetector.ts` | Detects overlapping line ranges between two branches' changes to the same file |
| `src/core/conflict/ConflictRisk.ts` | Conflict candidate building helper types |
| `src/core/conflict/types.ts` | Internal conflict module types |
| `src/core/risk/RiskScorer.ts` | Multi-factor deterministic risk scoring engine (0–100 score → LOW/MEDIUM/HIGH/CRITICAL) |
| `src/core/risk/RiskFactors.ts` | 8 weighted risk factors (overlap, merge-tree prediction, divergence, binary files, etc.) |
| `src/core/risk/types.ts` | `RiskInput` interface |
| `src/cli.ts` | CLI tool — `npx ts-node src/cli.ts <repoPath> <branchA> <branchB>` |
| `src/tests/git.test.ts` | Unit tests for git modules |
| `src/tests/conflict.test.ts` | Unit tests for conflict detection |
| `src/tests/integration.test.ts` | Integration test (requires actual git repo) |
| `src/tests/testHelpers.ts` | Test utilities and fixtures |
| `vitest.config.ts` | Vitest configuration |
| `tsconfig.json` | TypeScript configuration (strict, ES2022 target) |
| `package.json` | Dependencies: `simple-git`. Dev deps: TypeScript, Vitest, ts-node |

**Notable:** `node_modules/` is committed to the branch (~2500+ files, ~1M+ lines). This should be added to `.gitignore` and removed from tracking.

---

## 2. CONTRACT CHECK

### Expected shape (from PRD section 9):

```json
{
  "type": "semantic_conflict",
  "function": "calculateTotal",
  "file": "utils.js",
  "changeType": "signature_change",
  "affectedFiles": ["checkout.js"],
  "riskLevel": "high"
}
```

### Actual output shape (`GitConflictResult`):

```typescript
{
  repository: { root: string, gitVersion: string },
  branches: { branchA: BranchInfo, branchB: BranchInfo },
  mergeBase: string,
  commits: { commitsAheadA, commitsAheadB, commonAncestor, diverged },
  files: ChangedFile[],          // file-level changes with line ranges
  conflicts: ConflictCandidate[],// line-overlap conflicts per file
  risk: RiskAssessment,          // single overall score
  metadata: { analyzedAt, durationMs, gitVersion }
}
```

### ⚠️ Mismatches

| Field | PRD Contract | Member 1 Actual | Status |
|-------|-------------|-----------------|--------|
| `type` | `"semantic_conflict"` | Not present — no per-finding `type` field | ❌ Missing |
| `function` | Function name that changed | Not tracked — analysis is line/range level, not AST node level | ❌ Missing |
| `changeType` | `"signature_change"` | Not present — no signature analysis | ❌ Missing |
| `affectedFiles` | Array of files calling the changed function | Not present — no dependency graph of callers | ❌ Missing |
| `riskLevel` | `"low" \| "medium" \| "high" \| "critical"` (lowercase) | `"LOW" \| "MEDIUM" \| "HIGH" \| "CRITICAL"` (UPPERCASE) | ⚠️ Casing mismatch |
| Output structure | Array of individual findings | Single `GitConflictResult` with nested sub-objects | ⚠️ Different shape |

**Bottom line:** The output does not match the PRD's `semantic_conflict` contract. Member 1 built a **git-level conflict prediction engine** (line overlap + merge-tree validation), not the **semantic/AST analysis engine** the PRD describes.

---

## 3. GAPS vs. PRD Functional Requirements

### FR-1: Detect function signature changes → ❌ NOT IMPLEMENTED
No AST parsing is present. `@babel/parser` and `@babel/traverse` are not dependencies. The engine works entirely at the git diff line-range level. There is no function signature extraction, no parameter comparison, no old-vs-new signature detection.

### FR-2: Parse `git diff` and map changes to AST nodes → ⚠️ PARTIALLY IMPLEMENTED
Git diff parsing is fully implemented (`GitDiff.ts`, `DiffRangeParser.ts`) — this is solid work. However, the "map to AST nodes" part is not done. Changes are mapped to line ranges only, not to function/class/import declarations.

### FR-3: Build dependency graph (function → callers, file → imports) → ❌ NOT IMPLEMENTED
No dependency graph builder exists. No import analysis, no call-site tracking. This is a prerequisite for the `affectedFiles` field and the `calculateTotal()` demo scenario.

### What IS implemented well:
- ✅ Git diff parsing (comprehensive, handles renames, binary files)
- ✅ Merge-tree conflict prediction (non-destructive)
- ✅ Line-overlap detection with classification (SAFE/LOW/MEDIUM/HIGH)
- ✅ Multi-factor risk scoring (deterministic, well-documented thresholds)
- ✅ Typed error taxonomy
- ✅ CLI tool for standalone demo
- ✅ Good test coverage structure

---

## 4. INTEGRATION RISK for Track 2 (Security + Risk Scoring)

### 4.1 Output shape incompatibility
Member 1's `analyzeBranches()` returns a single `GitConflictResult` object, not an array of individual findings matching the shared contract. Track 2's risk engine expects to receive an array of `{ type: "semantic_conflict", ... }` findings to merge with security findings.

**Mitigation:** Track 2 will define its own `SemanticConflictFinding` stub type and leave a clearly marked TODO + adapter function for when Member 1 updates their output to match the contract. The risk engine will work with an empty semantic findings array in the meantime.

### 4.2 RiskLevel casing
Member 1 uses UPPERCASE: `"LOW" | "MEDIUM" | "HIGH" | "CRITICAL"`.
The shared contract uses lowercase: `"low" | "medium" | "high" | "critical"`.

**Mitigation:** Track 2 will normalize to lowercase in the adapter layer (`riskLevel.toLowerCase()`).

### 4.3 No diff parser to reuse for security scanning
The prompt suggests reusing Member 1's diff parser. Their `DiffRangeParser.ts` parses unified diff into `Map<filename, ChangedRange[]>` (start line, line count, change type). This gives us file paths and line ranges but NOT the actual line **content** (the code text). For secret/injection scanning, we need the actual added-line content.

**Mitigation:** Track 2 will implement a lightweight diff content parser that extracts `{file, addedLines: [{lineNumber, content}]}` from raw unified diff text. This complements (rather than replaces) Member 1's range parser.

### 4.4 Async vs. sync API shape
Member 1's `analyzeBranches()` is `async` (returns `Promise<GitConflictResult>`). Track 2's `analyzeSecurityRisks(diff)` will be synchronous (pure function on already-parsed diff text). No conflict — Member 4's Express endpoint will `await` the async one and call the sync one, then merge results.

### 4.5 `node_modules/` committed
Member 1 committed `node_modules/` to their branch. This won't directly break integration, but will make PRs enormous and may cause merge conflicts if dependencies differ. They should `git rm -r --cached node_modules/` before merging.

---

## Summary & Recommendations

1. **Critical:** Member 1 needs to add AST parsing (`@babel/parser` + `@babel/traverse`) and signature-change detection to meet PRD FR-1 and FR-3. Without this, the `calculateTotal()` demo scenario (PRD section 8) cannot work.
2. **Critical:** Output must include per-finding objects with `type: "semantic_conflict"`, `function`, `changeType`, `affectedFiles` to match the shared contract.
3. **Important:** RiskLevel casing should be normalized to lowercase to match the shared contract.
4. **Important:** `node_modules/` should be removed from git tracking.
5. **For Track 2:** We proceed without blocking on Member 1 — our risk engine will accept a `SemanticConflictFinding[]` input with a stub type, and integrate when their output is ready.
