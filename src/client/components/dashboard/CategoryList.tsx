import { fmt } from '../../lib/format';
import type { CategoryData } from '../../api/hooks';

interface CategoryListProps {
  categories: CategoryData[];
}

export function CategoryList({ categories }: CategoryListProps) {
  if (!categories.length) {
    return <div className="text-text-3 text-xs">Keine Daten</div>;
  }

  const max = categories[0]?.total || 1;
  const top8 = categories.slice(0, 8);

  return (
    <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
      {top8.map((c) => (
        <div key={c.category} className="flex items-center gap-2.5">
          <div className="text-[11px] text-text-2 min-w-[140px] whitespace-nowrap overflow-hidden text-ellipsis">
            {c.category}
          </div>
          <div className="flex-1 h-1 bg-border rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm bg-accent transition-all duration-500"
              style={{ width: `${((Number(c.total) / Number(max)) * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="text-[11px] text-text min-w-[80px] text-right">{fmt(Number(c.total))}</div>
        </div>
      ))}
    </div>
  );
}
