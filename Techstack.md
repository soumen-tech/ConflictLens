# TECH STACK: CodeGuard
## AI-Powered Git Conflict & Security Intelligence Platform

This document outlines the selected technologies for CodeGuard, optimized for a fast-paced 3-person hackathon build. The stack leverages a unified JavaScript/TypeScript ecosystem to maximize code reuse, simplify the architecture, and ensure seamless local execution.

---

## 1. Extension & Client-Side (Frontend)
The user-facing components reside entirely within Visual Studio Code.

* **Core Extension API:** `TypeScript` + `VS Code Extension API`
  * Provides the foundational hooks for file saves, Git commit triggers, and inline editor decorations (Diagnostics API).
* **Dashboard Webview:** `React.js` 
  * A React application running inside a VS Code webview. This allows for rapid UI development of the risk overview dashboard, utilizing a familiar component-based architecture.
* **Webview Bundler:** `Vite`
  * Extremely fast HMR (Hot Module Replacement) and optimized build process for compiling the React webview into a single self-contained bundle required by VS Code.
* **Styling:** `Tailwind CSS`
  * Utility-first CSS for rapid styling of the dashboard without context switching or managing external stylesheets.

## 2. Analysis Engine (Backend & Core Logic)
A lightweight local API layer handling the heavy lifting of AST parsing and Git diffs.

* **Runtime & Framework:** `Node.js` + `Express.js`
  * A local Express server acts as the central hub. It accepts analysis requests from the VS Code extension and processes them. This leverages a familiar backend architecture (similar to standard full-stack development patterns) while running entirely locally on the developer's machine.
* **Git Integration:** `simple-git`
  * A lightweight Node.js wrapper for parsing working tree and branch diffs directly from the local `.git` folder.
* **Semantic Analysis (AST):** 
  * `@babel/parser`: For traversing and extracting function signatures, imports, and exports in JavaScript codebases.
  * `typescript` Compiler API: For handling TS-specific type definitions and complex interfaces.
* **Security Scanning:** 
  * `Custom Regex Rules Engine`: Fast, pattern-based matching for hardcoded secrets and basic injection vulnerabilities.

## 3. Artificial Intelligence Layer
* **LLM Provider:** `Anthropic Claude API (Claude 3.5 Sonnet)`
  * Accessed via `/v1/messages`. Chosen for its superior capability in code reasoning and generating concise, plain-English explanations for complex architectural and security risks.

## 4. Local Development & Environment Setup
To ensure consistency across the team and handle local file system operations (like executing git processes) flawlessly:
* **Environment:** Windows Subsystem for Linux (WSL) is highly recommended for developers on Windows machines. It provides native execution of Git commands, seamless Node.js performance, and avoids pathing conflicts when the engine analyzes local repositories.
* **Package Manager:** `npm` or `pnpm` (for faster dependency resolution during the hackathon).
