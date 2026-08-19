# SYSTEM ARCHITECTURE: CodeGuard
## AI-Powered Git Conflict & Security Intelligence Platform

This document defines the structural design of CodeGuard, detailing how the VS Code client, the local analysis engine, and the external AI layer interact to detect semantic and security risks before a branch is merged.

---

## 1. High-Level Architecture

CodeGuard operates using a **Local Client-Server Model** combined with an **External AI API**. 

```text
[ Developer Workspace ]
       │
       ▼ (Code Save / Git Commit)
┌───────────────────────────────────────────────┐
│              VS Code Extension                │
│  (UI, Webview Dashboard, Diagnostics API)     │
└──────────────────────┬────────────────────────┘
                       │ HTTP / Local IPC
                       ▼
┌───────────────────────────────────────────────┐
│        CodeGuard Local Analysis Engine        │
│                (Node.js + Express)            │
│                                               │
│  ┌──────────────┐   ┌──────────────────────┐  │
│  │ Git Diffing  │──▶│ AST & Graph Builder  │  │
│  └──────────────┘   └──────────────────────┘  │
│                            │                  │
│  ┌──────────────┐          │                  │
│  │ Security     │◀─────────┘                  │
│  │ Scanner      │                             │
│  └──────────────┘                             │
│          │                                    │
│          ▼                                    │
│  ┌─────────────────────────────────────────┐  │
│  │          Unified Risk Engine            │  │
│  │  (Aggregates & Scores Vulnerabilities)  │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────┬────────────────────────┘
                       │
                       ▼ (JSON Risk Report via API)
┌───────────────────────────────────────────────┐
│          External AI Layer (Claude)           │
│  (Translates structured data to English)      │
└───────────────────────────────────────────────┘
```

---

## 2. Component Breakdown

### A. The Triggers (VS Code Client)
* Watches the active workspace.
* Hooks into `onDidSaveTextDocument` and the Git source control tab.
* Sends the current file paths and git branch context to the local analysis engine.

### B. Git Change Detection (Module 1)
* Executes `git diff HEAD` and `git diff main...HEAD`.
* Isolates exactly which files and lines have been modified, added, or deleted.

### C. Semantic & Dependency Engine (Module 1)
* Parses the changed files into an Abstract Syntax Tree (AST).
* Identifies if a changed node is a function declaration, class, or exported module.
* Scans the rest of the workspace (or a cached dependency graph) to find **Call Sites**.
* Evaluates if the signature change breaks the existing callers.

### D. Security Scanner (Module 2)
* Operates in parallel with the Semantic Engine.
* Analyzes the textual diff and AST for restricted patterns (e.g., `const apiKey = "..."`).
* Applies a risk-weighting algorithm (e.g., hardcoded secret = CRITICAL, variable named `password` logged to console = HIGH).

### E. Unified Risk Engine & AI Explainer (Module 2 & 3)
* Merges the semantic conflicts and security risks into a unified JSON schema.
* Strips/redacts sensitive data (e.g., replacing actual API keys with `***REDACTED***`).
* Sends the formatted JSON payload to the Claude API.
* Claude returns a structured response containing a `summary`, `explanation`, and `recommendation`.

---

## 3. Integration Contract (JSON Schema)

To ensure parallel development across the 3-person team, all modules must adhere to this unified JSON structure before passing data to the frontend/AI layer.

```json
{
  "analysis_id": "req_8f73b2a",
  "timestamp": "2026-08-18T10:55:00Z",
  "risks": [
    {
      "id": "risk_001",
      "type": "semantic_conflict",
      "riskLevel": "high",
      "location": {
        "file": "src/utils/math.js",
        "line": 42
      },
      "details": {
        "functionName": "calculateTotal",
        "changeType": "signature_parameter_added",
        "affectedFiles": ["src/components/Checkout.js"]
      },
      "ai_context": {
        "explanation": "Pending AI response...",
        "recommendation": "Pending AI response..."
      }
    },
    {
      "id": "risk_002",
      "type": "security_risk",
      "riskLevel": "critical",
      "location": {
        "file": "src/config/db.js",
        "line": 12
      },
      "details": {
        "category": "hardcoded_secret",
        "redactedPreview": "const DB_PASSWORD = \"***REDACTED***\""
      },
      "ai_context": {
        "explanation": "Pending AI response...",
        "recommendation": "Pending AI response..."
      }
    }
  ]
}
```
