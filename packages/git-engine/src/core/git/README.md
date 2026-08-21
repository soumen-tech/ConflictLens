# core/git — Git Repository & Branch Intelligence

This module is the lowest-level layer of the ConflictLens Git engine. It wraps `simple-git` into typed, structured APIs for detecting repositories, reading branch state, fetching commit information, computing merge bases, and diffing branches. It has **zero dependencies** on VS Code, Express, the security scanner, or the AI layer.

---

## Public APIs

### `GitRepository`

```ts
import { openRepository } from "./GitRepository";

const repo = await openRepository("/path/to/project");
// repo.root      → absolute path to .git parent
// repo.gitVersion → "2.52.0"
// repo.git       → configured SimpleGit instance
```

**Error codes thrown:**
- `INVALID_REPO_PATH` — path does not exist or is not a directory
- `NOT_A_GIT_REPO` — no `.git` found walking up from the path
- `GIT_NOT_INSTALLED` — `git` binary not on PATH

---

### `GitBranch`

```ts
import { getCurrentBranch, resolveBranchRef, branchExists, listLocalBranches } from "./GitBranch";

const current = await getCurrentBranch(git);         // "main" or null (detached HEAD)
const info    = await resolveBranchRef(git, "main"); // BranchInfo
const exists  = await branchExists(git, "feature/payment"); // true/false
const local   = await listLocalBranches(git);        // RawBranchInfo[]
```

`resolveBranchRef` handles branch names with **slashes, hyphens, underscores** (e.g. `feature/payment-v2`). It never concatenates user input into shell strings.

**Error codes thrown:**
- `BRANCH_NOT_FOUND` — ref cannot be resolved as local, remote, or arbitrary ref

---

### `GitMergeBase`

```ts
import { getMergeBase } from "./GitMergeBase";

const sha = await getMergeBase(git, "main", "feature/payment");
```

**Error codes thrown:**
- `MERGE_BASE_UNAVAILABLE` — shallow repo, unrelated histories, or empty result
- `BRANCH_NOT_FOUND` — one or both refs unknown

---

### `GitCommit`

```ts
import { compareBranches, getUniqueCommits } from "./GitCommit";

const div = await compareBranches(git, "main", "feature", mergeBase);
// div.commitsAheadA → 0
// div.commitsAheadB → 3
// div.diverged      → true

const commits = await getUniqueCommits(git, mergeBase, "feature");
// ["sha1", "sha2", "sha3"]
```

---

### `GitDiff`

```ts
import { getDiffFromMergeBase, mergeDiffResults } from "./GitDiff";

const diffA = await getDiffFromMergeBase(git, mergeBase, "branch-a");
const diffB = await getDiffFromMergeBase(git, mergeBase, "branch-b");

const files = mergeDiffResults(diffA, diffB, mergeBase, git);
// files[].changesA → ChangedRange[] for branch A
// files[].changesB → ChangedRange[] for branch B
```

---

## Limitations

- Only supports repositories where Git has full history. Shallow clones will get `SHALLOW_REPO_LIMITATION`.
- Does not support submodules as independent repos — treats them as files.
- Rename detection uses 90% similarity threshold (configurable in `GitDiff.ts`).

---

## Test command

```bash
cd packages/git-engine
npm test
```
