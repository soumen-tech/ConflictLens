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

// ─── Canonical Internal Types (Architecture.md §3) ───────────────────────────
// These are the shapes that diagnostics.ts consumes — do not change them
// without also updating diagnostics.ts.

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskType  = 'semantic_conflict' | 'security_risk';

export interface RiskLocation {
  /** Workspace-relative path, e.g. "src/cart.js" */
  file: string;
  /** 1-indexed line number */
  line: number;
}

export interface SemanticConflictDetails {
  functionName: string;
  changeType: string;
  affectedFiles: string[];
}

export interface SecurityRiskDetails {
  category: string;
  redactedPreview?: string;
}

export interface AiContext {
  explanation: string;
  recommendation: string;
}

export interface Risk {
  id: string;
  type: RiskType;
  riskLevel: RiskLevel;
  location: RiskLocation;
  details: SemanticConflictDetails | SecurityRiskDetails;
  ai_context: AiContext;
}

export interface AnalysisResult {
  analysis_id: string;
  timestamp: string;
  risks: Risk[];
}

// ─── Raw API Response Types ───────────────────────────────────────────────────
// Two possible shapes come from the team's parallel development tracks.
// normalizeApiResponse() maps both into AnalysisResult so diagnostics.ts
// never has to care which format arrived.

/**
 * Architecture.md §3 format — preferred, what we expect Members 1 & 2 to ship.
 * Identical to AnalysisResult; typed separately so the normalizer can discriminate.
 */
interface ArchSchemaResponse {
  analysis_id: string;
  timestamp: string;
  risks: Risk[];
}

/**
 * PRD §9 early-draft flat format — risks have a top-level `file` field
 * instead of a nested `location`, and `aiExplanation` instead of `ai_context`.
 * Support this defensively in case Members 1 & 2 followed the PRD draft rather
 * than Architecture.md. Delete once schemas are confirmed unified.
 */
interface PrdFlatRisk {
  id?: string;
  type?: string;
  file?: string;
  riskLevel?: string;
  line?: number;
  details?: Record<string, unknown>;
  aiExplanation?: string;
}

interface PrdFlatResponse {
  risks: PrdFlatRisk[];
}

type RawApiResponse = ArchSchemaResponse | PrdFlatResponse | Record<string, unknown>;

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

// ─── Schema Normalizer ────────────────────────────────────────────────────────

/**
 * Maps whatever the real API returns into the canonical AnalysisResult shape.
 *
 * Handles:
 *   • Architecture.md §3 format (preferred)
 *   • PRD §9 flat format (defensive fallback)
 *
 * Throws ApiMalformedError if neither format can be detected.
 *
 * TODO: delete this function once Members 1 & 2 confirm they output
 *       Architecture.md format — at that point the cast on line ~220 is enough.
 */
function normalizeApiResponse(raw: RawApiResponse): AnalysisResult {
  if (!raw || typeof raw !== 'object') {
    throw new ApiMalformedError('response was not a JSON object');
  }

  // ── Architecture.md §3 format ─────────────────────────────────────────────
  // Detect by: has analysis_id AND risks[0] has a `location` sub-object.
  if (
    'analysis_id' in raw &&
    Array.isArray((raw as ArchSchemaResponse).risks) &&
    (
      (raw as ArchSchemaResponse).risks.length === 0 ||
      'location' in (raw as ArchSchemaResponse).risks[0]
    )
  ) {
    return raw as AnalysisResult;
  }

  // ── PRD §9 flat format ────────────────────────────────────────────────────
  // Detect by: has risks array, risks[0] has a top-level `file` field (not nested).
  if ('risks' in raw && Array.isArray((raw as PrdFlatResponse).risks)) {
    const prd = raw as PrdFlatResponse;
    return {
      analysis_id: `api_${Date.now()}`,
      timestamp: new Date().toISOString(),
      risks: prd.risks.map((r, i): Risk => {
        const validTypes: RiskType[] = ['semantic_conflict', 'security_risk'];
        const validLevels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

        return {
          id: r.id ?? `risk_${i}`,
          type: validTypes.includes(r.type as RiskType)
            ? (r.type as RiskType)
            : 'semantic_conflict',
          riskLevel: validLevels.includes(r.riskLevel as RiskLevel)
            ? (r.riskLevel as RiskLevel)
            : 'medium',
          location: {
            file: r.file ?? 'unknown',
            line: r.line ?? ((r.details?.line as number | undefined) ?? 1),
          },
          details: (r.details ?? {}) as unknown as SemanticConflictDetails | SecurityRiskDetails,
          ai_context: {
            explanation:    r.aiExplanation ?? 'Pending AI response...',
            recommendation: 'Pending AI response...',
          },
        };
      }),
    };
  }

  throw new ApiMalformedError('response matched neither Architecture.md nor PRD §9 schema');
}

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

  return normalizeApiResponse(raw as RawApiResponse);
}
