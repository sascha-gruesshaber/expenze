import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

interface FilterBarProps {
  search: string;
  direction: string;
  category: string;
  categories: string[];
  count: number;
  onSearchChange: (value: string) => void;
  onDirectionChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
}

export function FilterBar({
  search,
  direction,
  category,
  categories,
  count,
  onSearchChange,
  onDirectionChange,
  onCategoryChange,
}: FilterBarProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearchInput = (value: string) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearchChange(value), 300);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="flex gap-3 items-center mb-4 flex-wrap">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          type="text"
          defaultValue={search}
          placeholder="Suchen..."
          onChange={(e) => handleSearchInput(e.target.value)}
          className="bg-surface border border-border text-text font-body text-[13px] pl-9 pr-3 py-2 rounded-xl outline-none min-w-[220px] focus:border-accent focus:ring-1 focus:ring-accent/20 shadow-soft transition-colors"
        />
      </div>
      <select
        value={direction}
        onChange={(e) => onDirectionChange(e.target.value)}
        className="bg-surface border border-border text-text font-body text-[13px] px-3 py-2 rounded-xl outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 shadow-soft cursor-pointer transition-colors"
      >
        <option value="">Alle Typen</option>
        <option value="credit">Einnahmen</option>
        <option value="debit">Ausgaben</option>
      </select>
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="bg-surface border border-border text-text font-body text-[13px] px-3 py-2 rounded-xl outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 shadow-soft cursor-pointer transition-colors"
      >
        <option value="">Alle Kategorien</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <div className="ml-auto text-text-3 text-[13px] font-medium">{count} Einträge</div>
    </div>
  );
}
