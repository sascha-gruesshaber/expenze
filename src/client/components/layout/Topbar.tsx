import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation } from '@tanstack/react-router';
import { Calendar, ChevronDown, Landmark, X, FolderOpen, Menu, ArrowRight } from 'lucide-react';
import type { FilterState } from '../../lib/filterContext';
import { useAccounts, useMonthlyAnalysis, useAccountGroups } from '../../api/hooks';
import { BankLogo } from '../BankLogo';
import { useSidebar } from '../../lib/sidebarContext';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

const MONTH_LABELS_FULL = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
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
  const { setMobileOpen } = useSidebar();

  const title =
    location.pathname === '/analytics' ? 'Finanzanalyse' :
    location.pathname === '/chat' ? 'KI-Assistent' :
    location.pathname === '/transactions' ? 'Transaktionen' :
    location.pathname === '/import' ? 'Import' :
    location.pathname === '/accounts' ? 'Konten' :
    location.pathname === '/categories' ? 'Kategorien' :
    location.pathname === '/templates' ? 'Bank-Templates' :
    location.pathname === '/settings' ? 'Einstellungen' : 'Dashboard';

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

  const { data: groups = [] } = useAccountGroups();

  const activeAccounts = accounts.filter(a => a.is_active !== false);
  const activeGroups = groups.filter(g => g.is_active);
  const ungroupedActive = activeAccounts.filter(a => !a.group_id);
  const checkingAccounts = ungroupedActive.filter(a => a.account_type !== 'savings' && a.account_type !== 'investment');
  const savingsAccounts = ungroupedActive.filter(a => a.account_type === 'savings');
  const investmentAccounts = ungroupedActive.filter(a => a.account_type === 'investment');
  const checkingGroups = activeGroups.filter(g => g.account_type === 'checking');
  const savingsGroups = activeGroups.filter(g => g.account_type === 'savings');
  const investmentGroups = activeGroups.filter(g => g.account_type === 'investment');

  // Build display label for period
  const periodLabel = useMemo(() => {
    if (filters.dateFrom && filters.dateTo) {
      const fmtShort = (d: string) => {
        const [y, m, day] = d.split('-');
        return `${day}.${m}.${y.slice(2)}`;
      };
      return `${fmtShort(filters.dateFrom)} – ${fmtShort(filters.dateTo)}`;
    }
    if (filters.year && filters.month) {
      return `${MONTH_LABELS[parseInt(filters.month) - 1]} ${filters.year}`;
    }
    if (filters.year) return filters.year;
    return 'Zeitraum';
  }, [filters.year, filters.month, filters.dateFrom, filters.dateTo]);

  // Build display label + selected bank for account
  const { accountLabel, selectedBank } = useMemo(() => {
    if (!filters.account || filters.account === '') return { accountLabel: 'Girokonten', selectedBank: null };
    if (filters.account === 'all') return { accountLabel: 'Alle Konten', selectedBank: null };
    if (filters.account.startsWith('group:')) {
      const g = groups.find(g => String(g.id) === filters.account.slice(6));
      if (g) return { accountLabel: g.name, selectedBank: null };
      return { accountLabel: 'Gruppe', selectedBank: null };
    }
    const acc = accounts.find(a => String(a.id) === filters.account);
    if (acc) return { accountLabel: acc.name, selectedBank: acc.bank };
    return { accountLabel: 'Konto', selectedBank: null };
  }, [filters.account, accounts, groups]);

  const hasFilter = filters.year || filters.month || filters.dateFrom;

  return (
    <div className="px-4 md:px-8 py-3 border-b border-border flex items-center justify-between gap-3 bg-surface sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden text-text-2 hover:text-text transition-colors cursor-pointer p-1 -ml-1 shrink-0"
          aria-label="Menü öffnen"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>
        <h1 className="font-heading font-bold text-[15px] md:text-lg tracking-tight text-text truncate">{title}</h1>
      </div>
      <div className="flex gap-1.5 items-center shrink-0">
        <PeriodPicker
          filters={filters}
          setFilters={setFilters}
          availableYears={availableYears}
          monthsByYear={monthsByYear}
          label={periodLabel}
          hasFilter={!!hasFilter}
        />
        {activeAccounts.length > 0 && (
          <AccountPicker
            filters={filters}
            setFilters={setFilters}
            checkingAccounts={checkingAccounts}
            savingsAccounts={savingsAccounts}
            investmentAccounts={investmentAccounts}
            checkingGroups={checkingGroups}
            savingsGroups={savingsGroups}
            investmentGroups={investmentGroups}
            label={accountLabel}
            selectedBank={selectedBank}
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
  hasFilter: boolean;
}

function PeriodPicker({ filters, setFilters, availableYears, monthsByYear, label, hasFilter }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'quick' | 'range'>(filters.dateFrom ? 'range' : 'quick');
  const ref = useRef<HTMLDivElement>(null);

  const [browseYear, setBrowseYear] = useState(
    filters.year || availableYears[availableYears.length - 1] || '',
  );
  const [rangeFrom, setRangeFrom] = useState(filters.dateFrom || '');
  const [rangeTo, setRangeTo] = useState(filters.dateTo || '');

  useEffect(() => {
    if (open) {
      if (filters.dateFrom) {
        setMode('range');
        setRangeFrom(filters.dateFrom);
        setRangeTo(filters.dateTo || '');
      } else {
        setMode('quick');
        if (filters.year) setBrowseYear(filters.year);
        else if (availableYears.length) setBrowseYear(availableYears[availableYears.length - 1]);
      }
    }
  }, [open]);

  useClickOutside(ref, () => setOpen(false));

  const availableMonths = monthsByYear[browseYear] || [];

  function selectYear(y: string) {
    setBrowseYear(y);
    setFilters({ ...filters, year: y, month: '', dateFrom: undefined, dateTo: undefined });
  }

  function selectMonth(m: number) {
    setFilters({ ...filters, year: browseYear, month: String(m), dateFrom: undefined, dateTo: undefined });
    setOpen(false);
  }

  function applyRange() {
    if (!rangeFrom || !rangeTo) return;
    setFilters({ ...filters, year: '', month: '', dateFrom: rangeFrom, dateTo: rangeTo });
    setOpen(false);
  }

  function clearFilters(e: React.MouseEvent) {
    e.stopPropagation();
    setFilters({ ...filters, year: '', month: '', dateFrom: undefined, dateTo: undefined });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`
          group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium
          transition-all duration-200 cursor-pointer select-none border
          ${hasFilter
            ? 'bg-accent/8 border-accent/20 text-accent hover:bg-accent/12'
            : 'bg-surface-2 border-border text-text-2 hover:text-text hover:border-border-2 hover:bg-white'
          }
        `}
      >
        <Calendar size={13} className={hasFilter ? 'text-accent' : 'text-text-3 group-hover:text-text-2'} />
        <span className="max-w-[140px] truncate">{label}</span>
        {hasFilter ? (
          <span
            onClick={clearFilters}
            className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20 transition-colors"
          >
            <X size={11} />
          </span>
        ) : (
          <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
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
          {/* Mode tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setMode('quick')}
              className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors cursor-pointer ${mode === 'quick' ? 'text-accent border-b-2 border-accent' : 'text-text-3 hover:text-text'}`}
            >
              Monat / Jahr
            </button>
            <button
              onClick={() => setMode('range')}
              className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors cursor-pointer ${mode === 'range' ? 'text-accent border-b-2 border-accent' : 'text-text-3 hover:text-text'}`}
            >
              Zeitraum
            </button>
          </div>

          {mode === 'quick' ? (
            <>
              {/* Year strip */}
              <div className="flex gap-1 px-3 pt-3 pb-2 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => { setFilters({ ...filters, year: '', month: '', dateFrom: undefined, dateTo: undefined }); setOpen(false); }}
                  className={`
                    shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer
                    ${!filters.year && !filters.dateFrom
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
            </>
          ) : (
            /* ── Date range mode ── */
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-text-3 uppercase tracking-wide mb-1">Von</label>
                  <input
                    type="date"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-surface-2 border border-border text-[12px] text-text outline-none focus:border-accent transition-colors"
                  />
                </div>
                <ArrowRight size={14} className="text-text-3 mt-4 shrink-0" />
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-text-3 uppercase tracking-wide mb-1">Bis</label>
                  <input
                    type="date"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-surface-2 border border-border text-[12px] text-text outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>
              {/* Quick range presets */}
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: 'Letzte 30 Tage', days: 30 },
                  { label: 'Letzte 90 Tage', days: 90 },
                  { label: 'Letzte 6 Monate', days: 182 },
                  { label: 'Letztes Jahr', days: 365 },
                ].map(p => {
                  const to = new Date();
                  const from = new Date();
                  from.setDate(from.getDate() - p.days);
                  const fromStr = from.toISOString().slice(0, 10);
                  const toStr = to.toISOString().slice(0, 10);
                  return (
                    <button
                      key={p.days}
                      onClick={() => { setRangeFrom(fromStr); setRangeTo(toStr); }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                        rangeFrom === fromStr && rangeTo === toStr
                          ? 'bg-accent/10 text-accent'
                          : 'bg-surface-2 text-text-3 hover:text-text hover:bg-surface-2/80'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={applyRange}
                disabled={!rangeFrom || !rangeTo}
                className="w-full py-2 rounded-lg text-[12px] font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Anwenden
              </button>
            </div>
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
  investmentAccounts: { id: number; name: string; bank: string; account_type: string }[];
  checkingGroups: { id: number; name: string; accounts: { id: number }[]; transaction_count: number }[];
  savingsGroups: { id: number; name: string; accounts: { id: number }[]; transaction_count: number }[];
  investmentGroups: { id: number; name: string; accounts: { id: number }[]; transaction_count: number }[];
  label: string;
  selectedBank: string | null;
}

function AccountPicker({ filters, setFilters, checkingAccounts, savingsAccounts, investmentAccounts, checkingGroups, savingsGroups, investmentGroups, label, selectedBank }: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));

  const isFiltered = filters.account !== '' && filters.account !== undefined;

  function select(value: string) {
    setFilters({ ...filters, account: value });
    setOpen(false);
  }

  const hasChecking = checkingAccounts.length > 0 || checkingGroups.length > 0;
  const hasSavings = savingsAccounts.length > 0 || savingsGroups.length > 0;
  const hasInvestment = investmentAccounts.length > 0 || investmentGroups.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`
          group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium
          transition-all duration-200 cursor-pointer select-none border
          ${isFiltered
            ? 'bg-accent/8 border-accent/20 text-accent hover:bg-accent/12'
            : 'bg-surface-2 border-border text-text-2 hover:text-text hover:border-border-2 hover:bg-white'
          }
        `}
      >
        {selectedBank ? (
          <BankLogo bank={selectedBank} size={16} />
        ) : (
          <Landmark size={13} className={isFiltered ? 'text-accent' : 'text-text-3 group-hover:text-text-2'} />
        )}
        <span className="max-w-[100px] truncate hidden sm:inline">{label}</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
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
              sub="Inkl. Sparkonten & Depots"
            />
          </div>

          {hasChecking && (
            <>
              <div className="h-px bg-border mx-2" />
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Girokonten</span>
              </div>
              <div className="px-2 pb-2">
                {checkingGroups.map(g => (
                  <AccountOption
                    key={`group-${g.id}`}
                    active={filters.account === `group:${g.id}`}
                    onClick={() => select(`group:${g.id}`)}
                    label={g.name}
                    sub={`Gruppe · ${g.accounts.length} Konten`}
                    isGroup
                  />
                ))}
                {checkingAccounts.map(a => (
                  <AccountOption
                    key={a.id}
                    active={filters.account === String(a.id)}
                    onClick={() => select(String(a.id))}
                    label={a.name}
                    sub={a.bank}
                    bank={a.bank}
                  />
                ))}
              </div>
            </>
          )}

          {hasSavings && (
            <>
              <div className="h-px bg-border mx-2" />
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Sparkonten</span>
              </div>
              <div className="px-2 pb-2">
                {savingsGroups.map(g => (
                  <AccountOption
                    key={`group-${g.id}`}
                    active={filters.account === `group:${g.id}`}
                    onClick={() => select(`group:${g.id}`)}
                    label={g.name}
                    sub={`Gruppe · ${g.accounts.length} Konten`}
                    isGroup
                  />
                ))}
                {savingsAccounts.map(a => (
                  <AccountOption
                    key={a.id}
                    active={filters.account === String(a.id)}
                    onClick={() => select(String(a.id))}
                    label={a.name}
                    sub={a.bank}
                    bank={a.bank}
                  />
                ))}
              </div>
            </>
          )}

          {hasInvestment && (
            <>
              <div className="h-px bg-border mx-2" />
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Depots</span>
              </div>
              <div className="px-2 pb-2">
                {investmentGroups.map(g => (
                  <AccountOption
                    key={`group-${g.id}`}
                    active={filters.account === `group:${g.id}`}
                    onClick={() => select(`group:${g.id}`)}
                    label={g.name}
                    sub={`Gruppe · ${g.accounts.length} Konten`}
                    isGroup
                  />
                ))}
                {investmentAccounts.map(a => (
                  <AccountOption
                    key={a.id}
                    active={filters.account === String(a.id)}
                    onClick={() => select(String(a.id))}
                    label={a.name}
                    sub={a.bank}
                    bank={a.bank}
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

function AccountOption({ active, onClick, label, sub, bank, isGroup }: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  bank?: string;
  isGroup?: boolean;
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
      {bank ? (
        <BankLogo bank={bank} size={24} />
      ) : isGroup ? (
        <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <FolderOpen size={12} className="text-accent" />
        </div>
      ) : (
        <div
          className={`
            w-2 h-2 rounded-full shrink-0 transition-colors
            ${active ? 'bg-accent' : 'bg-border-2'}
          `}
        />
      )}
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
