interface HeaderProps {
  scanTime:   string;
  riskCount:  number;
  analysisId: string | undefined;
  isLoading:  boolean;
  developer?: { login: string; avatarUrl: string };
}

export function Header({ scanTime, riskCount, analysisId, isLoading, developer }: HeaderProps) {
  const hasRisks = riskCount > 0;

  return (
    <header
      className="sticky top-0 z-10 px-5 py-4 mb-2"
      style={{
        background:
          'linear-gradient(180deg, rgba(13,13,20,0.98) 0%, rgba(13,13,20,0.92) 100%)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(124,92,191,0.2)',
      }}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          {/* Lens icon */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #7c5cbf 0%, #4f8ff7 100%)',
              boxShadow: '0 0 16px rgba(124,92,191,0.4)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="5.5" stroke="white" strokeWidth="1.8" />
              <line x1="13.5" y1="13.5" x2="17" y2="17" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              {/* git branch hint */}
              <circle cx="9" cy="7.5" r="1" fill="rgba(255,165,2,0.9)" />
              <circle cx="7"  cy="10.5" r="1" fill="rgba(255,165,2,0.9)" />
              <circle cx="11" cy="10.5" r="1" fill="rgba(255,165,2,0.9)" />
              <line x1="9" y1="8.5" x2="7"  y2="9.5" stroke="rgba(255,165,2,0.6)" strokeWidth="0.8" />
              <line x1="9" y1="8.5" x2="11" y2="9.5" stroke="rgba(255,165,2,0.6)" strokeWidth="0.8" />
            </svg>
          </div>

          <div>
            <h1 className="text-base font-bold text-cl-text leading-none">ConflictLens</h1>
            <p className="text-xs text-cl-muted mt-0.5">AI Risk Analysis</p>
          </div>
        </div>

        {/* Status indicators + Developer badge */}
        <div className="flex items-center gap-4">
          {developer && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-cl-bg-subtle border border-cl-border/60 text-xs">
              <img src={developer.avatarUrl} alt={developer.login} className="w-5 h-5 rounded-full" />
              <span className="text-cl-text font-medium">@{developer.login}</span>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-cl-muted">
              <span className="inline-block w-2 h-2 rounded-full bg-cl-accent animate-pulse" />
              Scanning…
            </div>
          )}

          {scanTime && !isLoading && (
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  hasRisks ? 'bg-cl-medium' : 'bg-cl-low'
                }`}
                style={{ boxShadow: hasRisks ? '0 0 6px rgba(255,165,2,0.8)' : '0 0 6px rgba(46,213,115,0.8)' }}
              />
              <span className="text-xs text-cl-muted">
                Last scan <span className="text-cl-text">{scanTime}</span>
              </span>
            </div>
          )}

          {analysisId && (
            <span className="hidden sm:block text-xs font-mono text-cl-border select-all">
              {analysisId}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
