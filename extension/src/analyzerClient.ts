/**
 * analyzerClient.ts
 *
 * Owns the analysis request/response cycle — no VS Code UI code lives here.
 *
 * Phase 1: returned hardcoded mock data unconditionally.
 * Phase 2: calls the real local analysis API when `conflictlens.apiEndpoint`
 *           is set; falls back to mock when the setting is empty/unset so the
 *           UI pipeline can be tested without Members 1 & 2's service running.
 *
 * To swap in a real API later: set `conflictlens.apiEndpoint` in VS Code Settings.
 * Nothing outside this file needs to change.
 */

import * as vscode from 'vscode';

import {
  Risk,
  AnalysisResult,
  RiskLevel,
  RiskType,
  SemanticConflictDetails,
  SecurityRiskDetails,
} from '@codeguard/shared';

export {
  Risk,
  AnalysisResult,
  RiskLevel,
  RiskType,
  SemanticConflictDetails,
  SecurityRiskDetails,
};

// ─── Custom Error Types ───────────────────────────────────────────────────────
// Extension.ts catches these to show the right notification and decide
// whether to wipe diagnostics or leave the last-known state in place.

export class ApiUnavailableError extends Error {
  constructor(cause: string) {
    super(`ConflictLens: analysis service unavailable — is it running? (${cause})`);
    this.name = 'ApiUnavailableError';
  }
}

export class ApiTimeoutError extends Error {
  constructor(ms: number, endpoint: string) {
    super(`ConflictLens: request to ${endpoint} timed out after ${ms}ms`);
    this.name = 'ApiTimeoutError';
  }
}

export class ApiMalformedError extends Error {
  constructor(detail: string) {
    super(`ConflictLens: couldn't parse analysis results (${detail})`);
    this.name = 'ApiMalformedError';
  }
}

// ─── Mock Data (Phase 1 — kept for offline / UI dev) ─────────────────────────

const BASE_MOCK: AnalysisResult = {
  analysis_id: 'mock_001',
  timestamp: '',           // filled in at call time
  risks: [
    {
      id: 'risk_001',
      type: 'semantic_conflict',
      riskLevel: 'high',
      location: { file: 'src/cart.js', line: 42 },
      details: {
        functionName: 'calculateTotal',
        changeType: 'signature_parameter_added',
        affectedFiles: ['src/cart.js', 'src/checkout.js'],
      } as SemanticConflictDetails,
      ai_context: {
        explanation: 'Pending AI response...',
        recommendation: 'Pending AI response...',
      },
    },
  ],
};

/**
 * Returns a fresh copy of the mock result with a current timestamp.
 * Exported so tests and dev sessions can exercise the full diagnostic pipeline
 * without needing Members 1 & 2's service to be running.
 *
 * To activate mock mode: leave `conflictlens.apiEndpoint` empty in Settings.
 */
export function getMockResult(): AnalysisResult {
  return { ...BASE_MOCK, timestamp: new Date().toISOString() };
}

// Schema Normalizer deleted as contracts are unified.

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Requests a full risk analysis for the current workspace.
 *
 * Decision tree:
 *   conflictlens.apiEndpoint empty → mock data (dev/offline mode, no network call)
 *   conflictlens.apiEndpoint set   → POST to the local analysis API
 *
 * On failure, throws one of:
 *   ApiUnavailableError — service unreachable (ECONNREFUSED, DNS failure, etc.)
 *   ApiTimeoutError     — request exceeded conflictlens.apiTimeoutMs
 *   ApiMalformedError   — service responded but with unexpected / non-JSON data
 *
 * Extension.ts catches these and handles notifications; it does NOT wipe
 * diagnostics on failure so the last-known state stays visible.
 */
export async function analyzeProject(): Promise<AnalysisResult> {
  const config    = vscode.workspace.getConfiguration();
  const endpoint  = config.get<string>('conflictlens.apiEndpoint', '').trim();
  const timeoutMs = config.get<number>('conflictlens.apiTimeoutMs', 8000);

  // ── Mock path (offline / dev mode) ────────────────────────────────────────
  if (!endpoint) {
    console.log('[ConflictLens] apiEndpoint not configured — returning mock data.');
    return getMockResult();
  }

  // ── Real API path ─────────────────────────────────────────────────────────
  console.log(`[ConflictLens] Calling analysis API: POST ${endpoint} (timeout: ${timeoutMs}ms)`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    const isTimeout =
      err instanceof Error && (err.name === 'AbortError' || err.message.includes('timeout'));

    if (isTimeout) {
      throw new ApiTimeoutError(timeoutMs, endpoint);
    }
    throw new ApiUnavailableError(String(err));
  } finally {
    clearTimeout(timer);
  }

  // Parse JSON — a non-JSON body (e.g. HTML 502 page) would throw here.
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ApiMalformedError(`HTTP ${response.status} — response body was not valid JSON`);
  }

  return raw as AnalysisResult;
}
