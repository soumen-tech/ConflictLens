import { Risk, RiskLevel } from '../types';

interface ProjectHealthProps {
  risks: Risk[];
}

const SEVERITY_CONFIG: Record<RiskLevel, { color: string; bg: string; label: string; weight: number }> = {
  critical: { color: '#ff4757', bg: 'rgba(255,71,87,0.12)',  label: 'Critical', weight: 40 },
  high:     { color: '#ff6348', bg: 'rgba(255,99,72,0.12)',  label: 'High',     weight: 20 },
  medium:   { color: '#ffa502', bg: 'rgba(255,165,2,0.10)', label: 'Medium',   weight: 5  },
  low:      { color: '#2ed573', bg: 'rgba(46,213,115,0.1)', label: 'Low',      weight: 1  },
};

function computeHealthScore(risks: Risk[]): number {
  if (!risks || risks.length === 0) { return 100; }
  const penalty = risks.reduce((sum, r) => {
    const rawLevel = String(r?.riskLevel ?? 'medium').toLowerCase();
    const level = (rawLevel in SEVERITY_CONFIG) ? (rawLevel as RiskLevel) : 'medium';
    return sum + SEVERITY_CONFIG[level].weight;
  }, 0);
  return Math.max(0, 100 - penalty);
}

function healthColor(score: number): string {
  if (score >= 75) { return '#2ed573'; }
  if (score >= 50) { return '#ffa502'; }
  if (score >= 25) { return '#ff6348'; }
  return '#ff4757';
}

interface CountByLevel { critical: number; high: number; medium: number; low: number }

export function ProjectHealth({ risks }: ProjectHealthProps) {
  const score = computeHealthScore(risks);
  const color  = healthColor(score);

  const counts = risks.reduce<CountByLevel>(
    (acc, r) => {
      const rawLevel = String(r?.riskLevel ?? 'medium').toLowerCase();
      const level = (rawLevel in acc) ? (rawLevel as RiskLevel) : 'medium';
      return { ...acc, [level]: acc[level] + 1 };
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );

  // SVG ring parameters
  const R  = 36;
  const C  = 2 * Math.PI * R;
  const dash = (score / 100) * C;

  return (
    <div className="glass-card p-5 mt-4 animate-scale-in">
      <div className="flex items-center gap-6">
        {/* Health ring */}
        <div className="relative flex-shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100">
            {/* Track */}
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="8"
            />
            {/* Progress */}
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
              className="health-ring"
              style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
            />
          </svg>
          {/* Score label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold leading-none" style={{ color }}>{score}</span>
            <span className="text-xs text-cl-muted mt-0.5">score</span>
          </div>
        </div>

        {/* Severity breakdown */}
        <div className="flex-1 min-w-0">
          <p className="section-label">Severity Breakdown</p>
          <div className="space-y-2">
            {(Object.entries(SEVERITY_CONFIG) as [RiskLevel, typeof SEVERITY_CONFIG[RiskLevel]][]).map(([level, cfg]) => {
              const count = counts[level];
              const pct   = risks.length > 0 ? (count / risks.length) * 100 : 0;
              return (
                <div key={level} className="flex items-center gap-3">
                  <span className="text-xs text-cl-muted w-12 flex-shrink-0">{cfg.label}</span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: cfg.color,
                        boxShadow: count > 0 ? `0 0 6px ${cfg.color}60` : 'none',
                      }}
                    />
                  </div>
                  <span
                    className="text-xs font-bold w-4 text-right flex-shrink-0"
                    style={{ color: count > 0 ? cfg.color : '#2a2a3f' }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Total count badge */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-2xl font-bold text-cl-text leading-none">{risks.length}</span>
          <span className="text-xs text-cl-muted mt-0.5">{risks.length === 1 ? 'risk' : 'risks'}</span>
        </div>
      </div>
    </div>
  );
}
