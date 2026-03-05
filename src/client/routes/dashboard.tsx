import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Wallet,
  Receipt,
} from 'lucide-react';
import {
  useMonthlyAnalysis,
  useCategories,
  useSummary,
  useTransactions,
} from '../api/hooks';
import { TrendStatCard } from '../components/dashboard/TrendStatCard';
import { AreaChart } from '../components/dashboard/AreaChart';
import { SavingsRing } from '../components/dashboard/SavingsRing';
import { CategoryBreakdown } from '../components/dashboard/CategoryBreakdown';
import { RecentTransactions } from '../components/dashboard/RecentTransactions';
import { SpendingInsights } from '../components/dashboard/SpendingInsights';
import { CashFlowChart } from '../components/dashboard/CashFlowChart';
import { useFilters } from '../lib/filterContext';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const { filters } = useFilters();
  const { data: summary } = useSummary(filters.account);
  const { data: monthly = [] } = useMonthlyAnalysis(filters.account);
  const { data: categories = [] } = useCategories(filters);
  const { data: recentTx = [] } = useTransactions({ ...filters, limit: '10' });

  let filtered = monthly;
  if (filters.year)
    filtered = filtered.filter((r) => r.month?.startsWith(filters.year));
  if (filters.month)
    filtered = filtered.filter((r) =>
      r.month?.endsWith(filters.month.padStart(2, '0')),
    );

  const income = filtered.reduce((s, r) => s + (Number(r.income) || 0), 0);
  const expenses = filtered.reduce((s, r) => s + (Number(r.expenses) || 0), 0);
  const count = filtered.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const balance = income - expenses;

  // Calculate actual savings: debits going to savings-type categories
  const savingsTotal = categories
    .filter(c => c.category_type === 'savings')
    .reduce((s, c) => s + (Number(c.total) || 0), 0);

  let prevIncome = 0;
  let prevExpenses = 0;
  let prevCount = 0;
  if (filters.year && filters.month) {
    const m = parseInt(filters.month);
    const y = parseInt(filters.year);
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    const prevFiltered = monthly.filter(
      (r) => r.month === `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
    );
    prevIncome = prevFiltered.reduce((s, r) => s + (Number(r.income) || 0), 0);
    prevExpenses = prevFiltered.reduce((s, r) => s + (Number(r.expenses) || 0), 0);
    prevCount = prevFiltered.reduce((s, r) => s + (Number(r.count) || 0), 0);
  } else if (filters.year && !filters.month) {
    const prevYear = String(parseInt(filters.year) - 1);
    const prevFiltered = monthly.filter((r) => r.month?.startsWith(prevYear));
    prevIncome = prevFiltered.reduce((s, r) => s + (Number(r.income) || 0), 0);
    prevExpenses = prevFiltered.reduce((s, r) => s + (Number(r.expenses) || 0), 0);
    prevCount = prevFiltered.reduce((s, r) => s + (Number(r.count) || 0), 0);
  }

  const chartData = filters.year
    ? monthly.filter((r) => r.month?.startsWith(filters.year))
    : monthly;

  return (
    <div className="space-y-5">
      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <TrendStatCard
          label="Transaktionen"
          value={count || Number(summary?.stats?.total_transactions) || 0}
          previousValue={prevCount || undefined}
          color="blue"
          icon={<Receipt size={20} />}
          isCurrency={false}
        />
        <TrendStatCard
          label="Einnahmen"
          value={income || Number(summary?.stats?.total_income) || 0}
          previousValue={prevIncome || undefined}
          color="green"
          icon={<ArrowDownLeft size={20} />}
        />
        <TrendStatCard
          label="Ausgaben"
          value={expenses || Number(summary?.stats?.total_expenses) || 0}
          previousValue={prevExpenses || undefined}
          color="red"
          icon={<ArrowUpRight size={20} />}
        />
        <TrendStatCard
          label="Bilanz"
          value={balance}
          color={balance >= 0 ? 'green' : 'red'}
          icon={<Wallet size={20} />}
        />
      </div>

      {/* Main Chart + Savings Ring */}
      <div className="grid grid-cols-[1fr_280px] gap-4">
        <div className="bg-surface rounded-2xl shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <BarChart3 size={16} className="text-text-3" />
              <span className="font-heading font-semibold text-[15px] text-text">
                Einnahmen vs. Ausgaben
              </span>
            </div>
            <span className="text-[12px] text-text-3">
              {chartData.length} Monate
            </span>
          </div>
          <AreaChart data={chartData} />
        </div>

        <div className="bg-surface rounded-2xl shadow-card p-6">
          <div className="font-heading font-semibold text-[15px] text-text mb-4">
            Sparquote
          </div>
          <SavingsRing income={income} expenses={expenses} savingsTotal={savingsTotal} />
        </div>
      </div>

      {/* Categories + Insights + Recent */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface rounded-2xl shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="font-heading font-semibold text-[15px] text-text">
              Top Kategorien
            </span>
            <span className="text-[11px] text-text-3 font-medium">Ausgaben</span>
          </div>
          <CategoryBreakdown categories={categories} />
        </div>

        <div className="bg-surface rounded-2xl shadow-card p-6">
          <div className="font-heading font-semibold text-[15px] text-text mb-5">
            Insights
          </div>
          <SpendingInsights
            monthly={monthly}
            categories={categories}
            income={income}
            expenses={expenses}
          />
        </div>

        <div className="bg-surface rounded-2xl shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-heading font-semibold text-[15px] text-text">
              Letzte Buchungen
            </span>
            <span className="text-[11px] text-text-3 font-medium">{recentTx.length}</span>
          </div>
          <div className="max-h-[380px] overflow-y-auto -mx-1 px-1">
            <RecentTransactions transactions={recentTx} />
          </div>
        </div>
      </div>

      {/* Cash Flow */}
      <div className="bg-surface rounded-2xl shadow-card p-6">
        <div className="flex items-center justify-between mb-5">
          <span className="font-heading font-semibold text-[15px] text-text">
            Netto-Cashflow
          </span>
          <span className="text-[12px] text-text-3">
            Monatlich + kumuliert
          </span>
        </div>
        <CashFlowChart data={chartData} />
      </div>
    </div>
  );
}
