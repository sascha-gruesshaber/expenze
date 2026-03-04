import { useLocation } from '@tanstack/react-router';
import type { FilterState } from '../../lib/filterContext';
import { useAccounts } from '../../api/hooks';

const MONTHS = [
  { value: '1', label: 'Jan' }, { value: '2', label: 'Feb' },
  { value: '3', label: 'Mär' }, { value: '4', label: 'Apr' },
  { value: '5', label: 'Mai' }, { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' }, { value: '8', label: 'Aug' },
  { value: '9', label: 'Sep' }, { value: '10', label: 'Okt' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
];

const YEARS = Array.from({ length: 7 }, (_, i) => String(2024 + i));

interface TopbarProps {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
}

export function Topbar({ filters, setFilters }: TopbarProps) {
  const location = useLocation();
  const { data: accounts = [] } = useAccounts();
  const title =
    location.pathname === '/transactions' ? 'Transaktionen' :
    location.pathname === '/import' ? 'Import' :
    location.pathname === '/accounts' ? 'Konten' : 'Dashboard';

  const selectClass = 'bg-surface-2 border border-border text-text font-body text-[13px] px-3 py-1.5 rounded-lg outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 cursor-pointer transition-colors';

  const checkingAccounts = accounts.filter(a => a.account_type !== 'savings');
  const savingsAccounts = accounts.filter(a => a.account_type === 'savings');

  return (
    <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-surface sticky top-0 z-10">
      <h1 className="font-heading font-bold text-lg tracking-tight text-text">{title}</h1>
      <div className="flex gap-2 items-center">
        {accounts.length > 0 && (
          <select
            value={filters.account}
            onChange={(e) => setFilters({ ...filters, account: e.target.value })}
            className={selectClass}
          >
            <option value="">Girokonten</option>
            <option value="all">Alle Konten</option>
            {checkingAccounts.map((a) => (
              <option key={a.id} value={String(a.id)}>{a.bank} – {a.name}</option>
            ))}
            {savingsAccounts.map((a) => (
              <option key={a.id} value={String(a.id)}>{a.bank} – {a.name} (Spar)</option>
            ))}
          </select>
        )}
        <select
          value={filters.year}
          onChange={(e) => setFilters({ ...filters, year: e.target.value })}
          className={selectClass}
        >
          <option value="">Alle Jahre</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={filters.month}
          onChange={(e) => setFilters({ ...filters, month: e.target.value })}
          className={selectClass}
        >
          <option value="">Alle Monate</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
