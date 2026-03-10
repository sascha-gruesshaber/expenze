import { Link, useLocation } from '@tanstack/react-router';
import { LayoutDashboard, ArrowLeftRight, Upload, Landmark, Tag, Trash2, BarChart2, FileCode2, LogOut, MessageCircle, Settings } from 'lucide-react';
import { useSummary } from '../../api/hooks';
import { fmtDate } from '../../lib/format';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AiModelSwitcher } from './AiModelSwitcher';
import { useSession, authClient } from '../../lib/auth';

const navItems = [
  { to: '/dashboard' as const, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analytics' as const, icon: BarChart2, label: 'Analyse' },
  { to: '/chat' as const, icon: MessageCircle, label: 'KI-Assistent' },
  { to: '/transactions' as const, icon: ArrowLeftRight, label: 'Transaktionen' },
  { to: '/accounts' as const, icon: Landmark, label: 'Konten' },
  { to: '/categories' as const, icon: Tag, label: 'Kategorien' },
  { to: '/import' as const, icon: Upload, label: 'Import' },
  { to: '/templates' as const, icon: FileCode2, label: 'Bank-Templates' },
  { to: '/settings' as const, icon: Settings, label: 'Einstellungen' },
];

export function Sidebar() {
  const location = useLocation();
  const { data: summary } = useSummary();
  const stats = summary?.stats;
  const queryClient = useQueryClient();
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { data: session } = useSession();

  async function handleReset() {
    setResetting(true);
    try {
      await fetch('/api/reset', { method: 'DELETE' });
      queryClient.invalidateQueries();
      setShowReset(false);
    } finally {
      setResetting(false);
    }
  }

  return (
    <aside className="w-[240px] flex-shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="px-6 pt-7 pb-6">
        <div className="font-heading font-extrabold text-xl tracking-tight text-text">
          expen<span className="text-accent">z</span>e
        </div>
        <div className="text-[11px] text-text-3 mt-0.5 font-medium">
          Deine Finanzen im Blick
        </div>
      </div>
      <nav className="px-3 flex-1">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.to ||
            (item.to === '/dashboard' && location.pathname === '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer mb-0.5 ${
                isActive
                  ? 'text-accent bg-accent/8'
                  : 'text-text-2 hover:text-text hover:bg-surface-2'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
              {item.label}
            </Link>
          );
        })}
      </nav>
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
      <div className="px-3 pb-1">
        <AiModelSwitcher />
      </div>
      <div className="px-3 pb-1">
        <button
          onClick={() => setShowReset(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer w-full text-text-3 hover:text-red-400 hover:bg-red-500/8"
        >
          <Trash2 size={18} strokeWidth={1.5} />
          Daten zurücksetzen
        </button>
      </div>
      {session && (
        <div className="px-3 py-3 border-t border-border flex items-center justify-between gap-2">
          <div className="text-[12px] text-text-2 truncate">{session.user.email}</div>
          <button
            onClick={() => authClient.signOut().then(() => { window.location.href = '/login'; })}
            className="text-text-3 hover:text-text transition-colors flex-shrink-0"
            title="Abmelden"
          >
            <LogOut size={15} strokeWidth={1.5} />
          </button>
        </div>
      )}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-border rounded-xl p-6 w-[360px] shadow-xl">
            <h3 className="text-base font-semibold text-text mb-2">Alle Daten löschen?</h3>
            <p className="text-[13px] text-text-2 mb-5 leading-relaxed">
              Alle Transaktionen, Konten, Kategorieregeln und Importprotokolle werden unwiderruflich gelöscht.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowReset(false)}
                disabled={resetting}
                className="px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-4 py-2 text-[13px] font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {resetting ? 'Lösche…' : 'Alles löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
