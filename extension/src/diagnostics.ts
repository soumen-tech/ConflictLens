/**
 * diagnostics.ts
 *
 * Owns all VS Code Diagnostics API interaction.
 * No analysis logic lives here — it only translates AnalysisResult → Diagnostics.
 */

import * as vscode from 'vscode';
import {
  AnalysisResult,
  Risk,
  RiskLevel,
  SemanticConflictDetails,
  SecurityRiskDetails,
} from './analyzerClient';

const DIAGNOSTIC_SOURCE = 'ConflictLens';

// ─── Severity Mapping ─────────────────────────────────────────────────────────

/**
 * Maps the Architecture.md riskLevel to a VS Code DiagnosticSeverity.
 *   critical / high  →  Error   (red squiggle)
 *   medium           →  Warning (yellow squiggle)
 *   low              →  Information (blue squiggle)
 */
function mapSeverity(riskLevel: RiskLevel): vscode.DiagnosticSeverity {
  switch (riskLevel) {
    case 'critical':
    case 'high':
      return vscode.DiagnosticSeverity.Error;
    case 'medium':
      return vscode.DiagnosticSeverity.Warning;
    case 'low':
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

// ─── Message Builder ──────────────────────────────────────────────────────────

/**
 * Builds the human-readable diagnostic message shown in the Problems panel
 * and on hover in the editor.
 *
 * Format: [ConflictLens] <Title> — <AI explanation>
 *
 * "Title" is derived from the details block:
 *   • semantic_conflict → functionName
 *   • security_risk     → category
 *   • fallback          → risk type string
 */
function buildMessage(risk: Risk): string {
  let title: string;

  if (risk.type === 'semantic_conflict') {
    const d = risk.details as SemanticConflictDetails;
    title = d.functionName ?? risk.type;
  } else {
    const d = risk.details as SecurityRiskDetails;
    title = d.category ?? risk.type;
  }

  return `[ConflictLens] ${title} — ${risk.ai_context.explanation}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates the DiagnosticCollection that persists for the extension's lifetime.
 * Call once during activation and store the result in context.subscriptions.
 */
export function createDiagnosticCollection(): vscode.DiagnosticCollection {
  return vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
}

/**
 * Clears and repopulates the diagnostic collection from a fresh AnalysisResult.
 *
 * Graceful-skip rules:
 *   • No workspace open → logs a warning, returns cleanly.
 *   • Risk file not found in workspace → logs a warning, skips that risk.
 *   • Never throws — any unexpected error is caught and logged.
 */
export async function applyDiagnostics(
  collection: vscode.DiagnosticCollection,
  result: AnalysisResult
): Promise<void> {
  collection.clear();

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.warn('[ConflictLens] No workspace folder open — diagnostics skipped.');
    return;
  }

  // Use the first workspace root; multi-root support can be added in Phase 2.
  const workspaceRoot = workspaceFolders[0].uri;

  // Accumulate diagnostics keyed by absolute URI string so we can batch-set them.
  const diagnosticMap = new Map<string, vscode.Diagnostic[]>();

  for (const risk of result.risks) {
    try {
      await processRisk(risk, workspaceRoot, diagnosticMap);
    } catch (err) {
      // Never let a single bad risk crash the whole render pass.
      console.error(`[ConflictLens] Failed to process risk ${risk.id}:`, err);
    }
  }

  // Commit all accumulated diagnostics in one pass.
  for (const [uriString, diagnostics] of diagnosticMap) {
    collection.set(vscode.Uri.parse(uriString), diagnostics);
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function processRisk(
  risk: Risk,
  workspaceRoot: vscode.Uri,
  diagnosticMap: Map<string, vscode.Diagnostic[]>
): Promise<void> {
  const { file, line } = risk.location;
  const absoluteUri = vscode.Uri.joinPath(workspaceRoot, file);

  // Verify the file actually exists before attaching a diagnostic.
  try {
    await vscode.workspace.fs.stat(absoluteUri);
  } catch {
    console.warn(`[ConflictLens] Skipping risk "${risk.id}" — file not found in workspace: ${file}`);
    return;
  }

  // The schema uses 1-indexed lines; VS Code Ranges are 0-indexed.
  const zeroBasedLine = Math.max(0, line - 1);
  // Span the entire line so the squiggle is always visible.
  const range = new vscode.Range(zeroBasedLine, 0, zeroBasedLine, Number.MAX_SAFE_INTEGER);

  const diagnostic = new vscode.Diagnostic(range, buildMessage(risk), mapSeverity(risk.riskLevel));
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = risk.id; // Links to the risk ID in the Problems panel

  const key = absoluteUri.toString();
  const existing = diagnosticMap.get(key) ?? [];
  existing.push(diagnostic);
  diagnosticMap.set(key, existing);
}
