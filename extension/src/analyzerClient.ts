/**
 * analyzerClient.ts
 *
 * Owns the analysis request/response cycle — no VS Code UI code lives here.
 *
 * Phase 1: returns hardcoded mock data that matches the team's agreed JSON
 *          contract (Architecture.md §3).
 * Phase 2: replace the single Promise.resolve() line with a real fetch()
 *          to the local Express analysis server. Nothing outside this file
 *          needs to change.
 */

// ─── Shared Types (Architecture.md Integration Contract) ─────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskType = 'semantic_conflict' | 'security_risk';

export interface RiskLocation {
  /** Workspace-relative file path, e.g. "src/cart.js" */
  file: string;
  /** 1-indexed line number */
  line: number;
}

/** Details shape for semantic_conflict risks (from Member 1) */
export interface SemanticConflictDetails {
  functionName: string;
  changeType: string;
  affectedFiles: string[];
}

/** Details shape for security_risk findings (from Member 2) */
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

// ─── Mock Data ────────────────────────────────────────────────────────────────

/**
 * Mirrors the demo scenario from PRD.md §8:
 * calculateTotal() had its signature changed; checkout.js still calls the old version.
 *
 * Replace this with the real API response in Phase 2 — structure is identical.
 */
const MOCK_RESULT: AnalysisResult = {
  analysis_id: 'mock_001',
  timestamp: new Date().toISOString(),
  risks: [
    {
      id: 'risk_001',
      type: 'semantic_conflict',
      riskLevel: 'high',
      location: {
        file: 'src/cart.js',
        line: 42,
      },
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Requests a full risk analysis for the current workspace.
 *
 * @returns A promise that resolves to the structured risk report.
 *
 * Phase 2 replacement (only these lines change):
 *   const response = await fetch('http://localhost:3000/analyze', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ workspacePath: ... }),
 *   });
 *   return response.json() as Promise<AnalysisResult>;
 */
export async function analyzeProject(): Promise<AnalysisResult> {
  return Promise.resolve(MOCK_RESULT);
}
