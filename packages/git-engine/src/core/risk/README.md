# core/risk — Conflict Risk Scoring Engine

Produces a deterministic, multi-factor, human-explainable risk score from conflict candidates.

---

## Scoring Model

**No ML. No randomness. Same inputs → same score, always.**

### Thresholds

| Score | Level |
|-------|-------|
| 0–19 | `LOW` |
| 20–49 | `MEDIUM` |
| 50–79 | `HIGH` |
| 80–100 | `CRITICAL` |

### Risk Factors (weighted)

| Factor | Weight |
|--------|--------|
| Direct line overlap on same lines | 35 |
| Git merge-tree predicts actual conflict | 25 |
| Multiple files with overlapping changes | 15 |
| Highly diverged branches (≥5 commits each) | 10 |
| Adjacent modifications — potential merge interaction | 10 |
| File deleted on one branch while modified on another | 10 |
| Moderately diverged branches | 5 |
| Binary file involved in conflict | 5 |
| Bonus: many overlapping hunk pairs | up to +15 |

Every score comes with a `factors` array explaining what drove it.

---

## Public API

```ts
import { computeRiskScore } from "./RiskScorer";

const risk = computeRiskScore({
  conflicts,        // ConflictCandidate[]
  files,            // ChangedFile[]
  commitsAheadA,    // number
  commitsAheadB,    // number
  mergeTreeReliable // boolean
});

// risk.score   → 82
// risk.level   → "CRITICAL"
// risk.factors → ["Direct modification overlap on same lines", "Git merge-tree predicts an actual merge conflict", ...]
```

---

## Example Output

```json
{
  "score": 82,
  "level": "CRITICAL",
  "factors": [
    "Direct modification overlap on same lines",
    "Git merge-tree predicts an actual merge conflict",
    "Multiple files with overlapping changes",
    "High number of overlapping hunk pairs (6)"
  ]
}
```

---

## Extending the model

To add a new factor, add an entry to `RiskFactors.ts`:

```ts
{
  name: "Your factor description",
  weight: 10,
  applies: (candidates, files, commitsAheadA, commitsAheadB) => {
    // return true when this factor applies
    return someCondition;
  }
}
```

The scorer will automatically pick it up. No other changes needed.

---

## Test command

```bash
cd packages/git-engine
npm test
```
