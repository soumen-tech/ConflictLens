# Product Requirements Document (PRD)
## ConflictLens — AI-Powered Git Conflict & Security Intelligence Platform

**Version:** 1.0
**Date:** August 18, 2026
**Team Size:** 3 Members
**Target Build Tool:** Antigravity (AI Coding Agent)
**Project Type:** Hackathon Build (TIU Internal Hackathon)

---

## 1. Overview

### 1.1 Product Name
**ConflictLens**

### 1.2 One-Line Pitch
> "Don't wait for the merge to reveal the problem. CodeGuard predicts it before it happens."

### 1.3 Summary
CodeGuard is a VS Code extension backed by an AI analysis engine that detects **semantic** merge conflicts and **security risks** across Git branches — before they reach the merge stage. Unlike Git's native line-level conflict detection, CodeGuard understands function signatures, dependency graphs, and security-sensitive code patterns to flag risks that traditional tools miss.

### 1.4 Core Differentiator
> "CodeGuard goes beyond Git's line-level conflict detection by understanding code semantics, dependencies, and security risks before changes are merged."

---

## 2. Problem Statement

Modern teams work in parallel across Git branches. Git detects textual (line-level) conflicts, but misses:
- Function signature changes that break callers in other branches
- Cross-file dependency breakage with no overlapping lines
- Security vulnerabilities introduced silently (secrets, injection risks, unsafe input handling)

Teams need a system that predicts these issues **before merge**, not after integration breaks.

---

## 3. Goals & Success Criteria

| Goal | Success Metric (Demo-Ready) |
|---|---|
| Detect semantic conflicts Git misses | Correctly flag the `calculateTotal()` signature-change example live |
| Detect security risks in diffs | Flag at least: hardcoded secrets, SQL/command injection patterns, unsafe eval/input handling |
| Explain risk in plain English | AI-generated explanation + fix suggestion shown in VS Code |
| Real-time developer experience | Warning appears in VS Code within a few seconds of a relevant change/save |
| Team usability | Dashboard shows risk overview across branches/files |

**Out of scope for hackathon MVP:** multi-repo support, auto-fix/auto-commit, CI/CD pipeline integration, non-JS/TS/Python language support (stretch only), full RBAC/auth system.

---

## 4. System Architecture

```
Developer Changes Code (VS Code)
        ↓
Git Change Detection (extension watches working tree / branches)
        ↓
Line-Level Diff Analysis (git diff)
        ↓
AST / Semantic Analysis (function signatures, structure)
        ↓
Dependency & Impact Analysis (who calls what, cross-file graph)
        ↓
Security Analysis (secrets, injection patterns, unsafe input)
        ↓
Unified Risk Engine (Low / Medium / High / Critical scoring)
        ↓
AI Explanation & Recommendation Layer (LLM call)
        ↓
VS Code Warning + Dashboard Display
```

### 4.1 High-Level Components

1. **VS Code Extension (Frontend/Client)** — UI, inline warnings, dashboard webview, command palette hooks.
2. **Core Analysis Engine (Backend)** — Git diff parsing, AST parsing, dependency graph builder, security scanner, risk scoring.
3. **AI Layer** — Calls an LLM API to turn structured risk data into human-readable explanations + remediation suggestions.

### 4.2 Suggested Tech Stack

| Layer | Technology |
|---|---|
| Extension | TypeScript, VS Code Extension API |
| Git integration | `simple-git` or native `git` CLI shell-out |
| AST parsing | `@babel/parser` / `typescript` compiler API (JS/TS), `ast` module (Python, stretch) |
| Dependency graph | Custom graph builder (nodes = functions/files, edges = calls/imports) |
| Security scanning | Regex/pattern rules engine + optional `semgrep` rules (stretch) |
| Backend API | Node.js + Express (or FastAPI if team prefers Python) |
| AI Explanation | Claude API (Anthropic) via `/v1/messages` |
| Dashboard | React webview inside VS Code extension |
| Data storage (session) | In-memory / local JSON (no DB needed for MVP) |

