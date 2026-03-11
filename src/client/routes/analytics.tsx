import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { ChartCard } from '../components/analytics/ChartCard';

const SankeyChart = lazy(() => import('../components/analytics/SankeyChart').then(m => ({ default: m.SankeyChart })));
const SpendingTreemap = lazy(() => import('../components/analytics/SpendingTreemap').then(m => ({ default: m.SpendingTreemap })));
const SpendingCalendar = lazy(() => import('../components/analytics/SpendingCalendar').then(m => ({ default: m.SpendingCalendar })));
const CategoryStackedArea = lazy(() => import('../components/analytics/CategoryStackedArea').then(m => ({ default: m.CategoryStackedArea })));

export const Route = createFileRoute('/analytics')({
  component: AnalyticsPage,
});

function ChartFallback() {
  return <div className="h-[320px] flex items-center justify-center"><span className="spinner" /></div>;
}

function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <ChartCard title="Geldfluss" subtitle="Einnahmen → Konto → Ausgaben">
        <Suspense fallback={<ChartFallback />}>
          <SankeyChart />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Ausgaben nach Kategorie" subtitle="Treemap">
          <Suspense fallback={<ChartFallback />}>
            <SpendingTreemap />
          </Suspense>
        </ChartCard>
        <ChartCard title="Kategorie-Verlauf" subtitle="Monatlich">
          <Suspense fallback={<ChartFallback />}>
            <CategoryStackedArea />
          </Suspense>
        </ChartCard>
      </div>

      <ChartCard title="Ausgaben-Kalender" subtitle="Tagesausgaben">
        <Suspense fallback={<ChartFallback />}>
          <SpendingCalendar />
        </Suspense>
      </ChartCard>
    </div>
  );
}
