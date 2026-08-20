/**
 * extension.ts — Activation entry point.
 *
 * Responsibilities (only these — nothing else):
 *   1. Create long-lived resources (DiagnosticCollection).
 *   2. Register commands: scanNow, openDashboard.
 *   3. Wire up the file-save listener with debounce.
 *   4. Push everything into context.subscriptions for cleanup.
 *
 * Phase 3 additions:
 *   • After each scan, enrichWithAI() is called — diagnostics appear instantly,
 *     then update again once Gemini responds (~2-5 s).
 *   • Dashboard panel is opened automatically on first successful scan.
 */

import * as vscode from 'vscode';
import {
  analyzeProject,
  ApiUnavailableError,
  ApiTimeoutError,
  ApiMalformedError,
} from './analyzerClient';
import { applyDiagnostics, createDiagnosticCollection } from './diagnostics';
import { enrichWithAI } from './geminiClient';
import { DashboardPanel } from './dashboardPanel';

export function activate(context: vscode.ExtensionContext): void {
  console.log('[ConflictLens] Extension activated (Phase 3).');

  const diagnosticCollection = createDiagnosticCollection();
  context.subscriptions.push(diagnosticCollection);

  // ── Command: ConflictLens: Scan Now ────────────────────────────────────────
  const scanCommand = vscode.commands.registerCommand(
    'conflictlens.scanNow',
    async () => {
      await runScan(diagnosticCollection, context.extensionUri);
    }
  );
  context.subscriptions.push(scanCommand);

  // ── Command: ConflictLens: Open Dashboard ──────────────────────────────────
  const dashboardCommand = vscode.commands.registerCommand(
    'conflictlens.openDashboard',
    () => {
      DashboardPanel.createOrShow(context.extensionUri);
    }
  );
  context.subscriptions.push(dashboardCommand);

  // ── File-save listener (debounced, gated by codeguard.autoScan) ───────────
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const DEBOUNCE_MS = 2000;

  const saveListener = vscode.workspace.onDidSaveTextDocument(async () => {
    const config = vscode.workspace.getConfiguration();
    if (!config.get<boolean>('codeguard.autoScan', false)) { return; }

    if (debounceTimer !== undefined) { clearTimeout(debounceTimer); }

    debounceTimer = setTimeout(async () => {
      debounceTimer = undefined;
      await runScan(diagnosticCollection, context.extensionUri);
    }, DEBOUNCE_MS);
  });
  context.subscriptions.push(saveListener);
}

// ── Core scan orchestration ────────────────────────────────────────────────────

/**
 * Full scan pipeline:
 *   1. analyzeProject()     → raw risks (instant feedback)
 *   2. applyDiagnostics()   → show diagnostics immediately
 *   3. DashboardPanel.update() → show raw risks in dashboard
 *   4. enrichWithAI()       → Gemini call (async, ~2-5 s)
 *   5. applyDiagnostics()   → update diagnostics with AI text
 *   6. DashboardPanel.update() → update dashboard with AI text
 *
 * On analysis API failure: show notification, keep previous diagnostics.
 * On Gemini failure: keep diagnostics/dashboard with "Pending..." text (logged only).
 */
async function runScan(
  diagnosticCollection: vscode.DiagnosticCollection,
  extensionUri: vscode.Uri
): Promise<void> {
  try {
    // ── Step 1–3: Analysis + immediate display ─────────────────────────────
    const rawResult = await analyzeProject();
    await applyDiagnostics(diagnosticCollection, rawResult);

    const count = rawResult.risks.length;
    const label = count === 1 ? 'risk' : 'risks';

    // Open dashboard automatically on first use; update it on subsequent scans.
    DashboardPanel.createOrShow(extensionUri);
    DashboardPanel.update(rawResult);

    if (count === 0) {
      vscode.window.showInformationMessage('ConflictLens found 0 risks. ✅');
      return;
    }
    vscode.window.showWarningMessage(`ConflictLens found ${count} ${label}.`);

    // ── Step 4–6: AI enrichment (non-blocking for the notification) ─────────
    // enrichWithAI gracefully no-ops if the key is missing or Gemini fails.
    const enrichedResult = await enrichWithAI(rawResult);
    await applyDiagnostics(diagnosticCollection, enrichedResult);
    DashboardPanel.update(enrichedResult);

  } catch (error) {
    // ── Analysis API errors — keep previous diagnostics ────────────────────
    if (error instanceof ApiUnavailableError || error instanceof ApiTimeoutError) {
      const msg = error instanceof ApiTimeoutError
        ? 'ConflictLens: analysis timed out — try again or increase conflictlens.apiTimeoutMs.'
        : 'ConflictLens: analysis service unavailable — is it running?';
      console.error(`[ConflictLens] ${error.name}:`, error.message);
      vscode.window.showWarningMessage(msg);
      return;
    }

    if (error instanceof ApiMalformedError) {
      console.error('[ConflictLens] ApiMalformedError:', error.message);
      vscode.window.showErrorMessage(
        "ConflictLens: couldn't parse analysis results — check the Output panel."
      );
      return;
    }

    console.error('[ConflictLens] Unexpected scan error:', error);
    vscode.window.showErrorMessage(
      'ConflictLens: scan failed unexpectedly. Check the Output panel.'
    );
  }
}

export function deactivate(): void {
  // All disposables managed via context.subscriptions.
}
