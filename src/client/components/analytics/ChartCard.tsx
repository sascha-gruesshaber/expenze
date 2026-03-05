import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, children, className = '' }: ChartCardProps) {
  return (
    <div className={`bg-surface rounded-2xl shadow-card p-6 ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <span className="font-heading font-semibold text-[15px] text-text">{title}</span>
        {subtitle && <span className="text-[12px] text-text-3">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
