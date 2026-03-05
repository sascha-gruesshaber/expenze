import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { fmt } from '../../lib/format';

ChartJS.register(ArcElement, Tooltip);

interface SavingsRingProps {
  income: number;
  expenses: number;
  savingsTotal: number;
}

export function SavingsRing({ income, expenses, savingsTotal }: SavingsRingProps) {
  // If there are savings-type categories with data, use that as the savings amount.
  // Otherwise fall back to income - expenses (leftover).
  const hasSavingsCategories = savingsTotal > 0;
  const savings = hasSavingsCategories ? savingsTotal : Math.max(income - expenses, 0);
  const rate = income > 0 ? (savings / income) * 100 : 0;
  const remainder = income - expenses;
  const isPositive = remainder >= 0;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5">
      <div className="relative w-[150px] h-[150px]">
        <Doughnut
          data={{
            labels: ['Gespart', 'Ausgegeben'],
            datasets: [
              {
                data: isPositive
                  ? [Math.max(savings, 0), Math.max(expenses - savingsTotal, 0)]
                  : [0, expenses],
                backgroundColor: isPositive
                  ? ['#0D9373', '#F0EFEB']
                  : ['transparent', '#DC5944'],
                borderWidth: 0,
                borderRadius: isPositive ? 6 : 0,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: true,
            cutout: '80%',
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#FFFFFF',
                titleColor: '#1C1917',
                bodyColor: '#78716C',
                borderColor: '#E5E3DC',
                borderWidth: 1,
                cornerRadius: 10,
                bodyFont: { family: 'DM Sans', size: 12 },
                callbacks: {
                  label: (ctx) => ` ${fmt(ctx.parsed)}`,
                },
              },
            },
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className={`font-heading font-bold text-[28px] tracking-tight ${isPositive ? 'text-accent' : 'text-exp-red'}`}
          >
            {rate.toFixed(0)}%
          </div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-3 font-medium">
            Sparquote
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className={`font-heading font-semibold text-[15px] ${isPositive ? 'text-accent' : 'text-exp-red'}`}>
          {fmt(savings)}
        </div>
        <div className="text-[11px] text-text-3 mt-1">
          {hasSavingsCategories
            ? 'in Spar-Kategorien geflossen'
            : isPositive ? 'gespart in diesem Zeitraum' : 'mehr ausgegeben als eingenommen'}
        </div>
      </div>
    </div>
  );
}
