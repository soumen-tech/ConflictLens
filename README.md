# ConflictLens (CodeGuard)

> **"Don't wait for the merge to reveal the problem. CodeGuard predicts it before it happens."**

ConflictLens is an AI-powered VS Code extension + backend that predicts **semantic merge conflicts** and **security risks** across Git branches — *before* they reach the merge stage. Unlike Git's native line-level conflict detection, ConflictLens understands function signatures, dependency graphs, and security-sensitive code patterns to flag risks that traditional tools miss.

## Core Features

- 🔀 **Semantic conflict detection** — AST-level function signature change tracking + cross-file dependency analysis
- 🔑 **Secret detection** — API keys, tokens, credentials, connection strings flagged with redacted previews
- 🛡️ **Injection pattern analysis** — SQL injection, command injection, unsafe eval/input detection
- 📊 **Unified risk scoring** — Low / Medium / High / Critical classification with documented rules
- 🤖 **AI explanations** — Plain-English risk summaries + fix recommendations via Gemini API
- 🖥️ **VS Code inline warnings** — Diagnostics API integration with squiggly underlines + hover tooltips
- 📈 **Dashboard** — React webview panel with risk overview, filtering, and severity badges

## Quickstart

```bash
# Clone the repo
git clone https://github.com/soumen-tech/ConflictLens.git
cd ConflictLens

# Install backend dependencies
cd backend && npm install

# Run security scanner standalone (demo)
npm run scan:security -- <path-to-diff-file>

# Start the backend API server
npm run dev

# Install and launch the VS Code extension
cd ../extension && npm install && npm run compile
# Then press F5 in VS Code to launch the Extension Development Host
```

## Project Structure

```
ConflictLens/
  docs/                  PRD, Architecture, and Tech Stack documentation
  extension/             VS Code extension (TypeScript, VS Code Extension API)
  backend/
    src/
      semantic/          Git & Semantic Analysis Engine (Track 1)
      security/          Security Scanning + Risk Scoring (Track 2)
      ai/                AI Explanation Layer — Gemini integration (Track 4)
      schema/            Shared JSON contract types + validators
  dashboard/             React webview dashboard (Track 5)
  shared/                Cross-module shared types
```

## Team Roles

| Track | Role | Branch |
|-------|------|--------|
| 1 | Git & Semantic/AST Analysis | `feature/semantic-analysis` |
| 2 | Security Scan + Risk Scoring | `feature/security-risk-engine` |
| 3 | VS Code Extension + Diagnostics | `feature/vscode-extension` |
| 4 | Backend API + AI Explanation | `feature/ai-explanation-layer` |
| 5 | Dashboard (React) + Integration/QA | `feature/dashboard-integration` |

## Documentation

- [Product Requirements Document (PRD)](docs/PRD.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Technology Stack](docs/TECHSTACK.md)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | TypeScript, VS Code Extension API |
| Git integration | `simple-git` |
| AST parsing | `@babel/parser` / `@babel/traverse` |
| Security scanning | Custom regex/pattern rules engine |
| Backend API | Node.js + Express |
| AI Explanation | Google Gemini API (`gemini-flash-latest`) |
| Dashboard | React webview |

## License

MIT
