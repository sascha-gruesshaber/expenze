import { ResponsiveCalendar } from '@nivo/calendar';
import { nivoTheme, CALENDAR_COLORS, fmtEuro } from '../../lib/nivoTheme';
import { useDailySpending } from '../../api/hooks';
import { useFilters } from '../../lib/filterContext';

const DAY_LABELS = ['', 'Mo', '', 'Mi', '', 'Fr', ''];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function SpendingCalendar() {
  const { filters } = useFilters();
  const year = filters.year || String(new Date().getFullYear());
  const { data = [], isLoading } = useDailySpending({ ...filters, year });

  if (isLoading) {
    return <div className="h-[200px] flex items-center justify-center"><span className="spinner" />Lade Kalender...</div>;
  }

  if (data.length === 0) {
    return <div className="h-[200px] flex items-center justify-center text-text-3 text-sm">Keine Daten</div>;
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="h-[200px]">
      <ResponsiveCalendar
        data={data}
        theme={nivoTheme}
        from={`${year}-01-01`}
        to={`${year}-12-31`}
        emptyColor="#F0EFEB"
        colors={CALENDAR_COLORS}
        minValue={0}
        maxValue={maxValue}
        margin={{ top: 20, right: 20, bottom: 10, left: 30 }}
        yearSpacing={40}
        monthBorderWidth={0}
        monthSpacing={4}
        dayBorderWidth={1}
        dayBorderColor="#FFFFFF"
        daySpacing={2}
        monthLegend={(_year: number, _month: number, date: Date) => MONTH_LABELS[date.getMonth()]}
        tooltip={({ day, value }: any) => (
          <div className="bg-white border border-border rounded-xl px-3 py-2 shadow-lg text-[12px]">
            <div className="text-text-2">{new Date(day).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <strong>{value != null ? fmtEuro(value) : 'Keine Ausgaben'}</strong>
          </div>
        )}
      />
    </div>
  );
}
