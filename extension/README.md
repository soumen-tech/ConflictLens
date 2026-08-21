# ConflictLens

**AI-powered semantic Git conflict and security risk detection — flags issues before merge.**

---

## 🔍 What is ConflictLens?

ConflictLens is an intelligent developer assistant for VS Code that catches breaking Git merge conflicts and critical security risks in real time **before code is committed or merged**.

### Key Features
* **🔀 Pre-Merge Conflict Prediction**: Non-destructive `git merge-tree` simulations predict merge conflicts before you run `git merge`.
* **🧩 Semantic Breakage Analysis**: Identifies altered function signatures, broken call-sites, and cross-file dependencies.
* **🛡️ Security & Secret Scanner**: Automatically detects leaked credentials (AWS, GitHub, Slack, DB strings, JWTs) and redacts them in previews.
* **💉 Code Injection Detection**: Catches SQL Injection, Command Injection, and unsafe dynamic execution (`eval`).
* **🤖 Gemini AI Remediation**: Explains conflicts and vulnerabilities in plain English with actionable fix recommendations.
* **📊 Interactive Visual Dashboard**: Project health scores, risk rankings, and in-editor diagnostic squiggles.

---

## 🚀 Quick Start

1. Open your project folder in VS Code.
2. Open the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS).
3. Run:
   ```
   ConflictLens: Open Dashboard
   ```
4. Click **Scan Now** (or run `ConflictLens: Scan Now`).

---

## ⚙️ Configuration

Access settings via **Settings (`Ctrl+,`)** → Search `ConflictLens`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `conflictlens.autoScan` | boolean | `false` | Automatically scan for risks when a file is saved |
| `conflictlens.apiEndpoint` | string | `http://localhost:3000/analyze` | URL of the local analysis engine |
| `conflictlens.apiTimeoutMs` | number | `8000` | Maximum request timeout in milliseconds |
| `conflictlens.geminiApiKey` | string | `""` | Optional Google Gemini API key for AI-enriched explanations |

---

## 📄 License

MIT © ConflictLens Team (ctrl-future)
