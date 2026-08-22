import { Risk } from '../types';

interface BestFixRankingProps {
  risks: Risk[];
}

export function BestFixRanking({ risks }: BestFixRankingProps) {
  if (!risks || risks.length === 0) return null;

  const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 } as const;

  // Rank risks by severity, then affected file count
  const ranked = [...risks].sort((a, b) => {
    const weightA = SEVERITY_WEIGHT[a.riskLevel] ?? 1;
    const weightB = SEVERITY_WEIGHT[b.riskLevel] ?? 1;
    if (weightA !== weightB) return weightB - weightA;

    const countA = a.details.affectedFiles?.length ?? 1;
    const countB = b.details.affectedFiles?.length ?? 1;
    return countB - countA;
  });

  const topFixes = ranked.slice(0, 3);

  return (
    <div className="glass-card p-4 mt-4 animate-scale-in border-l-4 border-l-amber-500">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⭐</span>
        <h4 className="text-sm font-bold text-cl-text">Best-Fix Ranking (Optimal Resolution Order)</h4>
      </div>

      <div className="space-y-2">
        {topFixes.map((risk, index) => {
          const file = risk.location.file;
          const fn = risk.details.functionName ?? 'Conflict Block';
          const rec = risk.ai_context?.recommendation ?? 'Resolve overlapping lines and run tests.';

          return (
            <div key={risk.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs">
              <div className="flex items-center justify-between font-mono mb-1">
                <span className="font-bold text-amber-400">Rank #{index + 1} — Fix Priority</span>
                <span className="text-cl-muted">{file}:{risk.location.line}</span>
              </div>
              <p className="text-cl-text font-semibold mb-1">
                {fn} ({risk.riskLevel.toUpperCase()})
              </p>
              <p className="text-cl-muted italic text-[11px]">{rec}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
