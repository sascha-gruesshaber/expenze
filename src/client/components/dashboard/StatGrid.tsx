import { fmt } from '../../lib/format';

interface StatGridProps {
  count: number;
  income: number;
  expenses: number;
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses: Record<string, { bar: string; text: string }> = {
    blue: { bar: 'bg-exp-blue', text: 'text-exp-blue' },
    green: { bar: 'bg-accent', text: 'text-accent' },
    red: { bar: 'bg-exp-red', text: 'text-exp-red' },
    amber: { bar: 'bg-exp-amber', text: 'text-exp-amber' },
  };
  const c = colorClasses[color];

  return (
    <div className="bg-surface border border-border rounded-[10px] px-5 py-[18px] relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.bar}`} />
      <div className="text-[10px] uppercase tracking-widest text-text-3 mb-2">{label}</div>
      <div className={`font-heading font-bold text-[22px] tracking-tight ${c.text}`}>{value}</div>
    </div>
  );
}

export function StatGrid({ count, income, expenses }: StatGridProps) {
  const balance = income - expenses;

  return (
    <div className="grid grid-cols-4 gap-3.5 mb-6">
      <StatCard label="Transaktionen" value={String(count)} color="blue" />
      <StatCard label="Einnahmen" value={fmt(income)} color="green" />
      <StatCard label="Ausgaben" value={fmt(expenses)} color="red" />
      <StatCard label="Bilanz" value={fmt(balance)} color={balance >= 0 ? 'green' : 'red'} />
    </div>
  );
}
