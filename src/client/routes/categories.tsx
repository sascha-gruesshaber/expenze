import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Sparkles } from 'lucide-react';
import { CategoryOverviewTable } from '../components/categories/CategoryOverviewTable';
import { useCategoryOverview, useCreateCategory } from '../api/hooks';
import { useBatchContext } from '../lib/batchContext';
import { useToast } from '../components/layout/Toast';
import { useFilters } from '../lib/filterContext';

export const Route = createFileRoute('/categories')({
  component: CategoriesPage,
});

function CategoriesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const { filters } = useFilters();
  const { data: overview = [] } = useCategoryOverview(filters);
  const createCategory = useCreateCategory();
  const { openDialog } = useBatchContext();
  const { toast } = useToast();

  const sonstigesEntry = overview.find(c => c.category === 'Sonstiges');
  const sonstigesCount = sonstigesEntry?.tx_count ?? 0;

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createCategory.mutate(trimmed, {
      onSuccess: () => {
        toast('Kategorie erstellt');
        setNewName('');
        setShowCreate(false);
      },
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-[13px] font-medium text-text bg-surface border border-border rounded-xl hover:bg-surface-2/50 transition-colors inline-flex items-center gap-2"
        >
          <Plus size={14} />
          Neue Kategorie
        </button>
        <button
          onClick={openDialog}
          disabled={sonstigesCount === 0}
          className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-xl hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
        >
          <Sparkles size={14} />
          KI-Kategorisierung
          {sonstigesCount > 0 && (
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[11px]">{sonstigesCount}</span>
          )}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 flex items-center gap-2 bg-surface border border-accent/30 rounded-xl px-4 py-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreate(false); setNewName(''); } }}
            placeholder="Kategoriename..."
            autoFocus
            className="flex-1 text-[13px] bg-transparent border-none outline-none text-text placeholder:text-text-3"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || createCategory.isPending}
            className="px-3 py-1.5 text-[12px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            Erstellen
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewName(''); }}
            className="px-3 py-1.5 text-[12px] text-text-3 hover:text-text transition-colors"
          >
            Abbrechen
          </button>
        </div>
      )}

      <CategoryOverviewTable filters={filters} />
    </div>
  );
}
