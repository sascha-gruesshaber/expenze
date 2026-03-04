import { fmt } from '../../lib/format';
import { CHART_COLORS } from '../../lib/constants';
import type { CategoryData } from '../../api/hooks';

interface CategoryBreakdownProps {
  categories: CategoryData[];
}

export function CategoryBreakdown({ categories }: CategoryBreakdownProps) {
  if (!categories.length) {
    return <div className="text-text-3 text-sm text-center py-10">Keine Daten</div>;
  }

  const total = categories.reduce((s, c) => s + Number(c.total), 0);
  const top = categories.slice(0, 8);

  return (
    <div className="flex flex-col gap-3.5">
      {top.map((c, i) => {
        const pct = total > 0 ? (Number(c.total) / total) * 100 : 0;
        const color = CHART_COLORS[i % CHART_COLORS.length];

        return (
          <div key={c.category} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[13px] text-text-2 group-hover:text-text transition-colors">
                  {c.category}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text-3 font-medium">{pct.toFixed(1)}%</span>
                <span className="text-[13px] text-text font-semibold min-w-[85px] text-right">
                  {fmt(Number(c.total))}
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        );
      })}
      {categories.length > 8 && (
        <div className="text-[11px] text-text-3 text-center pt-1 font-medium">
          + {categories.length - 8} weitere Kategorien
        </div>
      )}
    </div>
  );
}
