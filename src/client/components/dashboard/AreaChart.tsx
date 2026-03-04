import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { fmt } from '../../lib/format';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface AreaChartProps {
  data: Array<{ month: string; income: number; expenses: number }>;
}

function formatMonth(m: string) {
  const [, month] = m.split('-');
  const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return names[parseInt(month) - 1] || m;
}

export function AreaChart({ data }: AreaChartProps) {
  if (!data.length) {
    return <div className="text-text-3 text-sm text-center py-16">Keine Daten vorhanden</div>;
  }

  return (
    <div className="h-[280px]">
      <Line
        data={{
          labels: data.map((r) => formatMonth(r.month)),
          datasets: [
            {
              label: 'Einnahmen',
              data: data.map((r) => Number(r.income) || 0),
              borderColor: '#0D9373',
              backgroundColor: (ctx) => {
                const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
                gradient.addColorStop(0, 'rgba(13,147,115,0.12)');
                gradient.addColorStop(1, 'rgba(13,147,115,0.0)');
                return gradient;
              },
              fill: true,
              tension: 0.4,
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: '#0D9373',
              pointHoverBorderColor: '#FFFFFF',
              pointHoverBorderWidth: 2,
            },
            {
              label: 'Ausgaben',
              data: data.map((r) => Number(r.expenses) || 0),
              borderColor: '#DC5944',
              backgroundColor: (ctx) => {
                const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
                gradient.addColorStop(0, 'rgba(220,89,68,0.08)');
                gradient.addColorStop(1, 'rgba(220,89,68,0.0)');
                return gradient;
              },
              fill: true,
              tension: 0.4,
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: '#DC5944',
              pointHoverBorderColor: '#FFFFFF',
              pointHoverBorderWidth: 2,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              labels: {
                color: '#78716C',
                font: { family: 'DM Sans', size: 12 },
                boxWidth: 12,
                boxHeight: 2,
                usePointStyle: false,
                padding: 20,
              },
            },
            tooltip: {
              backgroundColor: '#FFFFFF',
              titleColor: '#1C1917',
              bodyColor: '#78716C',
              borderColor: '#E5E3DC',
              borderWidth: 1,
              padding: 14,
              titleFont: { family: 'Bricolage Grotesque', size: 13, weight: 'bold' as const },
              bodyFont: { family: 'DM Sans', size: 12 },
              displayColors: true,
              boxWidth: 8,
              boxHeight: 8,
              boxPadding: 4,
              cornerRadius: 10,
              callbacks: {
                label: (ctx) => `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: '#A8A29E',
                font: { family: 'DM Sans', size: 11 },
              },
              grid: { display: false },
              border: { display: false },
            },
            y: {
              ticks: {
                color: '#A8A29E',
                font: { family: 'DM Sans', size: 11 },
                callback: (v) => fmt(v as number),
                maxTicksLimit: 5,
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
