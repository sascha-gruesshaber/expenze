import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface SidebarState {
  collapsed: boolean;
  mobileOpen: boolean;
  toggle: () => void;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

const COLLAPSE_BREAKPOINT = 1280;

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < COLLAPSE_BREAKPOINT);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-collapse on resize
  useEffect(() => {
    function onResize() {
      const isSmall = window.innerWidth < COLLAPSE_BREAKPOINT;
      setCollapsed(isSmall);
      if (!isSmall) setMobileOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close mobile sidebar on route change (handled by consuming components)
  const toggle = useCallback(() => {
    if (window.innerWidth < 768) {
      setMobileOpen(prev => !prev);
    } else {
      setCollapsed(prev => !prev);
    }
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, mobileOpen, toggle, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
