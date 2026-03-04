import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { FilterContext, type FilterState } from '../lib/filterContext';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [filters, setFilters] = useState<FilterState>({ year: '', month: '', account: '' });

  return (
    <FilterContext.Provider value={{ filters, setFilters }}>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar />
        <main className="flex-1 overflow-y-auto flex flex-col">
          <Topbar filters={filters} setFilters={setFilters} />
          <div className="p-6 flex-1">
            <Outlet />
          </div>
        </main>
      </div>
    </FilterContext.Provider>
  );
}
