/**
 * @file index.ts
 * @description Canonical shared schemas and contracts for ConflictLens.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RiskType = "semantic_conflict" | "security_risk";

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
