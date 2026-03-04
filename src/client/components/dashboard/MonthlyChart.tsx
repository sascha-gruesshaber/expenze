import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { fmt } from '../../lib/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface MonthlyChartProps {
  data: Array<{ month: string; income: number; expenses: number }>;
}

export function MonthlyChart({ data }: MonthlyChartProps) {
  if (!data.length) {
    return <div className="text-text-3 text-xs text-center py-10">Keine Daten</div>;
  }

  return (
    <div className="h-[220px]">
      <Bar
        data={{
          labels: data.map((r) => r.month),
          datasets: [
            {
              label: 'Einnahmen',
              data: data.map((r) => Number(r.income) || 0),
              backgroundColor: 'rgba(74,222,128,0.7)',
              borderRadius: 4,
              borderSkipped: false,
            },
            {
              label: 'Ausgaben',
              data: data.map((r) => Number(r.expenses) || 0),
              backgroundColor: 'rgba(248,113,113,0.7)',
              borderRadius: 4,
              borderSkipped: false,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: '#7a8099',
                font: { family: 'DM Mono', size: 11 },
                boxWidth: 10,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#4a5168', font: { family: 'DM Mono', size: 10 } },
              grid: { color: '#1f2430' },
            },
            y: {
              ticks: {
                color: '#4a5168',
                font: { family: 'DM Mono', size: 10 },
                callback: (v) => fmt(v as number),
              },
              grid: { color: '#1f2430' },
            },
          },
        }}
      />
    </div>
  );
}
