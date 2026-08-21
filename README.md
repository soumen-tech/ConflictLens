<div align="center">

# 🔍 ConflictLens

### Predict merge conflicts and security risks **before they reach the merge stage.**

<p>
  <img src="https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="VS Code"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/Google%20Gemini-AI-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License"/>
</p>

<p>
  <a href="https://github.com/soumen-tech/ConflictLens">
    <img src="https://img.shields.io/github/stars/soumen-tech/ConflictLens?style=flat-square" alt="GitHub Stars"/>
  </a>
  <a href="https://github.com/soumen-tech/ConflictLens/issues">
    <img src="https://img.shields.io/github/issues/soumen-tech/ConflictLens?style=flat-square" alt="GitHub Issues"/>
  </a>
  <a href="https://github.com/soumen-tech/ConflictLens/network/members">
    <img src="https://img.shields.io/github/forks/soumen-tech/ConflictLens?style=flat-square" alt="GitHub Forks"/>
  </a>
</p>

</div>

---

## 🚨 The Problem

Traditional Git conflict detection mainly focuses on **textual conflicts**.

But code can be logically incompatible even when Git reports:

```text
No merge conflict
```

Two branches may modify related functions, dependencies, security-sensitive code, or application behavior without touching the exact same lines.

That's where **ConflictLens** comes in.

---

## 💡 What is ConflictLens?

**ConflictLens** is an AI-powered VS Code extension and backend system designed to identify **semantic merge risks and security issues before merging branches**.

Instead of waiting for a merge to fail, ConflictLens analyzes changes across Git branches and provides developers with:

* 🔀 Semantic conflict detection
* 🔑 Secret detection
* 🛡️ Injection-risk analysis
* 📊 Risk scoring
* 🤖 AI-powered explanations
* 🖥️ Inline VS Code diagnostics
* 📈 Visual risk dashboard

> **"Don't wait for the merge to reveal the problem. ConflictLens predicts it before it happens."**

---

# ✨ Core Features

<table>
<tr>
<td width="50%">

### 🔀 Semantic Conflict Detection

Analyze changes beyond simple line-by-line differences.

* AST-level analysis
* Function signature tracking
* Cross-file dependency analysis
* Potential semantic breakage detection

</td>

<td width="50%">

### 🔐 Security Scanning

Detect potentially dangerous code patterns before they become part of a merged codebase.

* API keys
* Tokens
* Credentials
* Connection strings
* Security-sensitive patterns

</td>
</tr>

<tr>
<td width="50%">

### 🛡️ Injection Analysis

Identify potentially dangerous patterns such as:

* SQL injection
* Command injection
* Unsafe `eval`
* Unsafe input handling

</td>

<td width="50%">

### 📊 Risk Scoring

Convert detected issues into an easy-to-understand risk level:

`LOW` → `MEDIUM` → `HIGH` → `CRITICAL`

</td>
</tr>

<tr>
<td width="50%">

### 🤖 AI Explanations

Use the Gemini API to generate:

* Plain-English explanations
* Risk summaries
* Recommended fixes
* Developer-friendly context

</td>

<td width="50%">

### 🖥️ VS Code Integration

Get warnings directly inside your development environment using:

* Diagnostics API
* Inline warnings
* Squiggly underlines
* Hover information

</td>
</tr>
</table>

---

# 🏗️ Architecture

```text
                         ┌───────────────────────┐
                         │       Developer       │
                         │       VS Code         │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │   ConflictLens        │
                         │   VS Code Extension   │
                         └───────────┬───────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │          Backend API             │
                    │       Node.js + Express          │
                    └───────────────┬─────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
     │ Git & Semantic  │   │ Security Engine │   │  AI Explanation │
     │ Analysis Engine │   │                 │   │     Gemini      │
     └─────────────────┘   └─────────────────┘   └─────────────────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    ▼
                         ┌───────────────────────┐
                         │   Risk Analysis       │
                         │   & Recommendations   │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │   React Dashboard     │
                         │   Risk Visualization  │
                         └───────────────────────┘
```

---

# 🧠 How It Works

### 1️⃣ Analyze Git Changes

ConflictLens examines changes between branches using Git integration.

### 2️⃣ Understand Code Structure

The semantic analysis layer tracks functions, signatures, and dependencies rather than relying only on textual differences.

### 3️⃣ Scan for Security Risks

The security engine searches for sensitive credentials and potentially dangerous code patterns.

### 4️⃣ Calculate Risk

Detected issues are classified according to their severity.

### 5️⃣ Explain the Problem

