# core/conflict — Diff Range Parser & Overlap Detector

Parses unified diff output into structured line ranges and detects where branch A and branch B's changes overlap.

---

## Modules

### `DiffRangeParser`

Parses the raw output of `git diff -U3` into a `Map<filePath, ChangedRange[]>`.

```ts
import { parseDiffOutput } from "./DiffRangeParser";

const ranges = parseDiffOutput(rawUnifiedDiff);
// Map { "src/utils.js" → [{ startLine: 40, lineCount: 8, endLine: 47, changeType: "modified" }] }
```

**Handles correctly:**
- `@@ -40,8 +40,12 @@` — standard modified hunks
- `@@ -10,3 +10,0 @@` — zero-length new ranges (pure deletions) → `lineCount: 0`
- `@@ -0,0 +1,3 @@` — new files starting at line 1
- Multiple hunks in one file — all extracted independently
- Binary files — returns `[]` (no line-range analysis attempted)
- Renamed files — uses `+++ b/new-path.js` as the map key

---

### `OverlapDetector`

Classifies the overlap between branch A and branch B's `ChangedRange[]` for a single file.

```ts
import { detectOverlap } from "./OverlapDetector";

const result = detectOverlap("src/cart.js", rangesA, rangesB);
// result.overlapLevel → "HIGH"
// result.overlaps[0].overlappingLines → 5
```

**Overlap levels (precise definitions):**

| Level | Meaning |
|-------|---------|
| `SAFE` | Ranges don't interact at all (gap > 5 lines or only one side touched the file) |
| `LOW` | Ranges are nearby (gap ≤ 5 lines) — low interaction risk |
| `MEDIUM` | Ranges are adjacent (touching at one boundary) — possible merge interaction |
| `HIGH` | Ranges share at least one line number — direct textual overlap |

> **Important:** `HIGH` overlap means textual line overlap exists. It does NOT guarantee a Git merge conflict — Git's three-way merge may still resolve it cleanly. Use `ConflictDetector.validateMergeConflicts()` (which calls `git merge-tree`) for the authoritative answer.

---

### `ConflictDetector`

Validates conflicts non-destructively using `git merge-tree`. Never runs `git merge`.

```ts
import { validateMergeConflicts, buildConflictCandidates } from "./ConflictDetector";

const mergeTree = await validateMergeConflicts(git, mergeBase, "branch-a", "branch-b");
// mergeTree.conflictingFiles → ["src/cart.js"]
// mergeTree.validationReliable → true

const candidates = buildConflictCandidates(files, mergeTree);
// candidates[0].hasActualConflict → true
// candidates[0].confidence → 0.95
```

---

## Scoring model (per-file)

`ConflictRisk.scoreCandidate()` produces a 0–100 file-level score:

| Factor | Points |
|--------|--------|
| Direct line overlap (`HIGH`) | +40 |
| Git merge-tree predicts conflict | +30 |
| Adjacent modification (`MEDIUM`) | +20 |
| Multiple overlapping hunk pairs | +8–15 |

---

## Test command

```bash
cd packages/git-engine
npm test
```
