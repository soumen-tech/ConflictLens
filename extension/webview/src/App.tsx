import { useState, useEffect } from 'react';
import { AnalysisResult, IncomingMessage } from './types';
import { Header }          from './components/Header';
import { ProjectHealth }   from './components/ProjectHealth';
import { SecurityPosture } from './components/SecurityPosture';
import { BestFixRanking }  from './components/BestFixRanking';
import { RiskCard }        from './components/RiskCard';
import { EmptyState }      from './components/EmptyState';

export function App() {
  const [result,    setResult]    = useState<AnalysisResult | null>(null);
  const [scanTime,  setScanTime]  = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent<IncomingMessage>) => {
      const msg = event.data;
      if (msg.type === 'updateRisks') {
        setIsLoading(false);
        setResult(msg.data);
        setScanTime(
          new Date(msg.data.timestamp ?? Date.now()).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })
        );
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Sorted: critical → high → medium → low
  const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const sortedRisks = result
    ? [...result.risks].sort(
        (a, b) => SEVERITY_ORDER[a.riskLevel] - SEVERITY_ORDER[b.riskLevel]
      )
    : [];

  return (
    <div className="min-h-screen bg-cl-bg flex flex-col">
      {/* Header */}
      <Header
        scanTime={scanTime}
        riskCount={result?.risks.length ?? 0}
        analysisId={result?.analysis_id}
        isLoading={isLoading}
      />

      <main className="flex-1 px-5 pb-8 max-w-4xl w-full mx-auto">
        {result ? (
          <>
            {/* Health + summary */}
            <ProjectHealth risks={result.risks} />

            {/* Security Posture Breakdown */}
            <SecurityPosture risks={result.risks} />

            {/* Best Fix Priority Ranking */}
            <BestFixRanking risks={result.risks} />

            {/* Risk list */}
            {sortedRisks.length === 0 ? (
              <EmptyState type="clean" />
            ) : (
              <div className="space-y-3 risk-list mt-5">
                {sortedRisks.map((risk, i) => (
                  <RiskCard key={risk.id} risk={risk} index={i} />
                ))}
              </div>
            )}
          </>
        ) : (
          <EmptyState type="waiting" />
        )}
      </main>
    </div>
  );
}
