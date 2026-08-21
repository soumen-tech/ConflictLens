# ConflictLens — Technology Stack

This document details the software development technologies, frameworks, and libraries selected to build ConflictLens. The stack prioritizes open-source tools and free-tier services to ensure zero hosting/operating costs for development and demo environments.

## 1. Extension (Frontend Client)

- **Language**: TypeScript (v5.x+)
  - _Why_: Provides static typing and IDE validation, reducing integration errors across parallel tracks.
- **Framework**: VS Code Extension API
  - _Why_: The standard framework to construct widgets, handle workspace diagnostics, execute shell scripts, and manage state in VS Code.
- **UI Framework**: React (v18.x+)
  - _Why_: Rendered inside the extension's Webview panel for a modern, responsive developer dashboard.

## 2. Core Analysis Engine (Local Backend)

- **Runtime Environment**: Node.js (v20.x+)
  - _Why_: Enables sharing parser logic and types between frontend extension and backend analyzer.
- **API Framework**: Express
  - _Why_: Lightweight server to host the local analysis API that the VS Code extension queries.
- **Git Integration**: `simple-git`
  - _Why_: A clean wrapper around the native `git` CLI, letting us run diffs, fetch branch references, and query logs programmatically.
- **AST Parsing**: `@babel/parser` & `@babel/traverse` (for JS/TS)
  - _Why_: Used to parse files into Abstract Syntax Trees (AST) to map changes to function signatures, classes, and call sites.

## 3. Security Scanning

- **Pattern Scanner**: Custom Regex-based Scanner
  - _Why_: Lightweight, immediate scanning of diffs for API keys, passwords, and tokens.
- **Vulnerability Detection**: Simple security rules engine
  - _Why_: Checks for unsafe code blocks (e.g., input to `eval()`, string interpolation in database commands, raw shell execution wrappers).

## 4. AI Explanation & Remediation Layer

- **AI Provider**: Google Gemini API (Free Tier)
- **Model**: Gemma 4 (`gemma-4-26b-a4b-it`)
  - _Why_: Offers a generous free tier (with high rate limits suitable for development), low latency, and excellent capability at explaining code structures and recommending secure code changes.
- **SDK**: `@google/generative-ai`
  - _Why_: The official client SDK to interact with Google's generative models securely.

## 5. Storage

- **Session State**: In-memory / local JSON configuration files
  - _Why_: Eliminates database hosting costs and complex database sync configurations. All tracking is managed relative to the user's local workspace.
