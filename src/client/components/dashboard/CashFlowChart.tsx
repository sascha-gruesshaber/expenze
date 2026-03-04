import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { fmt } from '../../lib/format';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

interface CashFlowChartProps {
  data: Array<{ month: string; income: number; expenses: number }>;
}

function formatMonth(m: string) {
  const [, month] = m.split('-');
  const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return names[parseInt(month) - 1] || m;
}

export function CashFlowChart({ data }: CashFlowChartProps) {
  if (!data.length) {
    return <div className="text-text-3 text-sm text-center py-10">Keine Daten</div>;
  }

  const netFlow = data.map((r) => Number(r.income) - Number(r.expenses));
  let cumulative = 0;
  const runningBalance = netFlow.map((n) => {
    cumulative += n;
    return cumulative;
  });

  return (
    <div className="h-[180px]">
      <Line
        data={{
          labels: data.map((r) => formatMonth(r.month)),
          datasets: [
            {
              label: 'Netto-Cashflow',
              data: netFlow,
              borderColor: '#4A7AE5',
              backgroundColor: (ctx) => {
                const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 180);
                gradient.addColorStop(0, 'rgba(74,122,229,0.08)');
                gradient.addColorStop(1, 'rgba(74,122,229,0.0)');
                return gradient;
              },
              fill: true,
              tension: 0.4,
              borderWidth: 2.5,
              pointRadius: 3,
              pointBackgroundColor: '#4A7AE5',
              pointBorderColor: '#FFFFFF',
              pointBorderWidth: 2,
              pointHoverRadius: 5,
            },
            {
              label: 'Kumuliert',
              data: runningBalance,
              borderColor: '#7C5CDB',
              borderDash: [5, 5],
              tension: 0.4,
              borderWidth: 1.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: '#7C5CDB',
              pointHoverBorderColor: '#FFFFFF',
              pointHoverBorderWidth: 2,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              labels: {
                color: '#78716C',
                font: { family: 'DM Sans', size: 11 },
                boxWidth: 12,
                boxHeight: 2,
                padding: 16,
              },
            },
            tooltip: {
              backgroundColor: '#FFFFFF',
              titleColor: '#1C1917',
              bodyColor: '#78716C',
              borderColor: '#E5E3DC',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 10,
              titleFont: { family: 'Bricolage Grotesque', size: 12, weight: 'bold' as const },
              bodyFont: { family: 'DM Sans', size: 11 },
              callbacks: {
                label: (ctx) => `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#A8A29E', font: { family: 'DM Sans', size: 10 } },
              grid: { display: false },
              border: { display: false },
            },
            y: {
              ticks: {
                color: '#A8A29E',
                font: { family: 'DM Sans', size: 10 },
                callback: (v) => fmt(v as number),
                maxTicksLimit: 4,
              },
              grid: { color: '#F0EFEB', drawTicks: false },
              border: { display: false },
            },
          },
        }}
      />
    </div>
  );
}
