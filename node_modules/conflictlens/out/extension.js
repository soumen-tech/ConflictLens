"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const analyzerClient_1 = require("./analyzerClient");
const diagnostics_1 = require("./diagnostics");
const geminiClient_1 = require("./geminiClient");
const dashboardPanel_1 = require("./dashboardPanel");
function activate(context) {
    console.log('[ConflictLens] Extension activated (Phase 3).');
    const diagnosticCollection = (0, diagnostics_1.createDiagnosticCollection)();
    context.subscriptions.push(diagnosticCollection);
    // ── Command: ConflictLens: Scan Now ────────────────────────────────────────
    const scanCommand = vscode.commands.registerCommand('conflictlens.scanNow', async () => {
        await runScan(diagnosticCollection, context.extensionUri);
    });
    context.subscriptions.push(scanCommand);
    // ── Command: ConflictLens: Open Dashboard ──────────────────────────────────
    const dashboardCommand = vscode.commands.registerCommand('conflictlens.openDashboard', () => {
        dashboardPanel_1.DashboardPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(dashboardCommand);
    // ── File-save listener (debounced, gated by codeguard.autoScan) ───────────
    let debounceTimer;
    const DEBOUNCE_MS = 2000;
    const saveListener = vscode.workspace.onDidSaveTextDocument(async () => {
        const config = vscode.workspace.getConfiguration();
        if (!config.get('codeguard.autoScan', false)) {
            return;
        }
        if (debounceTimer !== undefined) {
            clearTimeout(debounceTimer);
        }
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
async function runScan(diagnosticCollection, extensionUri) {
    try {
        // ── Step 1–3: Analysis + immediate display ─────────────────────────────
        const rawResult = await (0, analyzerClient_1.analyzeProject)();
        await (0, diagnostics_1.applyDiagnostics)(diagnosticCollection, rawResult);
        const count = rawResult.risks.length;
        const label = count === 1 ? 'risk' : 'risks';
        // Open dashboard automatically on first use; update it on subsequent scans.
        dashboardPanel_1.DashboardPanel.createOrShow(extensionUri);
        dashboardPanel_1.DashboardPanel.update(rawResult);
        if (count === 0) {
            vscode.window.showInformationMessage('ConflictLens found 0 risks. ✅');
            return;
        }
        vscode.window.showWarningMessage(`ConflictLens found ${count} ${label}.`);
        // ── Step 4–6: AI enrichment (non-blocking for the notification) ─────────
        // enrichWithAI gracefully no-ops if the key is missing or Gemini fails.
        const enrichedResult = await (0, geminiClient_1.enrichWithAI)(rawResult);
        await (0, diagnostics_1.applyDiagnostics)(diagnosticCollection, enrichedResult);
        dashboardPanel_1.DashboardPanel.update(enrichedResult);
    }
    catch (error) {
        // ── Analysis API errors — keep previous diagnostics ────────────────────
        if (error instanceof analyzerClient_1.ApiUnavailableError || error instanceof analyzerClient_1.ApiTimeoutError) {
            const msg = error instanceof analyzerClient_1.ApiTimeoutError
                ? 'ConflictLens: analysis timed out — try again or increase conflictlens.apiTimeoutMs.'
                : 'ConflictLens: analysis service unavailable — is it running?';
            console.error(`[ConflictLens] ${error.name}:`, error.message);
            vscode.window.showWarningMessage(msg);
            return;
        }
        if (error instanceof analyzerClient_1.ApiMalformedError) {
            console.error('[ConflictLens] ApiMalformedError:', error.message);
            vscode.window.showErrorMessage("ConflictLens: couldn't parse analysis results — check the Output panel.");
            return;
        }
        console.error('[ConflictLens] Unexpected scan error:', error);
        vscode.window.showErrorMessage('ConflictLens: scan failed unexpectedly. Check the Output panel.');
    }
}
function deactivate() {
    // All disposables managed via context.subscriptions.
}
//# sourceMappingURL=extension.js.map