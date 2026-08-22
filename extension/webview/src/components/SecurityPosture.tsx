import { Risk } from '../types';

interface SecurityPostureProps {
  risks: Risk[];
}

export function SecurityPosture({ risks }: SecurityPostureProps) {
  const securityRisks = risks.filter((r) => r.type === 'security_risk');

  if (securityRisks.length === 0) {
    return (
      <div className="glass-card p-4 mt-4 animate-scale-in flex items-center justify-between border-l-4 border-l-cl-success">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold">
            ✓
          </div>
          <div>
            <h4 className="text-sm font-semibold text-cl-text">Security Posture</h4>
            <p className="text-xs text-cl-muted">No exposed secrets or security vulnerabilities detected.</p>
          </div>
        </div>
        <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Clean
        </span>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 mt-4 animate-scale-in border-l-4 border-l-red-500">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡️</span>
          <h4 className="text-sm font-bold text-cl-text">Security Posture ({securityRisks.length} issue{securityRisks.length === 1 ? '' : 's'})</h4>
        </div>
        <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
          Action Required
        </span>
      </div>

      <div className="space-y-2">
        {securityRisks.map((risk) => (
          <div key={risk.id} className="p-3 rounded-lg bg-cl-bg-subtle/50 border border-cl-border/50 text-xs">
            <div className="flex items-center justify-between font-mono text-cl-muted mb-1">
              <span>{risk.location.file}:{risk.location.line}</span>
              <span className="uppercase text-[10px] font-bold text-red-400">{risk.riskLevel}</span>
            </div>
            <p className="text-cl-text font-medium mb-1">
              {risk.details.category ? `[${risk.details.category}] ` : ''}
              {risk.details.functionName ?? 'Security Vulnerability / Secret Exposure'}
            </p>
            {risk.details.redactedPreview && (
              <code className="block p-1.5 rounded bg-black/40 text-red-300 font-mono text-[11px] overflow-x-auto">
                {risk.details.redactedPreview}
              </code>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
