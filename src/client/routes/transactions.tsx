import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { useTransactions, useCategoryList } from '../api/hooks';
import { FilterBar } from '../components/transactions/FilterBar';
import { TransactionTable } from '../components/transactions/TransactionTable';
import { useFilters } from '../lib/filterContext';

export const Route = createFileRoute('/transactions')({
  component: TransactionsPage,
});

function TransactionsPage() {
  const { filters: globalFilters } = useFilters();
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [category, setCategory] = useState('');

  const txFilters = {
    ...globalFilters,
    search,
    direction,
    category,
    limit: '200',
  };

  const { data: transactions = [] } = useTransactions(txFilters);
  const { data: categoryList = [] } = useCategoryList();

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
  }, []);

  return (
    <>
      <FilterBar
        search={search}
        direction={direction}
        category={category}
        categories={categoryList}
        count={transactions.length}
        onSearchChange={handleSearch}
        onDirectionChange={setDirection}
        onCategoryChange={setCategory}
      />
      <div className="bg-surface rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <TransactionTable transactions={transactions} />
        </div>
      </div>
    </>
  );
}
