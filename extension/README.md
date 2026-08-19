# ConflictLens — VS Code Extension

AI-powered semantic conflict and security risk detection. Flags issues *before* they reach the merge stage.

---

## Phase 1 — Minimal Working Extension

This phase wires together the full Scan Now → Diagnostics pipeline using mock risk data. Real analysis API integration follows in Phase 2.

### Features (Phase 1)
- **`ConflictLens: Scan Now`** command — runs from the Command Palette
- Inline VS Code Diagnostics (Problems panel + editor squiggles) for each detected risk
- Severity mapping: `critical`/`high` → Error · `medium` → Warning · `low` → Information
- Risk count notification after every scan
- File-save scaffolding (disabled by default, enabled via `codeguard.autoScan`)

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [VS Code](https://code.visualstudio.com/) 1.85 or later

---

## Install & Build

Open a terminal inside the `extension/` directory, then:

```bash
# 1. Install dependencies
npm install

# 2. Compile TypeScript → ./out/
npm run compile
```

To recompile automatically on every file change (useful during development):

```bash
npm run watch
```

---

## Launching the Extension Development Host (F5)

1. Open the `extension/` folder **directly** in VS Code:
   ```
   File → Open Folder → ConflictLens/extension
   ```
2. Press **F5** (or **Run → Start Debugging**).
3. A new VS Code window titled **[Extension Development Host]** opens with ConflictLens installed.

> `launch.json` and `tasks.json` (inside `.vscode/`) handle compilation and launch automatically — no manual steps needed.

---

## Running a Scan

Inside the Extension Development Host window:

1. Open any folder as a workspace (**File → Open Folder**).
2. Open the Command Palette: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS).
3. Type **`ConflictLens: Scan Now`** and press Enter.
4. A notification appears: `ConflictLens found 1 risk.`
5. Open the **Problems** panel (`Ctrl+Shift+M`) to see the diagnostic.

---

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `codeguard.autoScan` | boolean | `false` | Scan automatically on every file save |

Change via **File → Preferences → Settings** → search `codeguard`.

---

## Project Structure

```
extension/
├── src/
│   ├── extension.ts       # Activation, command registration, save listener
│   ├── analyzerClient.ts  # Risk data fetch (mock Phase 1 → real API Phase 2)
│   └── diagnostics.ts     # VS Code Diagnostics API rendering
├── out/                   # Compiled JS (generated, not committed)
├── .vscode/
│   ├── launch.json        # F5 launch config
│   └── tasks.json         # Default build task
├── package.json
├── tsconfig.json
└── README.md
```

---

## Roadmap

| Phase | Feature |
|---|---|
| **Phase 1** ✅ | Mock data → Diagnostics pipeline |
| **Phase 2** | Real local analysis API (Members 1 & 2 Express server) |
| **Phase 3** | Gemini AI explanation layer + React dashboard webview |
