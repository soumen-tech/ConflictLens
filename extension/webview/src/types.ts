// Shared data types mirroring the extension's AnalysisResult shape.
// Keep in sync with analyzerClient.ts.

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type RiskType  = 'semantic_conflict' | 'security_risk';

export interface RiskLocation {
  file: string;
  line: number;
}

export interface AiContext {
  explanation:    string;
  recommendation: string;
}

export interface Risk {
  id:        string;
  type:      RiskType;
  riskLevel: RiskLevel;
  location:  RiskLocation;
  details:   Record<string, unknown>;
  ai_context: AiContext;
}

export interface AnalysisResult {
  analysis_id: string;
  timestamp:   string;
  risks:       Risk[];
}

// VS Code message types sent from extension → webview
export interface UpdateRisksMessage {
  type: 'updateRisks';
  data: AnalysisResult;
}

export type IncomingMessage = UpdateRisksMessage;

// Messages sent from webview → extension
export interface OpenFileMessage {
  type: 'openFile';
  file: string;
  line: number;
}
