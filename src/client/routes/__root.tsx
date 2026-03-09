import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { FilterContext, type FilterState } from '../lib/filterContext';
import { BatchCategorizationDialog } from '../components/categories/BatchCategorizationDialog';
import { BatchFloatingIndicator } from '../components/layout/BatchFloatingIndicator';
import { useSession } from '../lib/auth';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [filters, setFilters] = useState<FilterState>({ year: '', month: '', account: '' });
  const { data: session, isPending } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const isLoginPage = location.pathname === '/login';

  useEffect(() => {
    if (!isPending && !session && !isLoginPage) {
      navigate({ to: '/login' });
    }
  }, [isPending, session, isLoginPage, navigate]);

  // Login page: render without layout
  if (isLoginPage) {
    return <Outlet />;
  }

  // Loading state
  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-text-3 text-sm">Laden...</div>
      </div>
    );
  }

  // Not authenticated: show nothing while redirecting
  if (!session) {
    return null;
  }

  // Authenticated: full layout
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
      <BatchCategorizationDialog />
      <BatchFloatingIndicator />
    </FilterContext.Provider>
  );
}
