import { useMemo, useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';
import { useCategoryMonthly } from '../../api/hooks';
import { useFilters } from '../../lib/filterContext';
import { CHART_COLORS } from '../../lib/nivoTheme';

Chart.register(...registerables);

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function CategoryStackedArea() {
  const { filters } = useFilters();
  const { data = [], isLoading } = useCategoryMonthly(filters);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const { labels, datasets } = useMemo(() => {
    if (data.length === 0) return { labels: [] as string[], datasets: [] as any[] };

    const allCategories = new Set<string>();
    for (const entry of data) {
      for (const cat of Object.keys(entry.categories)) {
        allCategories.add(cat);
      }
    }

    const catList = Array.from(allCategories);
    const labels = data.map(d => {
      const [y, m] = d.month.split('-');
      return `${MONTH_LABELS[parseInt(m) - 1]} ${y.slice(2)}`;
    });

    const datasets = catList.map((cat, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length];
      return {
        label: cat,
        data: data.map(d => d.categories[cat] || 0),
        fill: true,
        backgroundColor: color + '30',
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHitRadius: 10,
        tension: 0.35,
      };
    });

    return { labels, datasets };
  }, [data]);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    if (labels.length === 0) return;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: '"DM Sans", system-ui, sans-serif', size: 11 },
              color: '#78716C',
              boxWidth: 12,
              boxHeight: 12,
              borderRadius: 3,
              useBorderRadius: true,
              padding: 12,
            },
          },
          tooltip: {
            backgroundColor: '#FFFFFF',
            titleColor: '#1C1917',
            bodyColor: '#78716C',
            borderColor: '#E5E3DC',
            borderWidth: 1,
            titleFont: { family: '"DM Sans"', weight: '600' as any, size: 12 },
            bodyFont: { family: '"DM Sans"', size: 11 },
            padding: 10,
            cornerRadius: 10,
            boxPadding: 4,
            callbacks: {
              label: (ctx: any) => {
                const val = ctx.parsed.y || 0;
                return ` ${ctx.dataset.label}: ${val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: '"DM Sans"', size: 11 }, color: '#A8A29E' },
            border: { display: false },
          },
          y: {
            stacked: true,
            grid: { color: '#F0EFEB' },
            ticks: {
              font: { family: '"DM Sans"', size: 11 },
              color: '#A8A29E',
              callback: (v: any) => `${v.toLocaleString('de-DE')} €`,
            },
            border: { display: false },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, datasets]);

  if (isLoading) {
    return <div className="h-[320px] flex items-center justify-center"><span className="spinner" />Lade Verlauf...</div>;
  }

  if (data.length === 0) {
    return <div className="h-[320px] flex items-center justify-center text-text-3 text-sm">Keine Daten</div>;
  }

  return (
    <div className="h-[320px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
