import { RiskLevel } from '../types';

interface SeverityBadgeProps {
  level: RiskLevel;
  size?: 'sm' | 'md';
}

const CONFIG: Record<RiskLevel, { color: string; bg: string; dot: string; label: string }> = {
  critical: { color: '#ff4757', bg: 'rgba(255,71,87,0.15)',  dot: '#ff4757', label: 'Critical' },
  high:     { color: '#ff6348', bg: 'rgba(255,99,72,0.15)',  dot: '#ff6348', label: 'High'     },
  medium:   { color: '#ffa502', bg: 'rgba(255,165,2,0.15)', dot: '#ffa502', label: 'Medium'   },
  low:      { color: '#2ed573', bg: 'rgba(46,213,115,0.15)',dot: '#2ed573', label: 'Low'      },
};

export function SeverityBadge({ level, size = 'md' }: SeverityBadgeProps) {
  const cfg  = CONFIG[level];
  const px   = size === 'sm' ? '6px 10px' : '4px 12px';
  const fs   = size === 'sm' ? '10px' : '11px';
  const dotS = size === 'sm' ? 5 : 6;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold tracking-wider uppercase"
      style={{ color: cfg.color, background: cfg.bg, padding: px, fontSize: fs }}
    >
      <span
        style={{
          width: dotS, height: dotS,
          borderRadius: '50%',
          background: cfg.dot,
          boxShadow: `0 0 4px ${cfg.dot}`,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
}
