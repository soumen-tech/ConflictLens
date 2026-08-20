import { useState } from 'react';
import { Risk, RiskLevel, OpenFileMessage } from '../types';
import { SeverityBadge } from './SeverityBadge';

interface RiskCardProps {
  risk:  Risk;
  index: number;
}

const BORDER_COLOR: Record<RiskLevel, string> = {
  critical: 'rgba(255,71,87,0.35)',
  high:     'rgba(255,99,72,0.3)',
  medium:   'rgba(255,165,2,0.25)',
  low:      'rgba(46,213,115,0.2)',
};

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  semantic_conflict: { label: 'Semantic Conflict', icon: '⚡' },
  security_risk:     { label: 'Security Risk',     icon: '🔒' },
};

const PENDING_TEXT = 'Pending AI response';

function isPending(text: string): boolean {
  return text.startsWith(PENDING_TEXT);
}

// Post a message to the VS Code extension
function vscodePost(msg: OpenFileMessage): void {
  try {
    // acquireVsCodeApi is a global injected by VS Code at runtime
    const api = (window as unknown as { acquireVsCodeApi?: () => { postMessage(m: unknown): void } }).acquireVsCodeApi?.();
    api?.postMessage(msg);
  } catch {
    // Running outside VS Code (e.g. dev server) — silently ignore.
  }
}

export function RiskCard({ risk, index }: RiskCardProps) {
  const [expanded, setExpanded] = useState(true);

  const borderColor  = BORDER_COLOR[risk.riskLevel];
  const typeInfo     = TYPE_LABELS[risk.type] ?? { label: risk.type, icon: '⚠️' };
  const hasAI        = !isPending(risk.ai_context.explanation);
  const delayStyle   = { animationDelay: `${index * 60}ms` };

  function handleFileClick() {
    vscodePost({ type: 'openFile', file: risk.location.file, line: risk.location.line });
  }

  return (
    <article
      className="glass-card animate-fade-up overflow-hidden"
      style={{
        ...delayStyle,
        borderColor,
        boxShadow: `0 0 0 1px ${borderColor}, 0 4px 24px rgba(0,0,0,0.3)`,
      }}
    >
      {/* Card header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
        style={{ background: `linear-gradient(90deg, ${borderColor.replace(')', ', 0.06)')} 0%, transparent 60%)` }}
      >
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge level={risk.riskLevel} />
            <span className="text-xs text-cl-muted px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {typeInfo.icon} {typeInfo.label}
            </span>
          </div>

          {/* File path */}
          <button
            className="file-link text-left text-sm truncate"
            onClick={(e) => { e.stopPropagation(); handleFileClick(); }}
            title={`${risk.location.file}:${risk.location.line}`}
          >
            {risk.location.file}
            <span className="text-cl-muted">:{risk.location.line}</span>
          </button>
        </div>

        {/* Chevron */}
        <span
          className="text-cl-muted mt-0.5 transition-transform duration-200 flex-shrink-0"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: 12 }}
        >
          ▾
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-cl-border space-y-3 pt-3">
          {/* AI Explanation */}
          <div>
            <p className="section-label">AI Explanation</p>
            {hasAI ? (
              <p className="text-sm text-cl-text leading-relaxed">{risk.ai_context.explanation}</p>
            ) : (
              <div className="space-y-1.5">
                <div className="ai-loading" style={{ width: '92%' }} />
                <div className="ai-loading" style={{ width: '78%' }} />
                <div className="ai-loading" style={{ width: '60%' }} />
              </div>
            )}
          </div>

          {/* AI Recommendation */}
          {hasAI && (
            <div
              className="rounded-lg px-3 py-2.5"
              style={{ background: 'rgba(79,143,247,0.08)', border: '1px solid rgba(79,143,247,0.2)' }}
            >
              <p className="section-label" style={{ color: '#4f8ff7', marginBottom: '4px' }}>
                💡 Recommendation
              </p>
              <p className="text-sm leading-relaxed" style={{ color: '#c5d8f7' }}>
                {risk.ai_context.recommendation}
              </p>
            </div>
          )}

          {/* Raw details (collapsible debug) */}
          {Object.keys(risk.details ?? {}).length > 0 && (
            <details className="mt-1">
              <summary className="text-xs text-cl-muted cursor-pointer select-none hover:text-cl-text transition-colors">
                Raw details
              </summary>
              <pre
                className="mt-2 text-xs rounded-lg p-3 overflow-x-auto"
                style={{ background: 'rgba(0,0,0,0.3)', color: '#8892a4', fontFamily: 'monospace' }}
              >
                {JSON.stringify(risk.details, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
