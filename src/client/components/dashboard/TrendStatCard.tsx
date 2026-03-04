import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fmt } from '../../lib/format';

interface TrendStatCardProps {
  label: string;
  value: number;
  previousValue?: number;
  color: 'green' | 'red' | 'blue' | 'amber' | 'purple';
  icon: React.ReactNode;
  isCurrency?: boolean;
}

const colorMap = {
  green: {
    text: 'text-accent',
    iconBg: 'bg-accent/8',
    iconText: 'text-accent',
  },
  red: {
    text: 'text-exp-red',
    iconBg: 'bg-exp-red/8',
    iconText: 'text-exp-red',
  },
  blue: {
    text: 'text-exp-blue',
    iconBg: 'bg-exp-blue/8',
    iconText: 'text-exp-blue',
  },
  amber: {
    text: 'text-exp-amber',
    iconBg: 'bg-exp-amber/8',
    iconText: 'text-exp-amber',
  },
  purple: {
    text: 'text-exp-purple',
    iconBg: 'bg-exp-purple/8',
    iconText: 'text-exp-purple',
  },
};

export function TrendStatCard({
  label,
  value,
  previousValue,
  color,
  icon,
  isCurrency = true,
}: TrendStatCardProps) {
  const c = colorMap[color];

  let trend: 'up' | 'down' | 'flat' = 'flat';
  let pct = 0;
  if (previousValue !== undefined && previousValue !== 0) {
    pct = ((value - previousValue) / previousValue) * 100;
    if (Math.abs(pct) < 0.5) trend = 'flat';
    else trend = pct > 0 ? 'up' : 'down';
  }

  return (
    <div className="bg-surface rounded-2xl shadow-card p-5 transition-shadow duration-200 hover:shadow-card-hover">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center ${c.iconText}`}>
          {icon}
        </div>
        {previousValue !== undefined && previousValue !== 0 && (
          <div
            className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg ${
              trend === 'up'
                ? 'text-accent bg-accent/8'
                : trend === 'down'
                  ? 'text-exp-red bg-exp-red/8'
                  : 'text-text-3 bg-surface-2'
            }`}
          >
            {trend === 'up' ? (
              <TrendingUp size={12} />
            ) : trend === 'down' ? (
              <TrendingDown size={12} />
            ) : (
              <Minus size={12} />
            )}
            {Math.abs(pct).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="text-[11px] uppercase tracking-[0.1em] text-text-3 font-medium mb-1">
        {label}
      </div>
      <div className={`font-heading font-bold text-2xl tracking-tight ${c.text}`}>
        {isCurrency ? fmt(value) : value.toLocaleString('de-DE')}
      </div>
    </div>
  );
}
