/**
 * extension.ts — Activation entry point.
 *
 * Responsibilities (only these — nothing else):
 *   1. Create long-lived resources (DiagnosticCollection).
 *   2. Register the "conflictlens.scanNow" command.
 *   3. Wire up the file-save listener (gated; inactive by default).
 *   4. Push everything into context.subscriptions for automatic cleanup.
 *
 * No analysis logic. No diagnostic rendering. Those live in their own modules.
 */

import * as vscode from 'vscode';
import { analyzeProject } from './analyzerClient';
import { createDiagnosticCollection, applyDiagnostics } from './diagnostics';

export function activate(context: vscode.ExtensionContext): void {
  console.log('[ConflictLens] Extension activated.');

  // DiagnosticCollection persists across scans — cleared and repopulated each time.
  const diagnosticCollection = createDiagnosticCollection();
  context.subscriptions.push(diagnosticCollection);

  // ── Command: ConflictLens: Scan Now ────────────────────────────────────────
  const scanCommand = vscode.commands.registerCommand(
    'conflictlens.scanNow',
    async () => {
      await runScan(diagnosticCollection);
    }
  );
  context.subscriptions.push(scanCommand);

  // ── File-save scaffolding (inactive by default) ────────────────────────────
  // The listener is always registered so VS Code tracks it, but actual scanning
  // is gated behind `codeguard.autoScan`. Set that to true in Settings to enable.
  const saveListener = vscode.workspace.onDidSaveTextDocument(async () => {
    const config = vscode.workspace.getConfiguration();
    const autoScanEnabled = config.get<boolean>('codeguard.autoScan', false);

    if (autoScanEnabled) {
      await runScan(diagnosticCollection);
    }
  });
  context.subscriptions.push(saveListener);
}

// ── Core scan orchestration ────────────────────────────────────────────────────

/**
 * Runs a full analysis cycle:
 *   analyzeProject() → applyDiagnostics() → user notification
 *
 * Extracted as a standalone function so both the command and the save listener
 * share identical behaviour without duplication.
 */
async function runScan(diagnosticCollection: vscode.DiagnosticCollection): Promise<void> {
  try {
    const result = await analyzeProject();
    await applyDiagnostics(diagnosticCollection, result);

    const count = result.risks.length;
    const label = count === 1 ? 'risk' : 'risks';

    if (count === 0) {
      vscode.window.showInformationMessage(`ConflictLens found 0 risks. ✅`);
    } else {
      vscode.window.showWarningMessage(`ConflictLens found ${count} ${label}.`);
    }
  } catch (error) {
    // Never let a scan failure surface as an unhandled rejection.
    console.error('[ConflictLens] Scan failed:', error);
    vscode.window.showErrorMessage(
      'ConflictLens: Scan failed. Check the Output panel for details.'
    );
  }
}

export function deactivate(): void {
  // Intentionally empty — all disposables are managed via context.subscriptions.
}
