interface EmptyStateProps {
  type: 'waiting' | 'clean';
}

// VS Code webview API — injected by VS Code at runtime
declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscodeApi = (typeof acquireVsCodeApi !== 'undefined') ? acquireVsCodeApi() : null;

function triggerScan() {
  vscodeApi?.postMessage({ type: 'scanNow' });
}

export function EmptyState({ type }: EmptyStateProps) {
  const isWaiting = type === 'waiting';

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-up">
      {/* Icon */}
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{
          background: isWaiting
            ? 'rgba(124,92,191,0.1)'
            : 'rgba(46,213,115,0.1)',
          border: `1px solid ${isWaiting ? 'rgba(124,92,191,0.2)' : 'rgba(46,213,115,0.2)'}`,
        }}
      >
        {isWaiting ? (
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            {/* Lens */}
            <circle cx="16" cy="16" r="9" stroke="#7c5cbf" strokeWidth="2.2" />
            <line x1="23" y1="23" x2="29" y2="29" stroke="#7c5cbf" strokeWidth="2.2" strokeLinecap="round" />
            {/* Pulse ring */}
            <circle cx="16" cy="16" r="13" stroke="#7c5cbf" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3 4" />
          </svg>
        ) : (
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="14" fill="rgba(46,213,115,0.15)" />
            <polyline points="11,19 16,24 25,13" stroke="#2ed573" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <h2
        className="text-xl font-bold mb-2"
        style={{ color: isWaiting ? '#7c5cbf' : '#2ed573' }}
      >
        {isWaiting ? 'Ready to Scan' : 'All Clear!'}
      </h2>
      <p className="text-sm text-cl-muted max-w-xs leading-relaxed">
        {isWaiting
          ? 'Run ConflictLens: Scan Now from the Command Palette to detect semantic conflicts and security risks.'
          : 'No risks detected in this scan. Your code looks good!'}
      </p>

      {isWaiting && (
        <button
          onClick={triggerScan}
          className="mt-6 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: 'rgba(124,92,191,0.15)',
            color: '#c8b8ea',
            border: '1px solid rgba(124,92,191,0.35)',
            cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,92,191,0.3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(124,92,191,0.15)')}
        >
          🔍 Scan Now
        </button>
      )}
    </div>
  );
}