---

## 5. Key Features (Prioritized for Hackathon)

### Must-Have (P0)
- 🔀 Git change detection (branch diff, working tree diff)
- 🧠 Semantic conflict detection via AST (function signature changes)
- 🔗 Cross-file dependency analysis (who calls the changed function)
- 📊 Risk scoring (Low/Medium/High/Critical)
- 🔑 Secret detection (API keys, passwords, tokens in diff)
- 🖥️ VS Code inline warning display
- 🤖 AI-generated plain-English explanation + recommendation

### Should-Have (P1)
- 🛡️ Broader security pattern analysis (injection, unsafe eval/input)
- 📈 Developer dashboard (webview: list of risks, affected files)
- 👥 Team awareness (show risks from teammates' branches, if multi-branch demo is feasible)

### Nice-to-Have / Stretch (P2)
- 🔒 Human-in-the-loop fix approval flow (accept/reject AI suggestion)
- Multi-language AST support (Python in addition to JS/TS)
- Historical risk trend view

---

## 6. Functional Requirements

1. The system **must** detect when a function's signature changes on one branch while it is still called (with the old signature) on another branch/file.
2. The system **must** parse `git diff` output and map changes to AST nodes (functions, classes, imports).
3. The system **must** build a lightweight dependency graph (function → callers, file → imports) for the affected repo.
4. The system **must** scan changed lines for security-sensitive patterns (hardcoded secrets, injection-prone constructs).
5. The system **must** assign a risk level (Low/Medium/High/Critical) based on a rules-based scoring model.
6. The system **must** send structured risk findings to the Claude API and receive a natural-language explanation + recommendation.
7. The system **must** display warnings inline in VS Code (e.g., via Diagnostics API / decorations) and in a dashboard webview.
8. The system **should** allow a manual "Scan Now" command in addition to auto-trigger on save/commit.

---

## 7. Non-Functional Requirements

- **Performance:** Analysis + AI explanation should return within ~5-10 seconds for a typical diff (demo-friendly).
- **Reliability:** Extension must not crash VS Code on parse errors — fail gracefully with a fallback message.
- **Security:** Never send raw secret values to the AI API — mask/redact detected secrets before sending context.
- **Usability:** Warnings must be understandable to a developer with no security background.

---

## 8. Demo Scenario (Judge-Facing)

**Setup:** Two branches.
- Branch A: `calculateTotal(price, tax)` → changed to `calculateTotal(price, tax, discount)`
- Branch B: `checkout.js` still calls `calculateTotal(price, tax)`

**Expected Output:**
```
🔴 HIGH RISK — Semantic Conflict
calculateTotal() was modified in another branch.
Its function signature changed and 1+ files depend on the previous version.
This may cause integration failures even though Git shows no direct line conflict.

Recommendation: Update checkout.js to pass a discount argument,
or provide a default value for backward compatibility.
```

Second demo beat: commit a file with a hardcoded API key → CodeGuard flags it as 🔴 Critical Security Risk with redacted preview + recommendation to move it to environment variables.

---

## 9. Team Split — 3 Members

The work is divided into **3 independent, parallelizable tracks** so each member can build and test their piece with Antigravity separately, then integrate.

### 👤 Member 1 — Git & Semantic Analysis Engine (Core Backend Logic)
**Owns:** The "understanding the code" layer.

- Git change detection: read working tree/branch diffs (`simple-git` or `git diff` shell-out)
- AST parsing for JS/TS (function declarations, signatures, imports/exports)
- Dependency graph builder: map function → callers, file → imports
- Semantic conflict detection logic: compare old vs new function signatures against known call sites
- Output: a structured JSON object per change, e.g.:
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
**Antigravity prompt focus:** "Build a Node.js/TypeScript module that parses git diffs, extracts AST-level function signature changes, and cross-references them against a dependency graph of function call sites."

---

### 👤 Member 2 — Security Analysis Engine + Risk Scoring
**Owns:** The "is this dangerous" layer.

- Secret detection: regex rules for API keys, passwords, tokens, connection strings
- Security pattern analysis: flag injection-prone patterns (string-concatenated SQL, `eval()`, unsanitized input to shell/exec, etc.)
- Unified Risk Engine: combine semantic conflict output (from Member 1) + security findings into a single Low/Medium/High/Critical score per change
- Output: structured risk object merged with Member 1's schema, e.g.:
  ```json
  {
    "type": "security_risk",
    "category": "hardcoded_secret",
    "file": "config.js",
    "line": 12,
    "riskLevel": "critical",
    "redactedPreview": "const apiKey = \"sk-***REDACTED***\""
  }
  ```
**Antigravity prompt focus:** "Build a rules-based security scanner that detects hardcoded secrets and common injection-prone patterns in a code diff, and a risk-scoring function that merges multiple findings into one severity rating."

---

### 👤 Member 3 — VS Code Extension, AI Explanation Layer & Dashboard
**Owns:** The "developer-facing experience" layer.

- VS Code extension scaffold (TypeScript, `vscode` API)
- Trigger analysis on save/commit + manual "Scan Now" command
- Integration with Gemini API (using the free `gemini-2.5-flash` model) to turn structured risk JSON (from Members 1 & 2) into a plain-English explanation + recommendation
- Inline warning display (Diagnostics API / decorations) in the editor
- Dashboard webview (React) showing list of risks, affected files, severity, and project health overview
**Antigravity prompt focus:** "Build a VS Code extension that watches for file saves/commits, calls a local analysis API, sends the structured risk output to the Claude API for a natural-language explanation, and displays results both inline and in a React-based dashboard webview."

---

### 🔗 Integration Point (All 3 Together)
- Member 1 & 2's outputs merge into a single JSON risk report → this is the API contract everyone builds against first.
- **Agree on this JSON schema in the first hour** so all three tracks can build in parallel without blocking each other.
- Member 3 consumes the merged report and renders it — Member 3 can mock the JSON early to start UI work immediately without waiting on 1 & 2.

**Suggested shared contract (finalize before splitting up):**
```json
{
  "risks": [
    {
      "id": "string",
      "type": "semantic_conflict | security_risk",
      "file": "string",
      "riskLevel": "low | medium | high | critical",
      "details": { },
      "aiExplanation": "string (filled in by Member 3's AI layer)"
    }
  ]
}
```

---

## 10. Suggested Timeline (Hackathon Day)

| Time | Milestone |
|---|---|
| Hour 0–1 | Finalize JSON schema, repo setup, split branches for 3 members |
| Hour 1–4 | Each member builds their core module independently |
| Hour 4–5 | Integration checkpoint: merge outputs, fix contract mismatches |
| Hour 5–6 | End-to-end test with the `calculateTotal()` demo scenario |
| Hour 6–7 | Add security-risk demo scenario, polish dashboard UI |
| Hour 7–8 | Bug fixes, rehearse demo, prep slides/pitch |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AST parsing complexity across languages | Scope MVP to JS/TS only |
| AI API latency during live demo | Pre-cache/pre-run the demo scenario once before presenting; have a fallback static explanation |
| Integration mismatches between 3 members | Lock the JSON schema early (Hour 0–1) and don't change it without team sync |
| Time pressure | P0 features only for the demo; P1/P2 are stretch and can be mocked/faked visually if needed |

---

## 12. Appendix — Core Positioning for Pitch

> "CodeGuard goes beyond Git's line-level conflict detection by understanding code semantics, dependencies, and security risks before changes are merged."

> "Don't wait for the merge to reveal the problem. CodeGuard predicts it before it happens."
