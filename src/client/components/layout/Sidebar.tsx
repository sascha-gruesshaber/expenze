import { Link, useLocation } from '@tanstack/react-router';
import { LayoutDashboard, ArrowLeftRight, Upload, Landmark, Tag, BarChart2, LogOut, MessageCircle, Settings, PanelLeftClose, PanelLeft, X } from 'lucide-react';
import { useSummary } from '../../api/hooks';
import { fmtDate } from '../../lib/format';
import { useSession, authClient } from '../../lib/auth';
import { useSidebar } from '../../lib/sidebarContext';
import { useEffect } from 'react';

const navSections = [
  {
    label: 'Übersicht',
    items: [
      { to: '/dashboard' as const, icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/analytics' as const, icon: BarChart2, label: 'Analyse' },
      { to: '/chat' as const, icon: MessageCircle, label: 'KI-Assistent' },
    ],
  },
  {
    label: 'Verwaltung',
    items: [
      { to: '/transactions' as const, icon: ArrowLeftRight, label: 'Transaktionen' },
      { to: '/accounts' as const, icon: Landmark, label: 'Konten' },
      { to: '/categories' as const, icon: Tag, label: 'Kategorien' },
      { to: '/import' as const, icon: Upload, label: 'Import' },
      { to: '/settings' as const, icon: Settings, label: 'Einstellungen' },
    ],
  },
];

export function Sidebar() {
  const location = useLocation();
  const { data: summary } = useSummary();
  const stats = summary?.stats;
  const { data: session } = useSession();
  const { collapsed, mobileOpen, toggle, setMobileOpen } = useSidebar();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  const sidebarContent = (
    <aside
      className={`
        flex-shrink-0 bg-surface border-r border-border flex flex-col h-full
        transition-[width] duration-200 ease-in-out
        ${collapsed && !mobileOpen ? 'w-[68px]' : 'w-[240px]'}
      `}
    >
      {/* Header */}
      <div className={`pt-7 pb-6 ${collapsed && !mobileOpen ? 'px-0 flex justify-center' : 'px-6'}`}>
        <div className="font-heading font-extrabold text-xl tracking-tight text-text">
          {collapsed && !mobileOpen ? (
            <span className="text-accent">z</span>
          ) : (
            <>expen<span className="text-accent">z</span>e</>
          )}
        </div>
        {(!collapsed || mobileOpen) && (
          <div className="text-[11px] text-text-3 mt-0.5 font-medium">
            Deine Finanzen im Blick
          </div>
        )}
      </div>

      {/* Nav sections */}
      <nav className="px-2 flex-1">
        {navSections.map((section, idx) => (
          <div key={section.label} className={idx > 0 ? 'mt-4' : ''}>
            {/* Section header */}
            {collapsed && !mobileOpen ? (
              <div className="h-px bg-border mx-2 mb-2" />
            ) : (
              <div className="px-3 pb-1.5 pt-1">
                <span className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">
                  {section.label}
                </span>
              </div>
            )}
            {section.items.map((item) => {
              const isActive =
                location.pathname === item.to ||
                (item.to === '/dashboard' && location.pathname === '/') ||
                (item.to === '/settings' && location.pathname === '/templates');
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={collapsed && !mobileOpen ? item.label : undefined}
                  className={`
                    flex items-center rounded-lg text-[13px] font-medium transition-all cursor-pointer mb-0.5
                    ${collapsed && !mobileOpen
                      ? 'justify-center px-0 py-2.5 mx-1'
                      : 'gap-3 px-3 py-2.5'
                    }
                    ${isActive
                      ? 'text-accent bg-accent/8'
                      : 'text-text-2 hover:text-text hover:bg-surface-2'
                    }
                  `}
                >
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} className="shrink-0" />
                  {(!collapsed || mobileOpen) && item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Stats footer */}
      {(!collapsed || mobileOpen) && (
        <div className="px-6 py-5 border-t border-border">
          {stats ? (
            <div className="text-[12px] text-text-3 leading-relaxed">
              <span className="text-text font-medium">{Number(stats.total_transactions)}</span> Buchungen
              <br />
              <span className="text-text-2">{fmtDate(stats.earliest)} – {fmtDate(stats.latest)}</span>
            </div>
          ) : (
            <div className="text-[12px] text-text-3">Keine Daten</div>
          )}
        </div>
      )}

      {/* User + toggle row */}
      <div className="border-t border-border">
        {session && (!collapsed || mobileOpen) && (
          <div className="px-3 pt-3 pb-1 flex items-center justify-between gap-2">
            <div className="text-[12px] text-text-2 truncate">{session.user.email}</div>
            <button
              onClick={() => authClient.signOut().then(() => { window.location.href = '/login'; })}
              className="text-text-3 hover:text-text transition-colors flex-shrink-0 cursor-pointer"
              title="Abmelden"
            >
              <LogOut size={15} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Collapse toggle (desktop) / Close (mobile) */}
        <div className={`py-2 ${collapsed && !mobileOpen ? 'px-2' : 'px-3'}`}>
          {mobileOpen ? (
            <button
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-text-3 hover:text-text hover:bg-surface-2 transition-all cursor-pointer w-full"
            >
              <X size={18} strokeWidth={1.5} />
              Schließen
            </button>
          ) : (
            <button
              onClick={toggle}
              title={collapsed ? 'Sidebar einblenden' : 'Sidebar ausblenden'}
              className={`
                flex items-center rounded-lg text-[13px] font-medium text-text-3 hover:text-text hover:bg-surface-2 transition-all cursor-pointer
                ${collapsed ? 'justify-center px-0 py-2.5 w-full' : 'gap-3 px-3 py-2.5 w-full'}
              `}
            >
              {collapsed ? (
                <PanelLeft size={18} strokeWidth={1.5} />
              ) : (
                <>
                  <PanelLeftClose size={18} strokeWidth={1.5} />
                  Einklappen
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 animate-slide-in-left">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
