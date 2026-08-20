"use strict";
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
exports.ApiMalformedError = exports.ApiTimeoutError = exports.ApiUnavailableError = void 0;
exports.getMockResult = getMockResult;
exports.analyzeProject = analyzeProject;
const vscode = __importStar(require("vscode"));
// ─── Custom Error Types ───────────────────────────────────────────────────────
// Extension.ts catches these to show the right notification and decide
// whether to wipe diagnostics or leave the last-known state in place.
class ApiUnavailableError extends Error {
    constructor(cause) {
        super(`ConflictLens: analysis service unavailable — is it running? (${cause})`);
        this.name = 'ApiUnavailableError';
    }
}
exports.ApiUnavailableError = ApiUnavailableError;
class ApiTimeoutError extends Error {
    constructor(ms, endpoint) {
        super(`ConflictLens: request to ${endpoint} timed out after ${ms}ms`);
        this.name = 'ApiTimeoutError';
    }
}
exports.ApiTimeoutError = ApiTimeoutError;
class ApiMalformedError extends Error {
    constructor(detail) {
        super(`ConflictLens: couldn't parse analysis results (${detail})`);
        this.name = 'ApiMalformedError';
    }
}
exports.ApiMalformedError = ApiMalformedError;
// ─── Mock Data (Phase 1 — kept for offline / UI dev) ─────────────────────────
const BASE_MOCK = {
    analysis_id: 'mock_001',
    timestamp: '', // filled in at call time
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
            },
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
function getMockResult() {
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
function normalizeApiResponse(raw) {
    if (!raw || typeof raw !== 'object') {
        throw new ApiMalformedError('response was not a JSON object');
    }
    // ── Architecture.md §3 format ─────────────────────────────────────────────
    // Detect by: has analysis_id AND risks[0] has a `location` sub-object.
    if ('analysis_id' in raw &&
        Array.isArray(raw.risks) &&
        (raw.risks.length === 0 ||
            'location' in raw.risks[0])) {
        return raw;
    }
    // ── PRD §9 flat format ────────────────────────────────────────────────────
    // Detect by: has risks array, risks[0] has a top-level `file` field (not nested).
    if ('risks' in raw && Array.isArray(raw.risks)) {
        const prd = raw;
        return {
            analysis_id: `api_${Date.now()}`,
            timestamp: new Date().toISOString(),
            risks: prd.risks.map((r, i) => {
                const validTypes = ['semantic_conflict', 'security_risk'];
                const validLevels = ['low', 'medium', 'high', 'critical'];
                return {
                    id: r.id ?? `risk_${i}`,
                    type: validTypes.includes(r.type)
                        ? r.type
                        : 'semantic_conflict',
                    riskLevel: validLevels.includes(r.riskLevel)
                        ? r.riskLevel
                        : 'medium',
                    location: {
                        file: r.file ?? 'unknown',
                        line: r.line ?? (r.details?.line ?? 1),
                    },
                    details: (r.details ?? {}),
                    ai_context: {
                        explanation: r.aiExplanation ?? 'Pending AI response...',
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
async function analyzeProject() {
    const config = vscode.workspace.getConfiguration();
    const endpoint = config.get('conflictlens.apiEndpoint', '').trim();
    const timeoutMs = config.get('conflictlens.apiTimeoutMs', 8000);
    // ── Mock path (offline / dev mode) ────────────────────────────────────────
    if (!endpoint) {
        console.log('[ConflictLens] apiEndpoint not configured — returning mock data.');
        return getMockResult();
    }
    // ── Real API path ─────────────────────────────────────────────────────────
    console.log(`[ConflictLens] Calling analysis API: POST ${endpoint} (timeout: ${timeoutMs}ms)`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
            }),
            signal: controller.signal,
        });
    }
    catch (err) {
        const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('timeout'));
        if (isTimeout) {
            throw new ApiTimeoutError(timeoutMs, endpoint);
        }
        throw new ApiUnavailableError(String(err));
    }
    finally {
        clearTimeout(timer);
    }
    // Parse JSON — a non-JSON body (e.g. HTML 502 page) would throw here.
    let raw;
    try {
        raw = await response.json();
    }
    catch {
        throw new ApiMalformedError(`HTTP ${response.status} — response body was not valid JSON`);
    }
    return normalizeApiResponse(raw);
}
//# sourceMappingURL=analyzerClient.js.map