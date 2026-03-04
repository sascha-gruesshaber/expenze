import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { CHART_COLORS } from '../../lib/constants';
import { fmt } from '../../lib/format';
import type { CategoryData } from '../../api/hooks';

ChartJS.register(ArcElement, Tooltip);

interface PieChartProps {
  categories: CategoryData[];
}

export function PieChart({ categories }: PieChartProps) {
  const top = categories.slice(0, 8);

  if (!top.length) {
    return <div className="text-text-3 text-xs text-center py-10">Keine Daten</div>;
  }

  return (
    <div className="grid grid-cols-[200px_1fr] gap-6 items-center">
      <div className="h-[200px]">
        <Doughnut
          data={{
            labels: top.map((c) => c.category),
            datasets: [
              {
                data: top.map((c) => Number(c.total)),
                backgroundColor: CHART_COLORS,
                borderWidth: 0,
                hoverOffset: 4,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: { legend: { display: false } },
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        {top.map((c, i) => (
          <div key={c.category} className="flex items-center gap-2.5">
            <div
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: CHART_COLORS[i] }}
            />
            <div className="text-[11px] text-text-2 min-w-[140px] whitespace-nowrap overflow-hidden text-ellipsis">
              {c.category}
            </div>
            <div className="text-[11px] text-text min-w-[80px] text-right">{fmt(Number(c.total))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