The AI layer converts technical findings into understandable explanations and recommendations.

### 6️⃣ Show Results

Developers receive feedback directly inside VS Code and through the dashboard.

---

# 🛠️ Tech Stack

| Layer                | Technology                         |
| -------------------- | ---------------------------------- |
| 🧩 VS Code Extension | TypeScript + VS Code Extension API |
| 🔀 Git Integration   | simple-git                         |
| 🌳 AST Analysis      | @babel/parser + @babel/traverse    |
| 🔐 Security Scanner  | Custom pattern/rule engine         |
| ⚙️ Backend           | Node.js + Express                  |
| 🤖 AI                | Google Gemini API                  |
| 📊 Dashboard         | React Webview                      |
| 📦 Shared Types      | TypeScript                         |
| 📚 Documentation     | Markdown                           |

---

# 📁 Project Structure

```text
ConflictLens/
│
├── 📁 docs/
│   ├── PRD
│   ├── Architecture
│   └── Technology Stack
│
├── 📁 extension/
│   └── VS Code Extension
│
├── 📁 backend/
│   └── src/
│       ├── semantic/
│       │   └── Git & Semantic Analysis
│       │
│       ├── security/
│       │   └── Security Scanning & Risk Scoring
│       │
│       ├── ai/
│       │   └── Gemini AI Explanation Layer
│       │
│       └── schema/
│           └── Shared Types & Validators
│
├── 📁 dashboard/
│   └── React Webview Dashboard
│
├── 📁 packages/
│   └── git-engine/
│
├── 📁 shared/
│   └── Cross-module Types
│
├── 📄 package.json
├── 📄 package-lock.json
└── 📄 README.md
```

---

# ⚡ Quick Start

## 1. Clone the Repository

```bash
git clone https://github.com/soumen-tech/ConflictLens.git
cd ConflictLens
```

## 2. Install Backend Dependencies

```bash
cd backend
npm install
```

## 3. Run the Security Scanner

```bash
npm run scan:security -- <path-to-diff-file>
```

## 4. Start the Backend

```bash
npm run dev
```

## 5. Build the VS Code Extension

```bash
cd ../extension
npm install
npm run compile
```

Then press:

```text
F5
```

inside VS Code to launch the Extension Development Host.

---

# 🔬 Example Risk Flow

```text
Developer changes code
        │
        ▼
Git branch analysis
        │
        ▼
Semantic dependency analysis
        │
        ├───────────────┐
        ▼               ▼
Potential conflict   Security risk
        │               │
        └───────┬───────┘
                ▼
          Risk Scoring
                │
                ▼
        AI Explanation
                │
                ▼
       Developer Warning
                │
                ▼
       Fix Before Merge
```

---

# 👥 Development Tracks

| Track | Area                    | Focus                              |
| ----- | ----------------------- | ---------------------------------- |
| 01    | Git & Semantic Analysis | AST + dependency analysis          |
| 02    | Security Engine         | Security scanning + risk scoring   |
| 03    | VS Code Extension       | Diagnostics + developer experience |
| 04    | Backend + AI            | API + Gemini integration           |
| 05    | Dashboard               | React UI + integration + QA        |

---

# 📚 Documentation

The project includes documentation covering:

* 📋 Product Requirements
* 🏗️ System Architecture
* 🧰 Technology Stack

Explore the `docs/` directory for the detailed project documentation.

---

# 🔮 Vision

ConflictLens aims to move Git conflict detection from:

```text
"Will Git be able to merge these files?"
```

to:

```text
"Will these changes still work correctly after they are merged?"
```

The goal is to give developers **early visibility into semantic conflicts, security risks, and potentially dangerous changes** before they become expensive problems.

---

# 🤝 Contributing

Contributions, ideas, bug reports, and improvements are welcome.

```bash
# Fork the repository

# Create a feature branch
git checkout -b feature/your-feature

# Make your changes

# Commit
git commit -m "feat: add your feature"

# Push
git push origin feature/your-feature

# Open a Pull Request
```

---

# 📄 License

This project is licensed under the **MIT License**.

---

<div align="center">

### 🔍 Detect Early. Understand Better. Merge Safer.

<br>

**ConflictLens**

<p>
  <a href="https://github.com/soumen-tech/ConflictLens">GitHub Repository</a>
  •
  <a href="https://github.com/soumen-tech/ConflictLens/issues">Issues</a>
  •
  <a href="https://github.com/soumen-tech/ConflictLens/pulls">Pull Requests</a>
</p>

⭐ If you find the project interesting, consider giving it a star.

</div>
