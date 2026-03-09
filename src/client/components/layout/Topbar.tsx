import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation } from '@tanstack/react-router';
import { Calendar, ChevronDown, Landmark, X } from 'lucide-react';
import type { FilterState } from '../../lib/filterContext';
import { useAccounts, useMonthlyAnalysis } from '../../api/hooks';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

const MONTH_LABELS_FULL = [
  'Januar', 'Februar', 'Marz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

interface TopbarProps {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
}

export function Topbar({ filters, setFilters }: TopbarProps) {
  const location = useLocation();
  const { data: accounts = [] } = useAccounts();
  const { data: monthly = [] } = useMonthlyAnalysis(filters.account);

  const title =
    location.pathname === '/analytics' ? 'Finanzanalyse' :
    location.pathname === '/transactions' ? 'Transaktionen' :
    location.pathname === '/import' ? 'Import' :
    location.pathname === '/accounts' ? 'Konten' :
    location.pathname === '/categories' ? 'Kategorien' :
    location.pathname === '/templates' ? 'Bank-Templates' : 'Dashboard';

  // Derive available years and months from actual data
  const { availableYears, monthsByYear } = useMemo(() => {
    const yearsSet = new Set<string>();
    const mByY: Record<string, Set<number>> = {};
    for (const entry of monthly) {
      if (!entry.month) continue;
      const [y, m] = entry.month.split('-');
      yearsSet.add(y);
      if (!mByY[y]) mByY[y] = new Set();
      mByY[y].add(parseInt(m));
    }
    const years = Array.from(yearsSet).sort();
    const result: Record<string, number[]> = {};
    for (const y of years) {
      result[y] = Array.from(mByY[y]).sort((a, b) => a - b);
    }
    return { availableYears: years, monthsByYear: result };
  }, [monthly]);

  const activeAccounts = accounts.filter(a => a.is_active !== false);
  const checkingAccounts = activeAccounts.filter(a => a.account_type !== 'savings');
  const savingsAccounts = activeAccounts.filter(a => a.account_type === 'savings');

  // Build display label for period
  const periodLabel = useMemo(() => {
    if (filters.year && filters.month) {
      return `${MONTH_LABELS_FULL[parseInt(filters.month) - 1]} ${filters.year}`;
    }
    if (filters.year) return filters.year;
    return 'Gesamter Zeitraum';
  }, [filters.year, filters.month]);

  // Build display label for account
  const accountLabel = useMemo(() => {
    if (!filters.account || filters.account === '') return 'Girokonten';
    if (filters.account === 'all') return 'Alle Konten';
    const acc = accounts.find(a => String(a.id) === filters.account);
    if (acc) return `${acc.bank} - ${acc.name}`;
    return 'Konto';
  }, [filters.account, accounts]);

  return (
    <div className="px-8 py-4 border-b border-border flex items-center justify-between bg-surface sticky top-0 z-10">
      <h1 className="font-heading font-bold text-lg tracking-tight text-text">{title}</h1>
      <div className="flex gap-2 items-center">
        <PeriodPicker
          filters={filters}
          setFilters={setFilters}
          availableYears={availableYears}
          monthsByYear={monthsByYear}
          label={periodLabel}
        />
        {activeAccounts.length > 0 && (
          <AccountPicker
            filters={filters}
            setFilters={setFilters}
            checkingAccounts={checkingAccounts}
            savingsAccounts={savingsAccounts}
            label={accountLabel}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Period Picker ─────────────────────────────────────────────────── */

interface PeriodPickerProps {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  availableYears: string[];
  monthsByYear: Record<string, number[]>;
  label: string;
}

function PeriodPicker({ filters, setFilters, availableYears, monthsByYear, label }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The year currently being browsed in the picker (not the filter)
  const [browseYear, setBrowseYear] = useState(
    filters.year || availableYears[availableYears.length - 1] || '',
  );

  useEffect(() => {
    if (open && filters.year) setBrowseYear(filters.year);
    else if (open && availableYears.length) setBrowseYear(availableYears[availableYears.length - 1]);
  }, [open]);

  useClickOutside(ref, () => setOpen(false));

  const hasFilter = filters.year || filters.month;
  const availableMonths = monthsByYear[browseYear] || [];

  function selectYear(y: string) {
    setBrowseYear(y);
    setFilters({ ...filters, year: y, month: '' });
  }

  function selectMonth(m: number) {
    setFilters({ ...filters, year: browseYear, month: String(m) });
    setOpen(false);
  }

  function clearFilters(e: React.MouseEvent) {
    e.stopPropagation();
    setFilters({ ...filters, year: '', month: '' });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`
          group flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium
          transition-all duration-200 cursor-pointer select-none
          border
          ${hasFilter
            ? 'bg-accent/8 border-accent/20 text-accent hover:bg-accent/12'
            : 'bg-surface-2 border-border text-text-2 hover:text-text hover:border-border-2 hover:bg-white'
          }
        `}
      >
        <Calendar size={14} className={hasFilter ? 'text-accent' : 'text-text-3 group-hover:text-text-2'} />
        <span>{label}</span>
        {hasFilter ? (
          <span
            onClick={clearFilters}
            className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20 transition-colors"
          >
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-[calc(100%+6px)] z-50
            bg-white border border-border rounded-2xl shadow-lg
            w-[320px] overflow-hidden
            animate-dropdown
          "
        >
          {/* Year strip */}
          <div className="flex gap-1 px-3 pt-3 pb-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => { setFilters({ ...filters, year: '', month: '' }); setOpen(false); }}
              className={`
                shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer
                ${!filters.year
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-3 hover:text-text hover:bg-surface-2'
                }
              `}
            >
              Alle
            </button>
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => selectYear(y)}
                className={`
                  shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer
                  ${browseYear === y && filters.year
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-3 hover:text-text hover:bg-surface-2'
                  }
                `}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-border mx-3" />

          {/* Month grid */}
          <div className="p-3">
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                const isAvailable = availableMonths.includes(m);
                const isActive = filters.year === browseYear && filters.month === String(m);
                return (
                  <button
                    key={m}
                    disabled={!isAvailable}
                    onClick={() => selectMonth(m)}
                    className={`
                      py-2 rounded-lg text-[12px] font-medium transition-all cursor-pointer
                      ${isActive
                        ? 'bg-accent text-white shadow-sm font-semibold'
                        : isAvailable
                          ? 'text-text-2 hover:bg-accent/8 hover:text-accent'
                          : 'text-text-3/30 cursor-not-allowed'
                      }
                    `}
                  >
                    {MONTH_LABELS[m - 1]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick: full year button */}
          {filters.year && filters.month && (
            <>
              <div className="h-px bg-border mx-3" />
              <div className="px-3 py-2.5">
                <button
                  onClick={() => { setFilters({ ...filters, month: '' }); setOpen(false); }}
                  className="w-full text-center py-1.5 rounded-lg text-[12px] font-medium text-accent hover:bg-accent/8 transition-colors cursor-pointer"
                >
                  Ganzes Jahr {browseYear} anzeigen
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Account Picker ────────────────────────────────────────────────── */

interface AccountPickerProps {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  checkingAccounts: { id: number; name: string; bank: string; account_type: string }[];
  savingsAccounts: { id: number; name: string; bank: string; account_type: string }[];
  label: string;
}

function AccountPicker({ filters, setFilters, checkingAccounts, savingsAccounts, label }: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));

  const isFiltered = filters.account !== '' && filters.account !== undefined;

  function select(value: string) {
    setFilters({ ...filters, account: value });
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`
          group flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium
          transition-all duration-200 cursor-pointer select-none
          border
          ${isFiltered
            ? 'bg-accent/8 border-accent/20 text-accent hover:bg-accent/12'
            : 'bg-surface-2 border-border text-text-2 hover:text-text hover:border-border-2 hover:bg-white'
          }
        `}
      >
        <Landmark size={14} className={isFiltered ? 'text-accent' : 'text-text-3 group-hover:text-text-2'} />
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-[calc(100%+6px)] z-50
            bg-white border border-border rounded-2xl shadow-lg
            w-[280px] overflow-hidden
            animate-dropdown
          "
        >
          {/* Presets */}
          <div className="p-2">
            <AccountOption
              active={filters.account === ''}
              onClick={() => select('')}
              label="Girokonten"
              sub="Standard-Ansicht"
            />
            <AccountOption
              active={filters.account === 'all'}
              onClick={() => select('all')}
              label="Alle Konten"
              sub="Inkl. Sparkonten"
            />
          </div>

          {checkingAccounts.length > 0 && (
            <>
              <div className="h-px bg-border mx-2" />
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Girokonten</span>
              </div>
              <div className="px-2 pb-2">
                {checkingAccounts.map(a => (
                  <AccountOption
                    key={a.id}
                    active={filters.account === String(a.id)}
                    onClick={() => select(String(a.id))}
                    label={a.name}
                    sub={a.bank}
                  />
                ))}
              </div>
            </>
          )}

          {savingsAccounts.length > 0 && (
            <>
              <div className="h-px bg-border mx-2" />
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Sparkonten</span>
              </div>
              <div className="px-2 pb-2">
                {savingsAccounts.map(a => (
                  <AccountOption
                    key={a.id}
                    active={filters.account === String(a.id)}
                    onClick={() => select(String(a.id))}
                    label={a.name}
                    sub={a.bank}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AccountOption({ active, onClick, label, sub }: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
        transition-all cursor-pointer
        ${active
          ? 'bg-accent/8 text-accent'
          : 'text-text-2 hover:bg-surface-2 hover:text-text'
        }
      `}
    >
      <div
        className={`
          w-2 h-2 rounded-full shrink-0 transition-colors
          ${active ? 'bg-accent' : 'bg-border-2'}
        `}
      />
      <div className="min-w-0">
        <div className={`text-[13px] font-medium truncate ${active ? 'text-accent' : ''}`}>{label}</div>
        <div className="text-[11px] text-text-3 truncate">{sub}</div>
      </div>
    </button>
  );
}

/* ─── useClickOutside hook ──────────────────────────────────────────── */

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [ref, handler]);
}
